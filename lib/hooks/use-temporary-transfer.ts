import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { BillingError } from "@/lib/billing/client-errors";
import { TransferResponsibleError } from "@/lib/hooks/use-checklists";
import type {
    TemporaryTransferStatus,
    TemporaryTransferEndedReason,
    TransferReasonCode,
} from "@/lib/utils/temporary-transfer";

/**
 * Sprint 94 — Transferência temporária de responsável.
 *
 * Reusa `TransferResponsibleError` da transferência permanente: os dois fluxos
 * compartilham a validação de destino no backend (`validateTransferTarget`), então
 * compartilham também o formato de erro — inclusive `blocked_routines` no caso de
 * turno incompatível. Um segundo tipo de erro só duplicaria o tratamento na UI.
 */

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    return headers;
}

async function parseError(res: Response, fallback: string): Promise<never> {
    const errData = await res.json().catch(() => ({}));
    if (res.status === 402 && errData?.reason) {
        throw new BillingError(errData.error ?? "Acesso bloqueado pelo plano.", res.status, errData.reason);
    }
    throw new TransferResponsibleError(
        errData.error || fallback,
        errData.code,
        errData.blocked_routines,
    );
}

/**
 * Invalida TODAS as superfícies que exibem responsável.
 *
 * A transferência escreve em `checklist_responsibles`, que alimenta listagem, Meu
 * Turno, kanban e badge — então as quatro precisam recarregar. Mesmo conjunto de
 * chaves da transferência permanente (`useTransferChecklistResponsible`): se um dia
 * uma nova superfície entrar, as duas mutações precisam ganhá-la juntas.
 */
function invalidateResponsibleViews(
    queryClient: ReturnType<typeof useQueryClient>,
    restaurantId: string,
) {
    queryClient.invalidateQueries({ queryKey: ["checklists", restaurantId] });
    queryClient.invalidateQueries({ queryKey: ["kanban", restaurantId] });
    queryClient.invalidateQueries({ queryKey: ["my-activities", restaurantId] });
    queryClient.invalidateQueries({ queryKey: ["my-activities-badge", restaurantId] });
    queryClient.invalidateQueries({ queryKey: ["admin_checklists_status", restaurantId] });
    queryClient.invalidateQueries({ queryKey: ["temporary-transfers"] });
}

export interface CreateTemporaryTransferVariables {
    restaurant_id: string;
    checklist_ids: string[];
    to_user_id: string;
    /** `YYYY-MM-DD` no fuso do restaurante. */
    starts_on: string;
    ends_on: string;
    reason_code?: TransferReasonCode | null;
    reason_note?: string | null;
}

export interface CreateTemporaryTransferResponse {
    transferred_count: number;
    checklist_ids: string[];
    from_user_id: string;
    to_user_id: string;
    starts_on: string;
    ends_on: string;
    /** Quantas já entraram em vigor (janela começando hoje). */
    activated_now: number;
    transfers: Array<{ id: string; checklist_id: string }>;
}

export function useCreateTemporaryTransfer() {
    const queryClient = useQueryClient();

    return useMutation<CreateTemporaryTransferResponse, Error, CreateTemporaryTransferVariables>({
        mutationFn: async (data) => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/checklists/temporary-transfer", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) await parseError(res, "Erro ao agendar a transferência temporária");
            return res.json();
        },
        onSuccess: (_data, variables) => {
            invalidateResponsibleViews(queryClient, variables.restaurant_id);
        },
    });
}

export interface EndTemporaryTransferVariables {
    transferId: string;
    /** Só para invalidar o cache do tenant certo — o backend resolve pelo ledger. */
    restaurant_id: string;
}

export interface EndTemporaryTransferResponse {
    id: string;
    checklist_id: string;
    ended_reason: "cancelled";
    restored_to_user_id: string;
}

/** Encerramento ANTECIPADO: a rotina volta imediatamente ao responsável original. */
export function useEndTemporaryTransfer() {
    const queryClient = useQueryClient();

    return useMutation<EndTemporaryTransferResponse, Error, EndTemporaryTransferVariables>({
        mutationFn: async ({ transferId }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/checklists/temporary-transfer/${transferId}`, {
                method: "DELETE",
                headers,
            });
            if (!res.ok) await parseError(res, "Erro ao encerrar a transferência temporária");
            return res.json();
        },
        onSuccess: (_data, variables) => {
            invalidateResponsibleViews(queryClient, variables.restaurant_id);
        },
    });
}

/** Uma linha do histórico de auditoria de uma rotina. */
export interface TemporaryTransferHistoryEntry {
    id: string;
    checklist_id: string;
    starts_on: string;
    ends_on: string;
    status: TemporaryTransferStatus;
    ended_reason: TemporaryTransferEndedReason | null;
    reason_code: TransferReasonCode | null;
    reason_note: string | null;
    created_at: string;
    activated_at: string | null;
    ended_at: string | null;
    original: { id: string; name: string } | null;
    temporary: { id: string; name: string } | null;
    created_by_user: { id: string; name: string } | null;
    ended_by_user: { id: string; name: string } | null;
}

/** Histórico completo (auditoria) das transferências temporárias de uma rotina. */
export function useTemporaryTransferHistory(checklistId: string | null | undefined) {
    return useQuery<TemporaryTransferHistoryEntry[]>({
        queryKey: ["temporary-transfers", checklistId],
        enabled: !!checklistId,
        queryFn: async () => {
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/checklists/temporary-transfer?checklist_id=${checklistId}`,
                { headers },
            );
            if (!res.ok) await parseError(res, "Erro ao carregar o histórico de transferências");
            const json = await res.json();
            return json.transfers ?? [];
        },
    });
}
