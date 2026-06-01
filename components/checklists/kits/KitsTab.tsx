"use client";

import { useMemo, useState } from "react";
import { useChecklistKits, useApplyKit, useUndoKitApply } from "@/lib/hooks/use-checklist-kits";
import type { ChecklistKit, ChecklistKitItem, ApplyKitResult } from "@/lib/types";

interface KitsTabProps {
    restaurantId: string | null;
    existingTemplateIds: Set<string>;
    existingAreaNames: Set<string>; // normalizados (lower/trim)
    onClose: () => void;
}

type Mode = "essencial" | "completo";

function norm(s: string) {
    return s.trim().toLowerCase();
}

export function KitsTab({ restaurantId, existingTemplateIds, existingAreaNames, onClose }: KitsTabProps) {
    const { data: kits = [], isLoading, isError, refetch } = useChecklistKits(true);
    const applyMutation = useApplyKit();
    const undoMutation = useUndoKitApply();

    const [selectedKit, setSelectedKit] = useState<ChecklistKit | null>(null);
    const [mode, setMode] = useState<Mode>("essencial");
    const [selectedOptional, setSelectedOptional] = useState<Set<string>>(new Set());
    const [result, setResult] = useState<ApplyKitResult | null>(null);
    const [undone, setUndone] = useState(false);

    const resetDetail = () => {
        setMode("essencial");
        setSelectedOptional(new Set());
        setResult(null);
        setUndone(false);
    };

    const openKit = (kit: ChecklistKit) => { resetDetail(); setSelectedKit(kit); };
    const backToList = () => { setSelectedKit(null); resetDetail(); };

    const items = selectedKit?.items ?? [];
    const obrig = items.filter((i) => i.requirement_level === "obrigatorio");
    const recom = items.filter((i) => i.requirement_level === "recomendado");
    const opc = items.filter((i) => i.requirement_level === "opcional");

    // Itens que serão instalados conforme modo + opcionais marcados
    const chosen = useMemo(() => {
        return items.filter((i) =>
            i.requirement_level === "obrigatorio" ||
            (mode === "completo" && i.requirement_level === "recomendado") ||
            selectedOptional.has(i.template_id)
        );
    }, [items, mode, selectedOptional]);

    const willSkip = chosen.filter((i) => existingTemplateIds.has(i.template_id));
    const willCreate = chosen.filter((i) => !existingTemplateIds.has(i.template_id));
    const areasToCreate = useMemo(() => {
        const labels = new Set<string>();
        for (const i of willCreate) {
            const label = (i.template_suggested_area && i.template_suggested_area.trim()) || "Geral";
            if (!existingAreaNames.has(norm(label))) labels.add(label);
        }
        return Array.from(labels);
    }, [willCreate, existingAreaNames]);

    const levelsForMode = mode === "completo" ? ["obrigatorio", "recomendado"] : ["obrigatorio"];

    const handleApply = async () => {
        if (!restaurantId || !selectedKit) return;
        const res = await applyMutation.mutateAsync({
            restaurantId,
            kitId: selectedKit.id,
            levels: levelsForMode,
            extraTemplateIds: Array.from(selectedOptional),
        });
        setResult(res);
    };

    const handleUndo = async () => {
        if (!restaurantId || !result) return;
        await undoMutation.mutateAsync({ restaurantId, checklistIds: result.created_checklist_ids });
        setUndone(true);
    };

    // ── Estados de carregamento/erro ──────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-[#92bbc9] gap-2 py-16">
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                <span className="text-sm">Carregando kits...</span>
            </div>
        );
    }
    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-[#92bbc9] gap-3 py-16">
                <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
                <span className="text-sm">Não foi possível carregar os kits.</span>
                <button onClick={() => refetch()} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#16262c] border border-[#233f48] text-[#92bbc9] hover:text-white">Tentar novamente</button>
            </div>
        );
    }

    // ── Sucesso ───────────────────────────────────────────────────────────────
    if (result) {
        return (
            <div className="max-w-xl mx-auto py-6">
                <div className="flex flex-col items-center text-center gap-2 mb-6">
                    <span className="material-symbols-outlined text-emerald-400 text-5xl">check_circle</span>
                    <h3 className="text-xl font-bold text-white">Kit aplicado!</h3>
                    <p className="text-sm text-[#92bbc9]">{selectedKit?.name}</p>
                </div>
                <div className="space-y-2 bg-[#16262c] border border-[#233f48] rounded-2xl p-5 text-sm">
                    <Row label="Rotinas criadas" value={result.created_count} accent="emerald" />
                    {result.skipped_count > 0 && <Row label="Já existiam (puladas)" value={result.skipped_count} accent="amber" />}
                    {result.created_area_ids.length > 0 && <Row label="Áreas criadas" value={result.created_area_ids.length} accent="cyan" />}
                </div>

                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    {!undone && result.created_count > 0 && (
                        <button
                            onClick={handleUndo}
                            disabled={undoMutation.isPending}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-[#16262c] border border-[#233f48] text-[#92bbc9] hover:text-white font-bold text-sm px-4 py-3 rounded-xl transition-colors disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-[18px]">undo</span>
                            {undoMutation.isPending ? "Desfazendo..." : "Desfazer aplicação"}
                        </button>
                    )}
                    {undone && (
                        <span className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm text-[#92bbc9]">
                            <span className="material-symbols-outlined text-[18px]">history</span>
                            Aplicação desfeita (rotinas sem histórico removidas)
                        </span>
                    )}
                    <button
                        onClick={onClose}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] font-bold text-sm px-4 py-3 rounded-xl transition-colors"
                    >
                        Concluir
                    </button>
                </div>
                <p className="mt-3 text-xs text-[#325a67] text-center">
                    Desfazer remove apenas rotinas ainda não executadas. As demais permanecem.
                </p>
            </div>
        );
    }

    // ── Detalhe + preview de aplicação ────────────────────────────────────────
    if (selectedKit) {
        return (
            <div>
                <button onClick={backToList} className="inline-flex items-center gap-1.5 text-sm text-[#92bbc9] hover:text-white transition-colors mb-4">
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    Voltar para os kits
                </button>

                <div className="flex items-start gap-3 mb-5">
                    <span className="material-symbols-outlined text-[#13b6ec] text-[32px]">{selectedKit.icon || "widgets"}</span>
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">{selectedKit.name}</h2>
                        {selectedKit.description && <p className="text-sm text-[#92bbc9] mt-1">{selectedKit.description}</p>}
                    </div>
                </div>

                {/* Seletor de modo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                    <ModeCard
                        active={mode === "essencial"}
                        onClick={() => setMode("essencial")}
                        title="Modo Essencial"
                        badge="Recomendado"
                        desc="Instala apenas as rotinas obrigatórias. Foco em ativação rápida, menor volume inicial."
                        count={obrig.length}
                    />
                    <ModeCard
                        active={mode === "completo"}
                        onClick={() => setMode("completo")}
                        title="Modo Completo"
                        desc="Instala obrigatórias + recomendadas. Para operações mais estruturadas."
                        count={obrig.length + recom.length}
                    />
                </div>

                {/* Composição */}
                <div className="space-y-4">
                    <Group title="Obrigatórias" hint="sempre instaladas" items={obrig} muted={false} />
                    <Group title="Recomendadas" hint={mode === "completo" ? "incluídas" : "apenas no modo Completo"} items={recom} muted={mode !== "completo"} />
                    {opc.length > 0 && (
                        <div>
                            <p className="text-[10px] font-bold text-[#325a67] uppercase tracking-wider mb-2">
                                Opcionais <span className="text-[#233f48]">· selecione para incluir</span>
                            </p>
                            <div className="space-y-1.5">
                                {opc.map((i) => (
                                    <label key={i.template_id} className="flex items-center gap-3 bg-[#101d22] border border-[#233f48] rounded-lg px-3 py-2 cursor-pointer hover:border-[#325a67]">
                                        <input
                                            type="checkbox"
                                            checked={selectedOptional.has(i.template_id)}
                                            onChange={(e) => {
                                                setSelectedOptional((prev) => {
                                                    const next = new Set(prev);
                                                    if (e.target.checked) next.add(i.template_id); else next.delete(i.template_id);
                                                    return next;
                                                });
                                            }}
                                            className="size-4 accent-[#13b6ec]"
                                        />
                                        <span className="text-sm text-white flex-1">{i.template_name}</span>
                                        <span className="text-[11px] text-[#325a67]">{i.template_item_count} itens</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Resumo do que vai acontecer */}
                <div className="mt-5 bg-[#16262c] border border-[#233f48] rounded-xl p-4 text-sm space-y-1">
                    <p className="text-white font-bold">
                        Serão instaladas {willCreate.length} {willCreate.length === 1 ? "rotina" : "rotinas"}.
                    </p>
                    {willSkip.length > 0 && (
                        <p className="text-amber-400 text-xs">{willSkip.length} já existem e serão puladas.</p>
                    )}
                    {areasToCreate.length > 0 && (
                        <p className="text-[#92bbc9] text-xs">Áreas que serão criadas: {areasToCreate.join(", ")}.</p>
                    )}
                </div>

                {applyMutation.isError && (
                    <p className="mt-3 text-sm text-red-400">
                        {(applyMutation.error as Error)?.message || "Erro ao aplicar o kit."}
                    </p>
                )}

                <button
                    onClick={handleApply}
                    disabled={applyMutation.isPending || willCreate.length === 0 || !restaurantId}
                    className="mt-5 w-full inline-flex items-center justify-center gap-1.5 bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] font-bold text-sm px-5 py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                    {applyMutation.isPending ? "Aplicando..." : `Aplicar Kit (${mode === "essencial" ? "Essencial" : "Completo"})`}
                </button>
            </div>
        );
    }

    // ── Lista de kits ─────────────────────────────────────────────────────────
    return (
        <div>
            <p className="text-xs text-[#325a67] mb-4">
                Escolha o tipo da sua operação e instale um conjunto de rotinas com um clique.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {kits.map((kit) => {
                    const obrigCount = (kit.items ?? []).filter((i) => i.requirement_level === "obrigatorio").length;
                    return (
                        <button
                            key={kit.id}
                            onClick={() => openKit(kit)}
                            className="text-left bg-[#16262c] border border-[#233f48] rounded-xl p-5 hover:border-[#325a67] hover:bg-[#1a2c32] transition-colors group"
                        >
                            <div className="flex items-center gap-2.5">
                                <span className="material-symbols-outlined text-[#13b6ec] text-[26px]">{kit.icon || "widgets"}</span>
                                <h3 className="font-bold text-[#13b6ec] group-hover:text-[#3fc9f5]">{kit.name}</h3>
                            </div>
                            {kit.description && <p className="mt-2 text-sm text-[#92bbc9] line-clamp-2">{kit.description}</p>}
                            <div className="mt-4">
                                <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#233f48] text-[#92bbc9]">
                                    {obrigCount} rotinas essenciais
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function ModeCard({ active, onClick, title, badge, desc, count }: { active: boolean; onClick: () => void; title: string; badge?: string; desc: string; count: number }) {
    return (
        <button
            onClick={onClick}
            className={`text-left rounded-xl p-4 border transition-colors ${active ? "bg-[#13b6ec]/10 border-[#13b6ec]/50" : "bg-[#16262c] border-[#233f48] hover:border-[#325a67]"}`}
        >
            <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-[18px] ${active ? "text-[#13b6ec]" : "text-[#325a67]"}`}>
                    {active ? "radio_button_checked" : "radio_button_unchecked"}
                </span>
                <span className="font-bold text-white text-sm">{title}</span>
                {badge && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 uppercase tracking-wide">{badge}</span>}
            </div>
            <p className="mt-1.5 text-xs text-[#92bbc9]">{desc}</p>
            <p className="mt-2 text-[11px] font-bold text-[#325a67]">{count} rotinas</p>
        </button>
    );
}

function Group({ title, hint, items, muted }: { title: string; hint: string; items: ChecklistKitItem[]; muted: boolean }) {
    if (items.length === 0) return null;
    return (
        <div className={muted ? "opacity-50" : ""}>
            <p className="text-[10px] font-bold text-[#325a67] uppercase tracking-wider mb-2">
                {title} <span className="text-[#233f48]">· {hint}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
                {items.map((i) => (
                    <span key={i.template_id} className="px-2.5 py-1 rounded-md text-xs bg-[#101d22] border border-[#233f48] text-[#92bbc9]">
                        {i.template_name}
                    </span>
                ))}
            </div>
        </div>
    );
}

function Row({ label, value, accent }: { label: string; value: number; accent: "emerald" | "amber" | "cyan" }) {
    const color = accent === "emerald" ? "text-emerald-400" : accent === "amber" ? "text-amber-400" : "text-[#13b6ec]";
    return (
        <div className="flex items-center justify-between">
            <span className="text-[#92bbc9]">{label}</span>
            <span className={`font-bold ${color}`}>{value}</span>
        </div>
    );
}
