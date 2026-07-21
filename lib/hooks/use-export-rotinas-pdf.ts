"use client";

import { useCallback, useState } from "react";
import type { Checklist } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { resolveBrand } from "@/lib/branding/resolve";

/**
 * Hook de exportação de rotinas para PDF.
 *
 * Responsabilidades:
 * - resolver o logo do restaurante (consulta pontual à tabela `restaurants`);
 * - acionar a geração do PDF (módulo isolado, carregado dinamicamente);
 * - expor estado de loading e callbacks de sucesso/erro para a UI exibir toast.
 *
 * A montagem do documento fica 100% desacoplada (lib/pdf/rotinas).
 */
export interface ExportRotinasPdfParams {
    checklists: Checklist[];
    restaurantName: string;
    exportedBy: string;
    /** Restaurante atual (visão única). No global pode ser null → sem logo. */
    restaurantId?: string | null;
}

export interface UseExportRotinasPdfOptions {
    onSuccess?: (count: number) => void;
    onError?: (message: string) => void;
}

/**
 * Sprint 93 — resolve a marca do documento pela mesma cascata da interface
 * (filial → grupo → Ordem na Mesa), reusando `resolveBrand` em vez de reimplementar
 * o fallback aqui. Retorna null quando cai na plataforma: o rodapé do PDF já carrega
 * a marca do Ordem na Mesa como emissor, então repeti-la no header seria redundante.
 */
async function fetchLogoUrl(restaurantId: string): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase
            .from("restaurants")
            .select("logo_path, accounts ( logo_path )")
            .eq("id", restaurantId)
            .single<{ logo_path: string | null; accounts: { logo_path: string | null } | null }>();

        const brand = resolveBrand({
            restaurantLogoPath: data?.logo_path ?? null,
            accountLogoPath: data?.accounts?.logo_path ?? null,
            mode: "single",
        });
        return brand.isTenantBranded ? brand.logoSrc : null;
    } catch {
        return null;
    }
}

export function useExportRotinasPdf(options: UseExportRotinasPdfOptions = {}) {
    const { onSuccess, onError } = options;
    const [isExporting, setIsExporting] = useState(false);

    const exportPdf = useCallback(
        async (params: ExportRotinasPdfParams) => {
            if (isExporting) return;
            if (params.checklists.length === 0) {
                onError?.("Selecione ao menos uma rotina para exportar.");
                return;
            }

            setIsExporting(true);
            try {
                const logoUrl = params.restaurantId
                    ? await fetchLogoUrl(params.restaurantId)
                    : null;

                const { generateRotinasPdf } = await import(
                    "@/lib/pdf/rotinas/generate"
                );

                await generateRotinasPdf({
                    checklists: params.checklists,
                    restaurantName: params.restaurantName,
                    exportedBy: params.exportedBy,
                    logoUrl,
                });

                onSuccess?.(params.checklists.length);
            } catch (err) {
                onError?.(
                    err instanceof Error
                        ? err.message
                        : "Não foi possível gerar o PDF. Tente novamente.",
                );
            } finally {
                setIsExporting(false);
            }
        },
        [isExporting, onSuccess, onError],
    );

    return { exportPdf, isExporting };
}
