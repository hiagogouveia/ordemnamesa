import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ReceivingTemplate, ReceivingTemplateTask } from "@/lib/types";

async function getAuthHeaders() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
    return headers;
}

export interface ReceivingTemplateAvailable extends ReceivingTemplate {
    tasks_count: number;
}

/** Lista templates do restaurante (owner/manager). */
export function useReceivingTemplates(restaurantId: string | undefined, includeInactive = false) {
    return useQuery({
        queryKey: ["receiving-templates", restaurantId, includeInactive],
        queryFn: async (): Promise<ReceivingTemplate[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const url = `/api/receiving-templates?restaurant_id=${restaurantId}${includeInactive ? "&include_inactive=true" : ""}`;
            const res = await fetch(url, { headers, cache: "no-store" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao buscar modelos.");
            }
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 60 * 1000,
    });
}

export function useReceivingTemplate(restaurantId: string | undefined, templateId: string | undefined) {
    return useQuery({
        queryKey: ["receiving-template", restaurantId, templateId],
        queryFn: async (): Promise<ReceivingTemplate> => {
            if (!restaurantId || !templateId) throw new Error("ids ausentes");
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/receiving-templates/${templateId}?restaurant_id=${restaurantId}`,
                { headers, cache: "no-store" },
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao buscar modelo.");
            }
            return res.json();
        },
        enabled: !!restaurantId && !!templateId,
        staleTime: 60 * 1000,
    });
}

/** Templates disponíveis HOJE para o user (picker do Meu Turno). */
export function useReceivingTemplatesAvailable(
    restaurantId: string | undefined,
    areaId?: string,
) {
    return useQuery({
        queryKey: ["receiving-templates-available", restaurantId, areaId ?? null],
        queryFn: async (): Promise<ReceivingTemplateAvailable[]> => {
            if (!restaurantId) return [];
            const headers = await getAuthHeaders();
            const url = areaId
                ? `/api/receiving-templates/available?restaurant_id=${restaurantId}&area_id=${areaId}`
                : `/api/receiving-templates/available?restaurant_id=${restaurantId}`;
            const res = await fetch(url, { headers, cache: "no-store" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao buscar modelos disponíveis.");
            }
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 30 * 1000,
    });
}

/**
 * Variante com metadados: além dos templates disponíveis hoje, retorna
 * o total de templates ativos no escopo do user (qualquer dia). Permite
 * diferenciar "nenhum modelo cadastrado" de "nenhum previsto hoje".
 */
export interface ReceivingTemplatesAvailableMeta {
    available: ReceivingTemplateAvailable[];
    total_in_scope: number;
}

export function useReceivingTemplatesAvailableMeta(
    restaurantId: string | undefined,
    areaId?: string,
) {
    return useQuery({
        queryKey: ["receiving-templates-available-meta", restaurantId, areaId ?? null],
        queryFn: async (): Promise<ReceivingTemplatesAvailableMeta> => {
            if (!restaurantId) return { available: [], total_in_scope: 0 };
            const headers = await getAuthHeaders();
            const base = `/api/receiving-templates/available?restaurant_id=${restaurantId}&with_meta=1`;
            const url = areaId ? `${base}&area_id=${areaId}` : base;
            const res = await fetch(url, { headers, cache: "no-store" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao buscar modelos disponíveis.");
            }
            return res.json();
        },
        enabled: !!restaurantId,
        staleTime: 30 * 1000,
    });
}

interface CreateTemplateVars {
    restaurant_id: string;
    name: string;
    description?: string;
    area_id: string;
    role_id?: string | null;
    assigned_to_user_id?: string | null;
    shift?: "morning" | "afternoon" | "evening" | null;
    recurrence: ReceivingTemplate["recurrence"];
    recurrence_config?: ReceivingTemplate["recurrence_config"];
    enforce_sequential_order?: boolean;
    tasks: Array<Partial<ReceivingTemplateTask> & { title: string }>;
}

export function useCreateReceivingTemplate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (vars: CreateTemplateVars): Promise<ReceivingTemplate> => {
            const headers = await getAuthHeaders();
            const res = await fetch("/api/receiving-templates", {
                method: "POST", headers, body: JSON.stringify(vars),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao criar modelo.");
            }
            return res.json();
        },
        onSuccess: (_d, vars) => {
            queryClient.invalidateQueries({ queryKey: ["receiving-templates", vars.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["receiving-templates-available", vars.restaurant_id] });
        },
    });
}

interface UpdateTemplateVars {
    id: string;
    restaurant_id: string;
    name?: string;
    description?: string | null;
    area_id?: string;
    role_id?: string | null;
    assigned_to_user_id?: string | null;
    shift?: "morning" | "afternoon" | "evening" | null;
    recurrence?: ReceivingTemplate["recurrence"];
    recurrence_config?: ReceivingTemplate["recurrence_config"];
    enforce_sequential_order?: boolean;
    active?: boolean;
    tasks?: Array<Partial<ReceivingTemplateTask> & { title: string }>;
}

export function useUpdateReceivingTemplate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (vars: UpdateTemplateVars): Promise<ReceivingTemplate> => {
            const headers = await getAuthHeaders();
            const { id, ...body } = vars;
            const res = await fetch(`/api/receiving-templates/${id}`, {
                method: "PATCH", headers, body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao atualizar modelo.");
            }
            return res.json();
        },
        onSuccess: (_d, vars) => {
            queryClient.invalidateQueries({ queryKey: ["receiving-templates", vars.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["receiving-template", vars.restaurant_id, vars.id] });
            queryClient.invalidateQueries({ queryKey: ["receiving-templates-available", vars.restaurant_id] });
        },
    });
}

export function useArchiveReceivingTemplate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (vars: { id: string; restaurant_id: string }) => {
            const headers = await getAuthHeaders();
            const res = await fetch(
                `/api/receiving-templates/${vars.id}?restaurant_id=${vars.restaurant_id}`,
                { method: "DELETE", headers },
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao arquivar modelo.");
            }
            return res.json();
        },
        onSuccess: (_d, vars) => {
            queryClient.invalidateQueries({ queryKey: ["receiving-templates", vars.restaurant_id] });
            queryClient.invalidateQueries({ queryKey: ["receiving-templates-available", vars.restaurant_id] });
        },
    });
}
