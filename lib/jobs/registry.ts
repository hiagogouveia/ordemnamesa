/**
 * JOB REGISTRY — a fonte ÚNICA de verdade das tarefas agendadas.
 *
 * Substitui o cron via GitHub Actions. Cada job é definido AQUI, no código: intervalo,
 * timeout, política de lock e handler. O banco (`job_state`/`job_runs`) guarda só ESTADO
 * e HISTÓRICO — nunca a definição. Config no banco viraria drift entre ambientes e
 * ficaria fora do git.
 *
 * ── Como adicionar/mudar um job ──────────────────────────────────────────────
 * Uma entrada neste mapa. Ele é indexado por `JobName` (união de tipos), então esquecer
 * um campo NÃO COMPILA — mesmo padrão do contrato de notificações (lib/notifications).
 *
 * Este arquivo é ISOMÓRFICO: sem `server-only`, sem import de banco. Ele descreve os
 * jobs; quem os EXECUTA é o worker (server-only). Assim os health endpoints e os testes
 * podem ler o registry sem arrastar o mundo server.
 */

export type JobName =
    | "domain-events"
    | "admin-notifications"
    | "routines-delayed"
    | "temporary-transfers"
    | "notifications-retention"
    | "photo-retention"
    | "history-retention";

export interface JobDefinition {
    /** Intervalo entre execuções, em segundos. */
    everySeconds: number;
    /** Tempo máximo de uma execução. Estourou → o filho é morto (SIGTERM→SIGKILL). */
    timeoutMs: number;
    /**
     * TTL do lease. INVARIANTE: deve ser > timeoutMs (senão outro worker tomaria o
     * lease enquanto o job ainda roda → execução concorrente). Verificado por assert
     * no fim deste arquivo — não é convenção, é código que quebra.
     */
    lockTtlMs: number;
    /** Teto do backoff exponencial após falhas consecutivas. */
    maxBackoffSeconds: number;
    /** Deleção irreversível → exige --confirm no disparo manual. */
    destructive?: true;
    /** Descrição curta, para o painel e os logs. */
    description: string;
}

/**
 * As 7 definições. Cadências herdadas dos workflows atuais (comprovadamente corretas):
 *   domain-events / admin-notifications  → a cada 5 min   (retry de outbox)
 *   routines-delayed                     → a cada 15 min  (detecção de atraso)
 *   temporary-transfers                  → a cada 15 min  (s94; ver comentário na entrada)
 *   notifications-retention              → diário
 *   photo/history-retention              → semanal
 */
export const JOB_REGISTRY: Record<JobName, JobDefinition> = {
    "domain-events": {
        everySeconds: 5 * 60,
        timeoutMs: 60_000,
        lockTtlMs: 120_000,
        maxBackoffSeconds: 60 * 60,
        description: "Reprocessa eventos de domínio pendentes (rede de segurança do outbox).",
    },
    "admin-notifications": {
        everySeconds: 5 * 60,
        timeoutMs: 60_000,
        lockTtlMs: 120_000,
        maxBackoffSeconds: 60 * 60,
        description: "Reenvia e-mails de lead que falharam no submit (Resend).",
    },
    "routines-delayed": {
        everySeconds: 15 * 60,
        timeoutMs: 5 * 60_000,
        lockTtlMs: 6 * 60_000,
        maxBackoffSeconds: 60 * 60,
        description: "Detecta rotinas atrasadas e emite RoutineDelayed (único produtor).",
    },
    // s94 — 15 min, e NÃO 24 h. O job converge transferências na virada do dia, e
    // "o dia" é o do FUSO DE CADA RESTAURANTE — não existe um instante único em que
    // todas viram. A cadência de 15 min limita a "janela de responsável errado" a 15
    // minutos em qualquer fuso; um job diário erraria por horas nas unidades cujo
    // fuso não coincide com o horário em que ele roda. A varredura é barata: índice
    // parcial só sobre transferências vivas (idx_ctt_open_window).
    "temporary-transfers": {
        everySeconds: 15 * 60,
        timeoutMs: 2 * 60_000,
        lockTtlMs: 3 * 60_000,
        maxBackoffSeconds: 60 * 60,
        description: "Ativa e encerra transferências temporárias de responsável (retorno automático).",
    },
    "notifications-retention": {
        everySeconds: 24 * 60 * 60,
        timeoutMs: 10 * 60_000,
        lockTtlMs: 11 * 60_000,
        maxBackoffSeconds: 6 * 60 * 60,
        description: "Apaga notificações e eventos antigos; limpa job_runs.",
    },
    "photo-retention": {
        everySeconds: 7 * 24 * 60 * 60,
        timeoutMs: 10 * 60_000,
        lockTtlMs: 11 * 60_000,
        maxBackoffSeconds: 6 * 60 * 60,
        description: "Remove fotos de evidência expiradas do Storage.",
    },
    "history-retention": {
        everySeconds: 7 * 24 * 60 * 60,
        timeoutMs: 10 * 60_000,
        lockTtlMs: 11 * 60_000,
        maxBackoffSeconds: 6 * 60 * 60,
        destructive: true, // deleção IRREVERSÍVEL de histórico de execução
        description: "Deleta histórico de execução expirado (IRREVERSÍVEL).",
    },
};

export const JOB_NAMES = Object.keys(JOB_REGISTRY) as JobName[];

export function isJobName(v: string): v is JobName {
    return v in JOB_REGISTRY;
}

/**
 * Backoff exponencial: intervalo normal enquanto não há falhas; depois dobra por falha
 * consecutiva, até o teto. Um job quebrado não roda a cada minuto enchendo job_runs —
 * mas o dead-man's-switch (baseado em `last_success_at`, não no intervalo) continua
 * vendo o job como vencido e alerta.
 *
 * Pura e isomórfica de propósito: o worker usa para agendar, e os testes exercitam sem
 * arrastar o banco.
 */
export function effectiveIntervalMs(
    everySeconds: number,
    maxBackoffSeconds: number,
    consecutiveFailures: number,
): number {
    if (consecutiveFailures <= 0) return everySeconds * 1000;
    const backoff = Math.min(everySeconds * 2 ** consecutiveFailures, maxBackoffSeconds);
    return Math.max(everySeconds, backoff) * 1000;
}

/**
 * Um job está OVERDUE se não teve sucesso dentro de 2× o seu intervalo. Baseada em
 * RESULTADO (last_success_at), não em processo — uma condição só que captura worker morto,
 * worker travado, job em loop de falha e banco inacessível pelo worker.
 *
 * A ÚNICA definição de "overdue" no projeto: o health endpoint (dead-man's-switch) e a
 * página de jobs do Control Hub chamam ESTA função. Duplicá-la criaria duas verdades sobre
 * o que é "atrasado". Pura e isomórfica de propósito (mesmo motivo do effectiveIntervalMs).
 *
 * `lastSuccessAtMs`/`updatedAtMs` em epoch ms (ou null). Job nunca bem-sucedido conta como
 * overdue assim que a linha existe há mais de 2× o intervalo.
 */
export function isJobOverdue(
    def: JobDefinition,
    row: { enabled: boolean; lastSuccessAtMs: number | null; updatedAtMs: number | null },
    nowMs: number,
): boolean {
    if (!row.enabled) return false;
    const staleThreshold = def.everySeconds * 1000 * 2;
    if (row.lastSuccessAtMs === null) {
        return row.updatedAtMs !== null && nowMs - row.updatedAtMs > staleThreshold;
    }
    return nowMs - row.lastSuccessAtMs > staleThreshold;
}

// ── INVARIANTE verificado no import ──────────────────────────────────────────
// lockTtlMs > timeoutMs para TODO job. Se alguém errar, o processo (worker, teste ou
// health endpoint) falha ao carregar este módulo — antes de qualquer job rodar, e não
// em produção às 3 da manhã.
for (const [name, def] of Object.entries(JOB_REGISTRY)) {
    if (def.lockTtlMs <= def.timeoutMs) {
        throw new Error(
            `[jobs] invariante violado em "${name}": lockTtlMs (${def.lockTtlMs}) deve ser > timeoutMs (${def.timeoutMs}). ` +
                `Sem isso, outro worker tomaria o lease enquanto o job ainda roda.`,
        );
    }
}
