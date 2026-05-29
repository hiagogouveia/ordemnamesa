"use client";

import { useMemo, useState } from "react";
import {
    useReceivingTemplates,
    useArchiveReceivingTemplate,
    useUpdateReceivingTemplate,
} from "@/lib/hooks/use-receiving-templates";
import type { ReceivingTemplate } from "@/lib/types";
import { TemplateFormModal } from "./template-form-modal";

interface TemplatesListProps {
    restaurantId: string | undefined;
}

const RECURRENCE_LABEL: Record<string, string> = {
    daily: "Diária",
    weekly: "Semanal",
    monthly: "Mensal",
    yearly: "Anual",
    weekdays: "Dias úteis",
    custom: "Personalizada",
    shift_days: "Dias do turno",
};

export function TemplatesList({ restaurantId }: TemplatesListProps) {
    const [showInactive, setShowInactive] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const { data: templates = [], isLoading, isError } = useReceivingTemplates(restaurantId, showInactive);
    const archiveTemplate = useArchiveReceivingTemplate();
    const updateTemplate = useUpdateReceivingTemplate();

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return templates
            .filter((t) => (showInactive ? true : t.active))
            .filter((t) => (q ? t.name.toLowerCase().includes(q) : true))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [templates, showInactive, searchQuery]);

    const editingTemplate = editingId ? templates.find((t) => t.id === editingId) ?? null : null;

    const handleArchive = async (t: ReceivingTemplate) => {
        if (!restaurantId) return;
        await archiveTemplate.mutateAsync({ id: t.id, restaurant_id: restaurantId });
    };

    const handleReactivate = async (t: ReceivingTemplate) => {
        if (!restaurantId) return;
        await updateTemplate.mutateAsync({ id: t.id, restaurant_id: restaurantId, active: true });
    };

    if (!restaurantId) {
        return (
            <div className="flex items-center justify-center min-h-[200px] text-[#92bbc9] text-sm">
                Carregando restaurante…
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 px-4 py-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 sm:max-w-md">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#92bbc9] text-[18px]">search</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar por nome…"
                            className="w-full bg-[#101d22] border border-[#233f48] rounded-lg pl-10 pr-3 py-2 text-sm text-white placeholder:text-[#557682] focus:outline-none focus:border-[#13b6ec]"
                        />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[#92bbc9] cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showInactive}
                            onChange={(e) => setShowInactive(e.target.checked)}
                            className="accent-[#13b6ec]"
                        />
                        Mostrar arquivados
                    </label>
                </div>
                <button
                    onClick={() => setCreating(true)}
                    className="px-4 py-2 rounded-lg bg-[#13b6ec] text-white text-sm font-semibold hover:bg-[#0fa3d4] transition-colors flex items-center gap-2 self-start sm:self-auto"
                >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    Novo modelo
                </button>
            </div>

            {/* List */}
            {isLoading ? (
                <div className="text-[#92bbc9] text-sm py-4">Carregando modelos…</div>
            ) : isError ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
                    Erro ao carregar modelos.
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-[#16262c] border border-dashed border-[#233f48] rounded-xl p-8 text-center">
                    <p className="text-[#92bbc9] text-sm mb-3">
                        {searchQuery
                            ? "Nenhum modelo corresponde à busca."
                            : showInactive
                                ? "Nenhum modelo cadastrado."
                                : "Nenhum modelo ativo."}
                    </p>
                    {!searchQuery && (
                        <button
                            onClick={() => setCreating(true)}
                            className="text-[#13b6ec] text-sm font-medium hover:underline"
                        >
                            Cadastrar primeiro modelo
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-[#16262c] border border-[#233f48] rounded-xl overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-[#1a2c32] text-xs uppercase tracking-wider text-[#92bbc9]">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium">Nome</th>
                                <th className="text-left px-4 py-3 font-medium">Área</th>
                                <th className="text-left px-4 py-3 font-medium">Recorrência</th>
                                <th className="text-left px-4 py-3 font-medium">Tarefas</th>
                                <th className="text-left px-4 py-3 font-medium">Status</th>
                                <th className="text-right px-4 py-3 font-medium">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#233f48]">
                            {filtered.map((t) => {
                                const tasksCount = t.tasks?.length ?? 0;
                                return (
                                    <tr key={t.id} className="text-sm">
                                        <td className="px-4 py-3 text-white font-medium">{t.name}</td>
                                        <td className="px-4 py-3">
                                            {t.area ? (
                                                <span className="inline-flex items-center gap-1.5 text-[#92bbc9]">
                                                    <span className="size-2 rounded-full" style={{ background: t.area.color }} />
                                                    {t.area.name}
                                                </span>
                                            ) : (
                                                <span className="text-[#557682]">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-[#92bbc9]">
                                            {RECURRENCE_LABEL[t.recurrence] ?? t.recurrence}
                                        </td>
                                        <td className="px-4 py-3 text-[#92bbc9] tabular-nums">{tasksCount}</td>
                                        <td className="px-4 py-3">
                                            {t.active ? (
                                                <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                    Ativo
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-[#92bbc9] text-xs font-medium">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[#557682]" />
                                                    Arquivado
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="inline-flex items-center gap-1">
                                                <button
                                                    onClick={() => setEditingId(t.id)}
                                                    className="px-2.5 py-1.5 rounded-md text-[#92bbc9] hover:bg-[#1a2c32] hover:text-white transition-colors text-xs font-medium"
                                                >
                                                    Editar
                                                </button>
                                                {t.active ? (
                                                    <button
                                                        onClick={() => handleArchive(t)}
                                                        disabled={archiveTemplate.isPending}
                                                        className="px-2.5 py-1.5 rounded-md text-red-400 hover:bg-red-500/10 transition-colors text-xs font-medium disabled:opacity-50"
                                                    >
                                                        Arquivar
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleReactivate(t)}
                                                        disabled={updateTemplate.isPending}
                                                        className="px-2.5 py-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 transition-colors text-xs font-medium disabled:opacity-50"
                                                    >
                                                        Reativar
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modais */}
            {creating && (
                <TemplateFormModal
                    restaurantId={restaurantId}
                    template={null}
                    onClose={() => setCreating(false)}
                />
            )}
            {editingTemplate && (
                <TemplateFormModal
                    restaurantId={restaurantId}
                    template={editingTemplate}
                    onClose={() => setEditingId(null)}
                />
            )}
        </div>
    );
}
