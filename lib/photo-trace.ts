/**
 * photo-trace — instrumentação mínima do fluxo de captura/upload de foto.
 *
 * Status neste commit: DEAD CODE. Ninguém importa, ninguém chama. Compila
 * e existe. Ativação ocorre em commits futuros via:
 *   1. `<PhotoTraceProvider />` montado em `app/layout.tsx`
 *   2. Chamadas `bc()` em PhotoUpload e storage.ts
 *   3. Env var `NEXT_PUBLIC_PHOTO_TRACE=on`
 *
 * Filosofia: nunca throw; nunca alterar state React; custo ~ms por chamada;
 * localStorage só recebe write completo em eventos críticos; heartbeat
 * atualiza última timestamp em chave dedicada a cada bc() (sem setInterval).
 */

// ---------- Configuração ----------

const IS_ENABLED = process.env.NEXT_PUBLIC_PHOTO_TRACE === 'on';

const BUFFER_MAX = 200;
const STR_TRUNC = 100;
const UA_TRUNC = 80;
const HEARTBEAT_GAP_MS = 5000;

const LS = {
    CUR: 'photo_trace:cur',
    PREV: 'photo_trace:prev',
    HB: 'photo_trace:hb',
    INFLIGHT: 'photo_trace:inflight',
} as const;

const ENDPOINT = '/api/photo-trace';

/**
 * Eventos cujo write da buffer in-memory para localStorage acontece síncrono
 * dentro de bc(). Demais eventos vivem apenas em memória até o próximo
 * evento crítico (anti-heisenbug: reduz writes ~10x).
 */
const CRITICAL = new Set<string>([
    'boot', 'vis', 'hide', 'show',
    'chg', 'up:s', 'up:end',
    'unmount', 'err:js',
]);

/**
 * Whitelist de chaves permitidas em `meta` por event code. Qualquer valor
 * fora da whitelist é silenciosamente descartado em safeMeta — única
 * camada de defesa contra vazamento de PII / signed URL / token.
 */
const ALLOWED_META: Record<string, readonly string[]> = {
    chg: ['size', 'type'],
    'up:s': ['size', 'type'],
    'up:end': ['ok', 'durationMs', 'errName', 'errMsg'],
    mount: ['taskId'],
    unmount: ['taskId'],
    click: ['slot'],
    vis: ['state'],
    hide: ['persisted'],
    show: ['persisted'],
    boot: ['wasDiscarded', 'navType', 'deviceMemory', 'uaShort', 'verdict', 'prevS'],
    'err:js': ['msg', 'src'],
};

// ---------- Tipos ----------

export type Breadcrumb = {
    s: string;     // sessionId (8 chars hex)
    n: number;     // sequence number, monotônico
    t: number;     // performance.now() — ms desde nav start
    w: number;     // Date.now() — wall clock
    e: string;     // event code
    m?: Record<string, string | number | boolean>;
};

// ---------- Estado de módulo ----------

let started = false;
let sessionId = '';
let seq = 0;
const buffer: Breadcrumb[] = [];

// ---------- Helpers ----------

function genSessionId(): string {
    try {
        const arr = new Uint8Array(4);
        crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    } catch {
        return Math.random().toString(16).slice(2, 10);
    }
}

function lsGet(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}

function lsSet(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* quota, modo privado */ }
}

function lsRemove(key: string): void {
    try { localStorage.removeItem(key); } catch { /* idem */ }
}

function safeMeta(event: string, meta?: object): Breadcrumb['m'] | undefined {
    const allowed = ALLOWED_META[event];
    if (!allowed || !meta || typeof meta !== 'object') return undefined;
    const out: Record<string, string | number | boolean> = {};
    for (const k of allowed) {
        const v = (meta as Record<string, unknown>)[k];
        if (typeof v === 'string') out[k] = v.slice(0, STR_TRUNC);
        else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
        else if (typeof v === 'boolean') out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function flushBufferToLS(): void {
    try { lsSet(LS.CUR, JSON.stringify(buffer)); } catch { /* nunca crashar */ }
}

// ---------- API pública ----------

/**
 * Registra um breadcrumb. Síncrono, nunca throws, no-op se desabilitado
 * por env var ou se boot() ainda não rodou.
 *
 * Eventos críticos (ver CRITICAL set) disparam flush completo do buffer
 * para localStorage. Demais eventos ficam apenas em memória.
 *
 * A chave heartbeat (`photo_trace:hb`) é atualizada em TODA chamada —
 * write tiny (~50 bytes), serve para detectar morte abrupta sem
 * setInterval / sem wake-up de timer.
 */
export function bc(event: string, meta?: object): void {
    if (!IS_ENABLED || !started) return;
    try {
        const m = safeMeta(event, meta);
        const entry: Breadcrumb = {
            s: sessionId,
            n: seq++,
            t: Math.round(performance.now() * 10) / 10,
            w: Date.now(),
            e: event,
            ...(m ? { m } : {}),
        };
        buffer.push(entry);
        if (buffer.length > BUFFER_MAX) buffer.shift();

        // Heartbeat: última timestamp viva desta sessão. Sempre escreve.
        lsSet(LS.HB, `${sessionId}|${Date.now()}`);

        if (CRITICAL.has(event)) flushBufferToLS();
    } catch {
        /* instrumentação nunca propaga erro ao app */
    }
}

/**
 * Inicializa a instrumentação. Idempotente. Lê a sessão anterior do
 * localStorage, classifica, envia via sendBeacon, registra listeners
 * globais de page lifecycle, e loga o primeiro evento `boot` da
 * sessão atual. No-op se desabilitado por env var.
 *
 * IMPORTANTE: todos os listeners globais são registrados aqui dentro.
 * Antes de boot() ser chamado, NENHUM listener está ativo.
 */
export function boot(): void {
    if (!IS_ENABLED) return;
    if (started) return;
    started = true;

    try {
        sessionId = genSessionId();
        seq = 0;

        // 1. Lê estado da sessão anterior ANTES de qualquer write nova.
        const prevRaw = lsGet(LS.CUR);
        const hbRaw = lsGet(LS.HB);
        const inflightRaw = lsGet(LS.INFLIGHT);

        let prevBcs: Breadcrumb[] = [];
        if (prevRaw) {
            try { prevBcs = JSON.parse(prevRaw) as Breadcrumb[]; }
            catch { prevBcs = []; }
        }

        const verdict = diagnose(prevBcs, hbRaw, inflightRaw);
        const prevS = prevBcs[0]?.s;

        // 2. Move cur → prev; limpa marcadores que pertenciam à anterior.
        if (prevRaw) lsSet(LS.PREV, prevRaw);
        lsRemove(LS.CUR);
        lsRemove(LS.INFLIGHT);

        // 3. Loga `boot` da nova sessão (crítico → flush imediato).
        const nav = (typeof performance !== 'undefined'
            ? performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
            : undefined);
        const wasDiscarded = (document as { wasDiscarded?: boolean }).wasDiscarded === true;
        const uaShort = (navigator.userAgent ?? '').slice(0, UA_TRUNC);
        const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory;

        bc('boot', {
            wasDiscarded,
            navType: nav?.type ?? 'unknown',
            uaShort,
            ...(typeof deviceMemory === 'number' ? { deviceMemory } : {}),
            verdict,
            ...(prevS ? { prevS } : {}),
        });

        // 4. Best-effort: envia sessão anterior via sendBeacon.
        if (prevBcs.length > 0) sendPrev(prevBcs, verdict);

        // 5. Registra listeners globais — só a partir daqui ficam ativos.
        window.addEventListener('visibilitychange', onVisibility, { passive: true });
        window.addEventListener('pagehide', onPagehide, { passive: true });
        window.addEventListener('pageshow', onPageshow, { passive: true });
        window.addEventListener('error', onWindowError);
    } catch {
        /* boot nunca derruba o app */
    }
}

// ---------- Diagnose ----------

/**
 * Classifica como a sessão anterior terminou, usando 4 sinais:
 *   - inflight marker (set/clear por storage.ts em commit futuro)
 *   - document.wasDiscarded (Chrome)
 *   - performance.navigation.type
 *   - presença/ausência de evento `hide` no buffer
 *   - gap do heartbeat
 *
 * Veredictos: no_prev | crash_during_upload | discard | reload |
 *             abandoned_during_upload | clean_nav | crash_or_kill |
 *             unmount | unknown
 */
function diagnose(prev: Breadcrumb[], hbRaw: string | null, inflightRaw: string | null): string {
    if (!prev || prev.length === 0) return 'no_prev';

    if (inflightRaw) return 'crash_during_upload';

    if ((document as { wasDiscarded?: boolean }).wasDiscarded === true) return 'discard';

    const nav = (typeof performance !== 'undefined'
        ? performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
        : undefined);
    if (nav?.type === 'reload') return 'reload';

    const hadHide = prev.some(b => b.e === 'hide');
    if (hadHide) {
        const beforeHide = [...prev].reverse().find(b => b.e !== 'hide');
        if (beforeHide?.e === 'up:s') return 'abandoned_during_upload';
        return 'clean_nav';
    }

    const last = prev[prev.length - 1];
    const hbTime = hbRaw ? Number(hbRaw.split('|')[1] ?? 0) : 0;
    if (hbTime && Date.now() - hbTime > HEARTBEAT_GAP_MS) return 'crash_or_kill';
    if (last.e === 'up:s' || last.e === 'chg') return 'crash_during_upload';
    if (last.e === 'unmount') return 'unmount';
    return 'unknown';
}

// ---------- Listeners ----------

function onVisibility(): void {
    try { bc('vis', { state: document.visibilityState }); } catch { /**/ }
}

function onPagehide(e: PageTransitionEvent): void {
    try {
        bc('hide', { persisted: e.persisted });
        sendCurrent('pagehide');
    } catch { /**/ }
}

function onPageshow(e: PageTransitionEvent): void {
    try { bc('show', { persisted: e.persisted }); } catch { /**/ }
}

function onWindowError(e: ErrorEvent): void {
    try {
        bc('err:js', {
            msg: e.message ?? '',
            src: e.filename ?? '',
        });
    } catch { /**/ }
}

// ---------- Beacons ----------

function sendCurrent(reason: string): void {
    try {
        const payload = JSON.stringify({
            s: sessionId,
            ua: (navigator.userAgent ?? '').slice(0, UA_TRUNC),
            reason,
            bcs: buffer,
        });
        if (typeof navigator.sendBeacon === 'function') {
            navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
        }
    } catch { /**/ }
}

function sendPrev(bcs: Breadcrumb[], verdict: string): void {
    try {
        const payload = JSON.stringify({
            s: bcs[0]?.s ?? 'unknown',
            ua: (navigator.userAgent ?? '').slice(0, UA_TRUNC),
            reason: 'recover',
            verdict,
            bcs,
        });
        if (typeof navigator.sendBeacon === 'function') {
            navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
        }
        lsRemove(LS.PREV);
    } catch { /**/ }
}
