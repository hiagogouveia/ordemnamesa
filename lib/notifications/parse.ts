/**
 * PARSE — a fronteira entre o JSONB do banco e o contrato tipado.
 *
 * Tudo que vem do banco é `unknown` até prova em contrário. Um payload malformado
 * (linha legada, deploy revertido, dado corrompido) NUNCA pode virar exception na
 * UI — vira uma notificação "desconhecida", renderizada de forma degradada e não
 * clicável. É a rede que sustenta o requisito "nunca erro, nunca tela branca".
 *
 * Sem zod: não é dependência do projeto e não vale adicioná-la para 7 formatos.
 * Estes são validadores manuais tipados — mesmo efeito, zero dependência nova.
 */

import {
    type AnyNotification,
    type IssuePayload,
    type IssueSeverity,
    type LegacyPayload,
    type NotificationPayloadMap,
    type NotificationPriority,
    type NotificationType,
    type PasswordPayload,
    type RoutineNotePayload,
    type RoutineSchedulePayload,
    type TransferPayload,
} from "./contract";

// ── primitivos ───────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** String obrigatória e não vazia. */
function str(o: Obj, k: string): string | null {
    const v = o[k];
    return typeof v === "string" && v.length > 0 ? v : null;
}

/** String opcional: ausente/null → null (é um valor válido, não um erro). */
function nstr(o: Obj, k: string): string | null {
    const v = o[k];
    return typeof v === "string" && v.length > 0 ? v : null;
}

/** Texto de apresentação: nunca bloqueia o parse (não é usado para navegar). */
function text(o: Obj, k: string, fallback = ""): string {
    const v = o[k];
    return typeof v === "string" ? v : fallback;
}

// ── parsers por tipo ─────────────────────────────────────────────────────────
//
// Regra: os campos que a NAVEGAÇÃO usa são obrigatórios (faltou → payload inválido).
// Os campos de TEXTO são best-effort (faltou → string vazia, o card ainda renderiza).

function parseIssue(raw: unknown): IssuePayload | null {
    if (!isObj(raw)) return null;
    const issue_id = str(raw, "issue_id");
    const checklist_id = str(raw, "checklist_id");
    const date_key = str(raw, "date_key");
    const task_id = str(raw, "task_id");
    if (!issue_id || !checklist_id || !date_key || !task_id) return null;

    const sev = raw.severity;
    const severity: IssueSeverity = sev === "blocker" ? "blocker" : "normal";

    return {
        issue_id,
        checklist_id,
        checklist_assumption_id: nstr(raw, "checklist_assumption_id"),
        date_key,
        task_id,
        severity,
        reported_by_user_id: text(raw, "reported_by_user_id"),
        checklist_name: text(raw, "checklist_name"),
        task_title: text(raw, "task_title"),
        reported_by_name: text(raw, "reported_by_name"),
        excerpt: text(raw, "excerpt"),
    };
}

function parseRoutineNote(raw: unknown): RoutineNotePayload | null {
    if (!isObj(raw)) return null;
    const checklist_id = str(raw, "checklist_id");
    const date_key = str(raw, "date_key");
    if (!checklist_id || !date_key) return null;
    return {
        checklist_id,
        checklist_assumption_id: nstr(raw, "checklist_assumption_id"),
        date_key,
        completed_by_user_id: text(raw, "completed_by_user_id"),
        checklist_name: text(raw, "checklist_name"),
        completed_by_name: text(raw, "completed_by_name"),
        excerpt: text(raw, "excerpt"),
    };
}

function parseRoutineSchedule(raw: unknown): RoutineSchedulePayload | null {
    if (!isObj(raw)) return null;
    const checklist_id = str(raw, "checklist_id");
    const date_key = str(raw, "date_key");
    if (!checklist_id || !date_key) return null;
    return {
        checklist_id,
        checklist_assumption_id: nstr(raw, "checklist_assumption_id"),
        date_key,
        checklist_name: text(raw, "checklist_name"),
        area_name: nstr(raw, "area_name"),
    };
}

function parseTransfer(raw: unknown): TransferPayload | null {
    if (!isObj(raw)) return null;
    const checklist_id = str(raw, "checklist_id");
    const date_key = str(raw, "date_key");
    const to_user_id = str(raw, "to_user_id");
    if (!checklist_id || !date_key || !to_user_id) return null;
    return {
        checklist_id,
        date_key,
        to_user_id,
        from_user_id: nstr(raw, "from_user_id"),
        checklist_name: text(raw, "checklist_name"),
        to_user_name: text(raw, "to_user_name"),
        from_user_name: nstr(raw, "from_user_name"),
    };
}

function parsePassword(raw: unknown): PasswordPayload | null {
    if (!isObj(raw)) return null;
    return {
        changed_by_user_id: text(raw, "changed_by_user_id"),
        changed_at: text(raw, "changed_at"),
    };
}

/** Legado: o payload não existe; o dado útil está na coluna `related_id`. */
function parseLegacy(raw: unknown): LegacyPayload | null {
    if (!isObj(raw)) return { related_id: null };
    return { related_id: nstr(raw, "related_id") };
}

export const PAYLOAD_PARSERS: {
    [T in NotificationType]: (raw: unknown) => NotificationPayloadMap[T] | null;
} = {
    ISSUE_REPORTED: parseIssue,
    BLOCKER_REPORTED: parseIssue,
    ISSUE_RESOLVED: parseIssue,
    TASK_COMPLETED_WITH_NOTE: parseRoutineNote,
    ROUTINE_DELAYED: parseRoutineSchedule,
    RESPONSIBLE_TRANSFERRED: parseTransfer,
    PASSWORD_CHANGED_BY_ADMIN: parsePassword,
    NEW_TASK_ASSIGNED: parseLegacy,
    NEW_TASK_FOR_AREA: parseLegacy,
};

// ── adapter: linha crua do banco → notificação tipada ────────────────────────

/** O que o SELECT devolve. Colunas legadas incluídas (ainda há dual-write). */
export interface NotificationRow {
    id: string;
    restaurant_id: string;
    user_id: string;
    type: string;
    title: string;
    description?: string | null;
    read: boolean;
    read_at?: string | null;
    created_at: string;
    payload?: unknown;
    priority?: string | null;
    group_key?: string | null;
    event_id?: string | null;
    /** Legado (pré-s90). */
    metadata?: Record<string, unknown> | null;
    related_id?: string | null;
}

const PRIORITIES: readonly string[] = ["critical", "high", "normal", "low"];

function priorityOf(row: NotificationRow): NotificationPriority {
    return PRIORITIES.includes(row.priority ?? "")
        ? (row.priority as NotificationPriority)
        : "normal";
}

/**
 * Converte UMA linha do banco em notificação tipada. NUNCA lança.
 *
 * Usada tanto pelo fetch quanto pelo realtime — de propósito: assim a linha que
 * chega pelo socket e a que chega pela API têm shape idêntico POR CONSTRUÇÃO,
 * e o merge no cache não pode divergir.
 */
export function adaptNotificationRow(row: NotificationRow): AnyNotification {
    const base = {
        id: row.id,
        restaurant_id: row.restaurant_id,
        user_id: row.user_id,
        title: row.title,
        description: row.description ?? null,
        priority: priorityOf(row),
        group_key: row.group_key ?? null,
        read: row.read,
        read_at: row.read_at ?? null,
        created_at: row.created_at,
        event_id: row.event_id ?? null,
    };

    const parser = PAYLOAD_PARSERS[row.type as NotificationType];
    if (!parser) {
        // Tipo fora do contrato: degrada, não quebra.
        return { ...base, type: "__unknown__", rawType: row.type, payload: {} };
    }

    // Compat com as linhas pré-s90: `payload` é '{}' e o dado vive em
    // metadata/related_id. Damos ao parser o melhor material disponível.
    const rawPayload = hasKeys(row.payload)
        ? row.payload
        : { ...(row.metadata ?? {}), related_id: row.related_id ?? null };

    const payload = parser(rawPayload);
    if (payload === null) {
        return { ...base, type: "__unknown__", rawType: row.type, payload: {} };
    }

    return { ...base, type: row.type, payload } as AnyNotification;
}

function hasKeys(v: unknown): boolean {
    return typeof v === "object" && v !== null && Object.keys(v).length > 0;
}
