"use client";

import { useMemo, useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { useChecklistTemplates } from "@/lib/hooks/use-checklist-templates";
import type { ChecklistTemplate, ChecklistTemplateItem, TemplateCategory } from "@/lib/types";

interface TemplatesBrowserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUseTemplate: (template: ChecklistTemplate) => void;
}

// Metadados de exibição das categorias (label + ícone Material Symbols).
// Ordem fixa de exibição na coluna lateral.
const CATEGORY_META: { key: TemplateCategory; label: string; icon: string }[] = [
    { key: "caixa", label: "Caixa", icon: "point_of_sale" },
    { key: "cozinha", label: "Cozinha", icon: "restaurant" },
    { key: "salao", label: "Salão", icon: "table_restaurant" },
    { key: "estoque", label: "Estoque", icon: "inventory_2" },
    { key: "limpeza", label: "Limpeza", icon: "cleaning_services" },
    { key: "banheiros", label: "Banheiros", icon: "wc" },
    { key: "seguranca_alimentar", label: "Segurança Alimentar", icon: "health_and_safety" },
    { key: "equipamentos", label: "Equipamentos", icon: "blender" },
    { key: "manutencao", label: "Manutenção", icon: "build" },
    { key: "delivery", label: "Delivery", icon: "delivery_dining" },
    { key: "administrativo", label: "Administrativo", icon: "description" },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
    CATEGORY_META.map((c) => [c.key, c.label])
);

function typeBadge(item: ChecklistTemplateItem): { label: string; cls: string } {
    switch (item.type) {
        case "number":
            return { label: "Nº", cls: "bg-[#233f48] text-[#92bbc9]" };
        case "date":
            return { label: "Data", cls: "bg-[#233f48] text-[#92bbc9]" };
        case "rating":
            return { label: "Nota", cls: "bg-[#233f48] text-[#92bbc9]" };
        default:
            return { label: "OK/NOK", cls: "bg-[#233f48] text-[#92bbc9]" };
    }
}

export function TemplatesBrowserModal({ isOpen, onClose, onUseTemplate }: TemplatesBrowserModalProps) {
    const { data: templates = [], isLoading, isError, refetch } = useChecklistTemplates(isOpen);

    const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(null);
    const [detail, setDetail] = useState<ChecklistTemplate | null>(null);
    const [search, setSearch] = useState("");

    // Categorias que possuem ≥1 modelo ativo (na ordem fixa de CATEGORY_META).
    const availableCategories = useMemo(() => {
        const present = new Set(templates.map((t) => t.category));
        return CATEGORY_META.filter((c) => present.has(c.key));
    }, [templates]);

    // Seleciona a primeira categoria disponível assim que os dados chegam.
    useEffect(() => {
        if (!selectedCategory && availableCategories.length > 0) {
            setSelectedCategory(availableCategories[0].key);
        }
    }, [availableCategories, selectedCategory]);

    // Reset ao fechar.
    useEffect(() => {
        if (!isOpen) {
            setDetail(null);
            setSelectedCategory(null);
            setSearch("");
        }
    }, [isOpen]);

    const trimmedSearch = search.trim().toLowerCase();
    const isSearching = trimmedSearch.length > 0;

    const visibleTemplates = useMemo(() => {
        if (isSearching) {
            return templates.filter(
                (t) =>
                    t.name.toLowerCase().includes(trimmedSearch) ||
                    (t.description ?? "").toLowerCase().includes(trimmedSearch)
            );
        }
        return templates.filter((t) => t.category === selectedCategory);
    }, [templates, selectedCategory, isSearching, trimmedSearch]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-6xl">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#233f48]">
                <h2 className="text-lg sm:text-xl font-bold text-[#13b6ec] tracking-tight">
                    Explorar Modelos Prontos
                </h2>
                <button
                    onClick={onClose}
                    className="text-[#92bbc9] hover:text-white transition-colors"
                    aria-label="Fechar"
                >
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 min-h-0">
                {/* Coluna de categorias (desktop) */}
                <aside className="hidden sm:flex sm:flex-col w-56 shrink-0 border-r border-[#233f48] overflow-y-auto py-4">
                    <p className="px-5 pb-2 text-[10px] font-bold text-[#325a67] uppercase tracking-wider">
                        Categorias
                    </p>
                    {availableCategories.map((c) => (
                        <button
                            key={c.key}
                            onClick={() => { setSelectedCategory(c.key); setDetail(null); setSearch(""); }}
                            className={`flex items-center gap-2.5 px-5 py-2.5 text-sm text-left transition-colors border-l-2 ${
                                selectedCategory === c.key
                                    ? "border-[#13b6ec] text-[#13b6ec] bg-[#13b6ec]/5 font-bold"
                                    : "border-transparent text-[#92bbc9] hover:text-white hover:bg-[#16262c]"
                            }`}
                        >
                            <span className="material-symbols-outlined text-[18px]">{c.icon}</span>
                            {c.label}
                        </button>
                    ))}
                </aside>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6">
                    {/* Busca */}
                    {!detail && !isLoading && !isError && availableCategories.length > 0 && (
                        <div className="relative mb-4">
                            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#325a67] text-[18px] pointer-events-none">search</span>
                            <input
                                type="text"
                                placeholder="Buscar modelo por nome..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-[#16262c] border border-[#233f48] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-[#325a67] focus:outline-none focus:border-[#13b6ec] transition-colors"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#325a67] hover:text-white"
                                    aria-label="Limpar busca"
                                >
                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                </button>
                            )}
                        </div>
                    )}

                    {/* Chips de categoria (mobile) */}
                    {!detail && !isSearching && availableCategories.length > 0 && (
                        <div className="flex sm:hidden gap-2 overflow-x-auto pb-3 mb-1 -mx-1 px-1">
                            {availableCategories.map((c) => (
                                <button
                                    key={c.key}
                                    onClick={() => { setSelectedCategory(c.key); setSearch(""); }}
                                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                                        selectedCategory === c.key
                                            ? "bg-[#13b6ec]/10 border-[#13b6ec]/40 text-[#13b6ec]"
                                            : "bg-[#16262c] border-[#233f48] text-[#92bbc9]"
                                    }`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {isLoading && (
                        <div className="flex flex-col items-center justify-center h-full text-[#92bbc9] gap-2">
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            <span className="text-sm">Carregando modelos...</span>
                        </div>
                    )}

                    {isError && !isLoading && (
                        <div className="flex flex-col items-center justify-center h-full text-[#92bbc9] gap-3">
                            <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
                            <span className="text-sm">Não foi possível carregar os modelos.</span>
                            <button
                                onClick={() => refetch()}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#16262c] border border-[#233f48] text-[#92bbc9] hover:text-white"
                            >
                                Tentar novamente
                            </button>
                        </div>
                    )}

                    {!isLoading && !isError && !detail && (
                        <TemplateGrid
                            category={selectedCategory}
                            isSearching={isSearching}
                            templates={visibleTemplates}
                            onOpenDetail={setDetail}
                        />
                    )}

                    {!isLoading && !isError && detail && (
                        <TemplateDetail
                            template={detail}
                            onBack={() => setDetail(null)}
                            onUse={() => onUseTemplate(detail)}
                        />
                    )}
                </div>
            </div>
        </Modal>
    );
}

function TemplateGrid({
    category,
    isSearching,
    templates,
    onOpenDetail,
}: {
    category: TemplateCategory | null;
    isSearching: boolean;
    templates: ChecklistTemplate[];
    onOpenDetail: (t: ChecklistTemplate) => void;
}) {
    return (
        <div>
            <div className="mb-4 text-sm text-[#92bbc9]">
                <span className="text-[#325a67]">Modelos / </span>
                <span className="text-white font-bold">
                    {isSearching ? "Resultados da busca" : category ? CATEGORY_LABEL[category] : ""}
                </span>
                <p className="mt-1 text-xs text-[#325a67]">
                    Selecione um modelo abaixo para visualizar e importar os itens.
                </p>
            </div>

            {templates.length === 0 ? (
                <p className="text-sm text-[#325a67]">
                    {isSearching ? "Nenhum modelo encontrado para a busca." : "Nenhum modelo nesta categoria."}
                </p>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {templates.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => onOpenDetail(t)}
                            className="text-left bg-[#16262c] border border-[#233f48] rounded-xl p-5 hover:border-[#325a67] hover:bg-[#1a2c32] transition-colors group"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="font-bold text-[#13b6ec] group-hover:text-[#3fc9f5]">{t.name}</h3>
                                {t.is_premium && (
                                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                        Premium
                                    </span>
                                )}
                            </div>
                            {t.description && (
                                <p className="mt-2 text-sm text-[#92bbc9] line-clamp-2">{t.description}</p>
                            )}
                            <div className="mt-4 flex items-center justify-between">
                                <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#233f48] text-[#92bbc9]">
                                    {t.items?.length ?? 0} itens prontos
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#13b6ec]">
                                    Ver Detalhes
                                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function TemplateDetail({
    template,
    onBack,
    onUse,
}: {
    template: ChecklistTemplate;
    onBack: () => void;
    onUse: () => void;
}) {
    const items = template.items ?? [];
    return (
        <div>
            <button
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-sm text-[#92bbc9] hover:text-white transition-colors mb-4"
            >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Voltar para lista
            </button>

            <div className="bg-[#16262c] border border-[#233f48] rounded-2xl p-5 sm:p-6 mb-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="min-w-0">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#13b6ec]/10 text-[#13b6ec] mb-2">
                            {CATEGORY_LABEL[template.category]}
                        </span>
                        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{template.name}</h2>
                        {template.description && (
                            <p className="mt-2 text-sm text-[#92bbc9]">{template.description}</p>
                        )}
                    </div>
                    <button
                        onClick={onUse}
                        className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] font-bold text-sm px-5 py-3 rounded-xl transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">download</span>
                        Usar Este Modelo
                    </button>
                </div>
            </div>

            <p className="text-[10px] font-bold text-[#325a67] uppercase tracking-wider mb-3">
                {items.length} {items.length === 1 ? "item de verificação incluído" : "itens de verificação incluídos"}
            </p>

            <div className="space-y-2">
                {items.map((item, idx) => {
                    const badge = typeBadge(item);
                    return (
                        <div
                            key={item.id}
                            className="flex items-center gap-3 bg-[#101d22] border border-[#233f48] rounded-xl px-4 py-3"
                        >
                            <span className="shrink-0 w-6 h-6 rounded-md bg-[#16262c] text-[#325a67] text-xs font-bold flex items-center justify-center">
                                {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-white truncate">{item.title}</p>
                                {item.description && (
                                    <p className="text-xs text-[#92bbc9] truncate">{item.description}</p>
                                )}
                            </div>
                            <div className="shrink-0 flex items-center gap-1.5">
                                {item.is_critical && (
                                    <span className="material-symbols-outlined text-amber-400 text-[16px]" title="Crítico">star</span>
                                )}
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                                {item.requires_photo && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">Foto</span>
                                )}
                                {item.requires_observation && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-500/10 text-violet-300 border border-violet-500/20">Obs</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
