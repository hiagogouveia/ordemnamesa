/**
 * CONTRATO ÚNICO das notificações — a fonte da verdade compartilhada.
 *
 * Este módulo é ISOMÓRFICO de propósito: sem `server-only`, sem `next/navigation`,
 * sem acesso a banco. Ele é importado pelos EMISSORES (rotas de API, materializador)
 * e pelo RESOLVER/UI. É essa importação em comum que impede backend e frontend de
 * divergirem — `strict: true` está ligado, então a divergência QUEBRA O BUILD.
 *
 * NÃO importe este arquivo via `@/lib/notifications` (o index é server-only).
 * Importe direto: `@/lib/notifications/contract`.
 *
 * ── Como adicionar um tipo de notificação ────────────────────────────────────
 * 1. Adicione a chave em `NotificationPayloadMap` (aqui).
 * 2. O TypeScript passa a exigir, e o build quebra até você preencher:
 *      - o descriptor  (registry.ts)     → ícone, cor, prioridade, agrupamento, texto
 *      - o resolver    (navigation.ts)   → para onde o clique leva
 *      - o parser      (parse.ts)        → como ler o JSONB do banco com segurança
 * Nada além disso. O compilador cobra cada um dos quatro.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Prioridade
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationPriority = "critical" | "high" | "normal" | "low";

/** Espelha a coluna gerada `priority_rank` (s90). Menor = mais urgente. */
export const PRIORITY_RANK: Record<NotificationPriority, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Payloads — SÓ IDs e o mínimo de texto para renderizar o card sem N+1 queries.
//
// Regra dura: a navegação NUNCA depende de texto. Os campos `*_name`/`excerpt`
// existem apenas para desenhar o card; quem resolve o destino são os IDs.
// ─────────────────────────────────────────────────────────────────────────────

/** Severidade da ocorrência. 'blocker' = impedimento (trava a operação). */
export type IssueSeverity = "normal" | "blocker";

export interface IssuePayload {
    issue_id: string;
    checklist_id: string;
    /** `null` quando a ocorrência foi reportada fora de uma assumption. */
    checklist_assumption_id: string | null;
    /** 'YYYY-MM-DD' no fuso do restaurante. É o que destrava o histórico. */
    date_key: string;
    task_id: string;
    severity: IssueSeverity;
    reported_by_user_id: string;
    // ── texto de apresentação (nunca usado para navegar) ──
    checklist_name: string;
    task_title: string;
    reported_by_name: string;
    excerpt: string;
}

export interface RoutineNotePayload {
    checklist_id: string;
    checklist_assumption_id: string | null;
    date_key: string;
    completed_by_user_id: string;
    checklist_name: string;
    completed_by_name: string;
    excerpt: string;
}

export interface RoutineSchedulePayload {
    checklist_id: string;
    checklist_assumption_id: string | null;
    date_key: string;
    checklist_name: string;
    area_name: string | null;
}

export interface TransferPayload {
    checklist_id: string;
    date_key: string;
    to_user_id: string;
    from_user_id: string | null;
    checklist_name: string;
    to_user_name: string;
    from_user_name: string | null;
}

export interface PasswordPayload {
    changed_by_user_id: string;
    /**
     * ISO do instante da troca. Não é decoração: entra na chave de dedup.
     *
     * Sem ele, a chave seria `password:<alvo>:<autor>` — e resetar a senha do MESMO
     * colaborador uma segunda vez colidiria no índice único, deduplicando o evento.
     * O colaborador não receberia o aviso. Num alerta de SEGURANÇA, isso é inaceitável:
     * cada troca é um fato novo e precisa de uma chave nova.
     */
    changed_at: string;
}

/**
 * Payload dos tipos LEGADOS (pré-s90), que só tinham `related_id` solto.
 * Existe para que os mapas exaustivos consigam cobri-los sem inventar dados.
 */
export interface LegacyPayload {
    related_id: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// O MAPA. Única fonte da verdade.
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationPayloadMap {
    /** Ocorrência operacional comum (severity='normal'). */
    ISSUE_REPORTED: IssuePayload;
    /** Impedimento (severity='blocker') — trava a operação. */
    BLOCKER_REPORTED: IssuePayload;
    /** Gestor resolveu a ocorrência — notifica quem reportou. */
    ISSUE_RESOLVED: IssuePayload;
    /** Rotina finalizada COM observação. Nome legado mantido: renomear custaria um
     *  UPDATE de dados e uma janela de risco por zero ganho. */
    TASK_COMPLETED_WITH_NOTE: RoutineNotePayload;
    /** Rotina passou da janela esperada sem conclusão. Único tipo que exige cron:
     *  "atrasado" é estado derivado, o banco nunca registra o instante do atraso. */
    ROUTINE_DELAYED: RoutineSchedulePayload;
    RESPONSIBLE_TRANSFERRED: TransferPayload;
    PASSWORD_CHANGED_BY_ADMIN: PasswordPayload;

    // ── DEPRECADOS ────────────────────────────────────────────────────────────
    // Zero produtores no código (confirmado por auditoria), mas podem existir
    // linhas no banco. Ficam aqui para que os mapas exaustivos os cubram — a UI
    // nunca cai no vazio. `EmittableNotificationType` impede que sejam emitidos.
    NEW_TASK_ASSIGNED: LegacyPayload;
    NEW_TASK_FOR_AREA: LegacyPayload;
}

export type NotificationType = keyof NotificationPayloadMap;

export const DEPRECATED_TYPES = ["NEW_TASK_ASSIGNED", "NEW_TASK_FOR_AREA"] as const;
export type DeprecatedNotificationType = (typeof DEPRECATED_TYPES)[number];

/**
 * O truque central de compat: renderizável, porém NÃO emitível.
 * O emissor só aceita tipos vivos; a UI continua sabendo desenhar os mortos.
 */
export type EmittableNotificationType = Exclude<NotificationType, DeprecatedNotificationType>;

export function isDeprecatedType(type: string): type is DeprecatedNotificationType {
    return (DEPRECATED_TYPES as readonly string[]).includes(type);
}

// ─────────────────────────────────────────────────────────────────────────────
// A notificação tipada (união discriminada)
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationBase {
    id: string;
    restaurant_id: string;
    user_id: string;
    title: string;
    description: string | null;
    priority: NotificationPriority;
    group_key: string | null;
    read: boolean;
    read_at: string | null;
    created_at: string;
    /** Correlation id: 1 evento → N notificações (fan-out). `null` nas legadas. */
    event_id: string | null;
}

export type TypedNotification = {
    [T in NotificationType]: NotificationBase & {
        type: T;
        payload: NotificationPayloadMap[T];
    };
}[NotificationType];

export type NotificationOf<T extends NotificationType> = Extract<TypedNotification, { type: T }>;

/**
 * Linha vinda do banco cujo `type` não está no contrato — de um deploy futuro,
 * de um rollback, ou de um payload corrompido. NUNCA é erro: é renderizada de
 * forma degradada e não-clicável. É a rede que garante "nunca tela branca".
 */
export interface UnknownNotification extends NotificationBase {
    type: "__unknown__";
    rawType: string;
    payload: Record<string, unknown>;
}

export type AnyNotification = TypedNotification | UnknownNotification;

export function isUnknown(n: AnyNotification): n is UnknownNotification {
    return n.type === "__unknown__";
}

// ─────────────────────────────────────────────────────────────────────────────
// Eventos de domínio → notificações
//
// A notificação é CONSEQUÊNCIA do evento. O evento descreve o que aconteceu no
// negócio; quem decide destinatário, prioridade e destino é o materializador.
// ─────────────────────────────────────────────────────────────────────────────

export interface DomainEventPayloadMap {
    IssueReported: IssuePayload;
    IssueResolved: IssuePayload;
    RoutineCompletedWithNote: RoutineNotePayload;
    RoutineDelayed: RoutineSchedulePayload;
    ResponsibleTransferred: TransferPayload;
    PasswordChangedByAdmin: PasswordPayload & { target_user_id: string };
}

export type DomainEventType = keyof DomainEventPayloadMap;

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
    id: string;
    restaurant_id: string;
    event_type: T;
    dedup_key: string;
    payload: DomainEventPayloadMap[T];
    actor_user_id: string | null;
    occurred_at: string;
}

/**
 * Chaves de dedup — DETERMINÍSTICAS, derivadas do domínio.
 *
 * É isto que dá idempotência: retry de rota, double-submit e cron sobreposto
 * produzem a MESMA chave e colidem no índice UNIQUE(event_type, dedup_key).
 * A aplicação nunca precisa "lembrar de checar antes de inserir".
 *
 * `RoutineDelayed` é o caso crítico: o cron roda a cada 5 min, mas a chave
 * inclui o dia — logo, no máximo uma notificação de atraso por rotina/dia.
 */
export const DEDUP_KEYS = {
    IssueReported: (p: IssuePayload) => `issue:${p.issue_id}`,
    IssueResolved: (p: IssuePayload) => `issue-resolved:${p.issue_id}`,
    RoutineCompletedWithNote: (p: RoutineNotePayload) =>
        `note:${p.checklist_id}:${p.date_key}`,
    RoutineDelayed: (p: RoutineSchedulePayload) =>
        `delayed:${p.checklist_id}:${p.date_key}`,
    ResponsibleTransferred: (p: TransferPayload) =>
        `transfer:${p.checklist_id}:${p.to_user_id}:${p.date_key}`,
    // Inclui o instante: cada troca de senha é um fato NOVO. Sem isso, um segundo
    // reset do mesmo colaborador colidiria no índice único e o aviso de segurança
    // seria silenciosamente deduplicado.
    PasswordChangedByAdmin: (p: PasswordPayload & { target_user_id: string }) =>
        `password:${p.target_user_id}:${p.changed_at}`,
} satisfies { [T in DomainEventType]: (p: DomainEventPayloadMap[T]) => string };

export const PAYLOAD_VERSION = 1;
