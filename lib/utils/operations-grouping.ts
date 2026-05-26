import type { RoutineStateInfo, RoutineStateKind } from "@/lib/utils/routine-state";

/**
 * Item da lista operacional unificada de "Meu Turno".
 * Rotinas e recebimentos compartilham a mesma anatomia visual e classificação por urgência.
 */
export interface OperationItem {
    id: string;
    kind: "routine" | "receiving";
    title: string;
    state: RoutineStateInfo;

    // Ordenação secundária
    start_time?: string | null;
    end_time?: string | null;

    // Quando true, o item já foi concluído (independente do kind).
    done?: boolean;

    // Payload livre para o renderizador (TaskRow lê via props).
    meta: Record<string, unknown>;

    // Callback de click resolvido pelo orquestrador.
    onClick: () => void;
}

export type OperationGroupKey =
    | "blocked"   // impedimento
    | "late"      // atrasada
    | "now"       // em execução ou disponível com janela ativa
    | "scheduled" // futura (horário no futuro)
    | "open"      // disponível sem horário (rotinas livres / receivings sem janela)
    | "done";     // concluída

export interface OperationGroup {
    key: OperationGroupKey;
    label: string;
    items: OperationItem[];
}

const KIND_TO_GROUP: Record<RoutineStateKind, Exclude<OperationGroupKey, "done" | "open">> = {
    blocked: "blocked",
    late: "late",
    doing: "now",
    available: "now",
    future: "scheduled",
};

const GROUP_LABELS: Record<OperationGroupKey, string> = {
    blocked: "Com impedimento",
    late: "Atrasadas",
    now: "Agora",
    scheduled: "Programadas",
    open: "Sem horário",
    done: "Concluídas",
};

const ORDER: OperationGroupKey[] = ["blocked", "late", "now", "scheduled", "open", "done"];

/**
 * Classifica e agrupa itens por urgência. Mantém a ordem visual canônica.
 * Items com `done=true` vão sempre para "done", independente do state.
 */
export function groupOperations(items: OperationItem[]): OperationGroup[] {
    const buckets: Record<OperationGroupKey, OperationItem[]> = {
        blocked: [],
        late: [],
        now: [],
        scheduled: [],
        open: [],
        done: [],
    };

    for (const item of items) {
        if (item.done) {
            buckets.done.push(item);
            continue;
        }
        const target = KIND_TO_GROUP[item.state.kind];
        // "Sem horário" só faz sentido quando o item NÃO tem nenhum horário definido.
        if (target === "now" && item.state.kind === "available" && !item.start_time && !item.end_time) {
            buckets.open.push(item);
        } else {
            buckets[target].push(item);
        }
    }

    // Ordenação interna por horário ascendente (rotinas com horário primeiro).
    for (const key of ORDER) {
        buckets[key].sort((a, b) => {
            const ta = a.start_time ?? "99:99";
            const tb = b.start_time ?? "99:99";
            return ta.localeCompare(tb);
        });
    }

    return ORDER
        .map((key) => ({ key, label: GROUP_LABELS[key], items: buckets[key] }))
        .filter((g) => g.items.length > 0);
}
