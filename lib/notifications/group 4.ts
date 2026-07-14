/**
 * AGRUPAMENTO e ORDENAÇÃO da lista de notificações.
 *
 * O `group_key` é computado no EMIT e persistido (determinístico). Aqui o cliente
 * apenas agrupa por IGUALDADE de chave — ele nunca inventa lógica de agrupamento,
 * nem tenta adivinhar semelhança por texto.
 *
 * Por que agrupar no cliente e não em SQL: agrupar em SQL complicaria paginação,
 * `unread_count` e a semântica de marcar-como-lida, para ganho nulo numa página de
 * 30–50 itens. Trade-off assumido: um grupo pode ser cortado na fronteira da
 * paginação — invisível na prática, porque re-agrupamos sobre o array acumulado.
 */

import { type AnyNotification, PRIORITY_RANK } from "./contract";

/** Abaixo disso, agrupar só atrapalha (esconde item sem reduzir poluição). */
export const MIN_GROUP_SIZE = 3;

export interface NotificationGroup {
    kind: "group";
    /** `group_key` compartilhado por todos os membros. */
    key: string;
    /** Ordenados pelo mesmo critério da lista. O primeiro define a posição do grupo. */
    items: AnyNotification[];
    count: number;
    unreadCount: number;
}

export interface NotificationSingle {
    kind: "single";
    item: AnyNotification;
}

export type NotificationListEntry = NotificationGroup | NotificationSingle;

/**
 * Ordem canônica — a MESMA do SQL (`read, priority_rank, created_at DESC`), para
 * que a lista não "salte" quando o realtime insere no cache sem refetch.
 *
 * Dois blocos: não-lidas primeiro (crítico → baixo, e dentro de cada prioridade,
 * recente primeiro), depois as lidas em ordem cronológica. Isso atende "ordenar por
 * prioridade antes do horário" sem enterrar uma crítica nova nem fixar uma antiga
 * de baixa prioridade no topo para sempre.
 */
export function compareNotifications(a: AnyNotification, b: AnyNotification): number {
    if (a.read !== b.read) return a.read ? 1 : -1;
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    return b.created_at.localeCompare(a.created_at);
}

export function sortNotifications(items: AnyNotification[]): AnyNotification[] {
    return [...items].sort(compareNotifications);
}

/**
 * Agrupa por `group_key`. Chaves com menos de `MIN_GROUP_SIZE` membros voltam como
 * itens individuais. Notificações com `group_key === null` nunca agrupam.
 *
 * A posição do grupo na lista é a do seu membro mais bem ranqueado — assim um
 * grupo com um impedimento crítico não afunda por causa dos irmãos normais.
 */
export function groupNotifications(items: AnyNotification[]): NotificationListEntry[] {
    const sorted = sortNotifications(items);

    const buckets = new Map<string, AnyNotification[]>();
    for (const n of sorted) {
        if (!n.group_key) continue;
        const list = buckets.get(n.group_key);
        if (list) list.push(n);
        else buckets.set(n.group_key, [n]);
    }

    const grouped = new Set<string>();
    for (const [key, list] of buckets) {
        if (list.length >= MIN_GROUP_SIZE) grouped.add(key);
    }

    const entries: NotificationListEntry[] = [];
    const emitted = new Set<string>();

    // Percorre na ordem já canônica: a primeira ocorrência de uma chave agrupada
    // define onde o grupo aparece — que é justamente a posição do melhor membro.
    for (const n of sorted) {
        const key = n.group_key;
        if (key && grouped.has(key)) {
            if (emitted.has(key)) continue;
            emitted.add(key);
            const list = buckets.get(key)!;
            entries.push({
                kind: "group",
                key,
                items: list,
                count: list.length,
                unreadCount: list.filter((i) => !i.read).length,
            });
            continue;
        }
        entries.push({ kind: "single", item: n });
    }

    return entries;
}

/** Contagem de não-lidas de uma lista (fonte única para o badge do sino). */
export function countUnread(items: AnyNotification[]): number {
    return items.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reducers de cache do realtime.
//
// O realtime NUNCA substitui o cache — ele faz MERGE POR ID. Isso mata a race
// sutil: um refetch iniciado ANTES do INSERT commitar e resolvido DEPOIS traria
// um snapshot sem a linha nova e a apagaria. Com merge, a linha não se perde.
// E porque não há refetch, a lista não é remontada ⇒ o scroll é preservado.
// ─────────────────────────────────────────────────────────────────────────────

/** Insere (ou ignora, se já existe) mantendo a ordem canônica. Idempotente. */
export function applyRealtimeInsert(
    items: AnyNotification[],
    incoming: AnyNotification,
    pageSize: number,
): AnyNotification[] {
    if (items.some((n) => n.id === incoming.id)) return items;
    return sortNotifications([incoming, ...items]).slice(0, pageSize);
}

/** Patch de uma linha existente (tipicamente `read`/`read_at`). Sem refetch. */
export function applyRealtimeUpdate(
    items: AnyNotification[],
    incoming: AnyNotification,
): AnyNotification[] {
    let found = false;
    const next = items.map((n) => {
        if (n.id !== incoming.id) return n;
        found = true;
        return incoming;
    });
    if (!found) return items;
    return sortNotifications(next);
}

/** União deduplicada por id — usada ao reconciliar um refetch com o que o socket já trouxe. */
export function mergeNotifications(
    a: AnyNotification[],
    b: AnyNotification[],
    pageSize: number,
): AnyNotification[] {
    const byId = new Map<string, AnyNotification>();
    for (const n of a) byId.set(n.id, n);
    // `b` (servidor) tem precedência: é a verdade mais recente sobre read/read_at.
    for (const n of b) byId.set(n.id, n);
    return sortNotifications([...byId.values()]).slice(0, pageSize);
}
