"use client";

import { formatShiftNames } from "@/lib/utils/shift-labels";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { getPhotoSignedUrl } from "@/lib/supabase/storage";
import { ChecklistForm } from "@/components/checklists/checklist-form";
import type { ExtendedChecklist } from "@/components/checklists/checklist-card";
import { formatDateBR, getDayRangeIsoInTz, getNowInTz } from "@/lib/utils/brazil-date";
import type { ChecklistPanelTab } from "@/lib/notifications/navigation";
import { describeRecurrence } from "@/lib/utils/recurrence/describe";
import { durationMinutes, formatDuration } from "@/lib/utils/time-window";
import { useTaskIssues } from "@/lib/hooks/use-task-issues";
import { IssueList } from "@/components/checklists/issues/IssueList";
import { IssueDetail } from "@/components/checklists/issues/IssueDetail";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import type { TaskIssue } from "@/lib/types";
import { displayAreas, areasLabel, displayResponsibles } from "@/lib/utils/checklist-labels";


const TYPE_LABELS: Record<string, string> = {
    regular: "Regular",
    opening: "Abertura",
    closing: "Fechamento",
    receiving: "Recebimento",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskExecution {
    id: string;
    task_id: string;
    status: string;
    photo_url: string | null;
    executed_at: string;
    blocked_reason: string | null;
    // Sprint 35
    observation: string | null;
    value_date: string | null;
    value_number: number | null;
    value_rating: number | null;
    photos: string[] | null;
    has_alert: boolean;
}

interface AssumptionDetail {
    id: string;
    user_name: string | null;
    observation: string | null;
    completed_at: string | null;
    execution_status: string;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * s90 — os dois hooks abaixo passam a ser ASSUMPTION-SCOPED.
 *
 * Antes eram hardcoded em "hoje" (`getBrazilDateKey()` / meia-noite do NAVEGADOR). Isso
 * tornava uma ocorrência de ontem ESTRUTURALMENTE INALCANÇÁVEL: o painel só sabia falar
 * do dia corrente, então nenhum deep-link histórico podia funcionar — por melhor que
 * fosse o payload.
 *
 * Três correções em um golpe:
 *   1. `dateKey` vira parâmetro (o deep-link informa o dia do evento).
 *   2. O dia é calculado no FUSO DO RESTAURANTE, não no do navegador (um gestor em
 *      outro fuso via o dia errado).
 *   3. A queryKey ganha o `restaurantId` — ela o OMITIA, o que é um risco real de
 *      vazamento de cache entre tenants na troca de restaurante.
 */
function useChecklistExecutions(
    checklistId: string,
    restaurantId: string,
    dateKey: string,
    timezone: string,
) {
    return useQuery({
        queryKey: ["checklist-executions-panel", restaurantId, checklistId, dateKey],
        queryFn: async (): Promise<TaskExecution[]> => {
            const supabase = createClient();
            const { start, end } = getDayRangeIsoInTz(timezone, dateKey);

            const { data } = await supabase
                .from("task_executions")
                .select("id, task_id, status, photo_url, executed_at, blocked_reason, observation, value_date, value_number, value_rating, photos, has_alert")
                .eq("checklist_id", checklistId)
                .eq("restaurant_id", restaurantId)
                .gte("executed_at", start)
                .lte("executed_at", end);

            return data ?? [];
        },
        enabled: !!checklistId && !!restaurantId && !!dateKey,
    });
}

function useAssumptionDetail(checklistId: string, restaurantId: string, dateKey: string) {
    return useQuery({
        queryKey: ["checklist-assumption-panel", restaurantId, checklistId, dateKey],
        queryFn: async (): Promise<AssumptionDetail | null> => {
            const supabase = createClient();

            const { data } = await supabase
                .from("checklist_assumptions")
                .select("id, user_name, observation, completed_at, execution_status")
                .eq("checklist_id", checklistId)
                .eq("restaurant_id", restaurantId)
                .eq("date_key", dateKey)
                .maybeSingle();

            return data;
        },
        enabled: !!checklistId && !!restaurantId && !!dateKey,
    });
}

// ── Photo Modal ───────────────────────────────────────────────────────────────

interface PhotoModalProps {
    photoUrl: string;
    taskTitle: string;
    onClose: () => void;
}

function PhotoModal({ photoUrl, taskTitle, onClose }: PhotoModalProps) {
    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80"
            onClick={onClose}
        >
            <div
                className="relative max-w-2xl w-full flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute -top-4 right-0 size-9 flex items-center justify-center rounded-full bg-[#1a2c32] border border-[#325a67] text-[#92bbc9] hover:text-white hover:bg-[#233f48] transition-colors z-10"
                >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                </button>

                <div
                    className="relative w-full rounded-xl overflow-hidden flex items-center justify-center bg-black/40"
                    style={{ maxHeight: "70vh", minHeight: "200px" }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={photoUrl}
                        alt={taskTitle}
                        className="max-w-full max-h-[70vh] object-contain"
                        onError={(e) => { e.currentTarget.src = '/image-error-placeholder.png'; }}
                    />
                </div>

                <div className="bg-[#16262c] border border-[#325a67] rounded-xl px-5 py-3">
                    <p className="text-white font-bold text-sm">{taskTitle}</p>
                    <p className="text-[#92bbc9] text-xs mt-0.5">Evidência fotográfica</p>
                </div>
            </div>
        </div>
    );
}

// ── ChecklistViewPanel ────────────────────────────────────────────────────────

interface ChecklistViewPanelProps {
    checklist: ExtendedChecklist;
    restaurantId?: string;
    onEdit: () => void;
    onClose: () => void;
    focusIssueId?: string | null;
    /**
     * s90 — escopo TEMPORAL do painel ('YYYY-MM-DD' no fuso do restaurante).
     * Vem do deep-link. Ausente ⇒ dia corrente (o comportamento de sempre).
     * É este parâmetro que destrava as ocorrências históricas.
     */
    dateKey?: string | null;
    /** Aba a abrir. Vem do deep-link. */
    initialTab?: ChecklistPanelTab | null;
}

// Normaliza fotos da execução: photos[] (Sprint 35) tem precedência, fallback para photo_url (legado)
function getExecutionPhotos(execution: TaskExecution | undefined): string[] {
    if (!execution) return [];
    if (Array.isArray(execution.photos) && execution.photos.length > 0) return execution.photos;
    if (execution.photo_url) return [execution.photo_url];
    return [];
}

function ChecklistViewPanel({
    checklist,
    restaurantId,
    onEdit,
    onClose,
    focusIssueId,
    dateKey,
    initialTab,
}: ChecklistViewPanelProps) {
    const userRole = useRestaurantStore((s) => s.userRole);
    const timezone = useRestaurantStore((s) => s.timezone) ?? "America/Sao_Paulo";
    const canManageIssues = userRole === "owner" || userRole === "manager";
    const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string } | null>(null);
    const [signedUrls, setSignedUrls] = useState<Record<string, string[]>>({});
    const [selectedIssue, setSelectedIssue] = useState<TaskIssue | null>(null);

    // O deep-link manda o dia do evento; sem ele, o dia corrente NO FUSO DO RESTAURANTE.
    const scopedDateKey = dateKey || getNowInTz(timezone).dateKey;
    const isHistorical = scopedDateKey !== getNowInTz(timezone).dateKey;

    const [activeTab, setActiveTab] = useState<ChecklistPanelTab>(initialTab ?? "tasks");

    const { data: executions = [], isLoading: execLoading } = useChecklistExecutions(
        checklist.id,
        restaurantId ?? "",
        scopedDateKey,
        timezone,
    );

    // Resolve signed URLs para TODAS as fotos de cada execução (multi-foto Sprint 35)
    // Compat: se photos[] vazio, usa photo_url legado como única foto
    const photoItems = useMemo(
        () =>
            executions
                .map((e) => ({ id: e.task_id, paths: getExecutionPhotos(e) }))
                .filter((it) => it.paths.length > 0),
        [executions],
    );

    useEffect(() => {
        if (photoItems.length === 0) {
            // Evita setState quando já está vazio (previne loop de re-render)
            setSignedUrls((prev) => (Object.keys(prev).length === 0 ? prev : {}));
            return;
        }

        let cancelled = false;
        Promise.all(
            photoItems.map(async ({ id, paths }) => {
                const urls = await Promise.all(paths.map((p) => getPhotoSignedUrl(p)));
                return { id, urls: urls.filter((u): u is string => !!u) };
            })
        ).then((results) => {
            if (cancelled) return;
            const map: Record<string, string[]> = {};
            for (const { id, urls } of results) {
                if (urls.length > 0) map[id] = urls;
            }
            setSignedUrls(map);
        });

        return () => { cancelled = true; };
    }, [photoItems]);

    const { data: assumptionDetail } = useAssumptionDetail(
        checklist.id,
        restaurantId ?? "",
        scopedDateKey,
    );

    // s90 — ocorrências da assumption DO DIA ESCOPADO (não mais "de hoje").
    const { data: issues = [] } = useTaskIssues({
        restaurantId: restaurantId,
        checklistAssumptionId: assumptionDetail?.id,
    });

    const openIssuesCount = useMemo(
        () => issues.filter(i => i.status === "open" || i.status === "investigating").length,
        [issues]
    );

    const taskTitleById = useMemo(() => {
        const map: Record<string, string> = {};
        (checklist.tasks ?? []).forEach(t => { map[t.id] = t.title; });
        return map;
    }, [checklist.tasks]);

    /**
     * s90 — a ocorrência do deep-link NÃO pode cair em fallback silencioso.
     *
     * Antes, se o `focusIssueId` não fosse encontrado, o código selecionava `issues[0]`
     * sem avisar: o gestor via a ocorrência ERRADA, achando que era a da notificação.
     * Isso é pior do que não mostrar nada.
     *
     * Agora: alvo não encontrado ⇒ estado explícito (`issueNotFound`), e a UI diz que
     * aquela ocorrência não está mais disponível.
     */
    const [issueNotFound, setIssueNotFound] = useState(false);

    useEffect(() => {
        if (issues.length === 0) {
            setSelectedIssue(null);
            setIssueNotFound(!!focusIssueId);
            return;
        }
        if (focusIssueId) {
            const target = issues.find((i) => i.id === focusIssueId);
            setIssueNotFound(!target);
            setSelectedIssue(target ?? null);
            return;
        }
        setIssueNotFound(false);
        setSelectedIssue((prev) => prev ?? issues[0]);
    }, [issues, focusIssueId]);

    // Chegou pelo deep-link de uma ocorrência ⇒ abre na aba Ocorrências.
    useEffect(() => {
        if (focusIssueId) setActiveTab("issues");
    }, [focusIssueId]);

    /**
     * Scroll automático + destaque, SEM TIMEOUT DE SINCRONIZAÇÃO.
     *
     * A restrição do projeto proíbe usar timeout para sincronizar navegação — e com
     * razão: "esperar 300ms e torcer para o nó existir" é uma corrida disfarçada.
     *
     * A primitiva correta é o CALLBACK REF: o React o invoca no instante em que o nó
     * MONTA. Não há espera, não há palpite. O destaque some sozinho via `onAnimationEnd`
     * (animação CSS), então também não há timer para limpá-lo.
     */
    const focusedIssueRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (!node) return;
            const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            node.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
        },
        // Identidade nova a cada alvo ⇒ o ref dispara de novo num segundo deep-link.
        [focusIssueId],
    );

    const executionMap = new Map(executions.map((e) => [e.task_id, e]));
    const hasExecution = executions.length > 0 || !!assumptionDetail;
    const executionHasPhoto = (e: TaskExecution) =>
        (Array.isArray(e.photos) && e.photos.length > 0) || !!e.photo_url;
    const hasPhotos = executions.some(executionHasPhoto);

    const statusLabel: Record<string, string> = {
        done: "Concluída",
        in_progress: "Em andamento",
        blocked: "Com impedimento",
        not_started: "Não iniciada",
    };

    const statusColor: Record<string, string> = {
        done: "text-emerald-400",
        in_progress: "text-[#13b6ec]",
        blocked: "text-amber-400",
        not_started: "text-[#92bbc9]",
    };

    return (
        <div className="flex flex-col h-full bg-[#101d22]">
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-[#233f48] shrink-0">
                <div className="flex-1 min-w-0 pr-3">
                    <h2 className="text-white font-bold text-base leading-snug">{checklist.name}</h2>
                    <div className="flex items-center flex-wrap gap-2 mt-1.5">
                        {/* s92 — uma rotina pode ter várias áreas. */}
                        {displayAreas(checklist).map((a) => (
                            <span key={a.id} className="flex items-center gap-1">
                                <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: a.color || "#325a67" }}
                                />
                                <span className="text-[#92bbc9] text-xs">{a.name}</span>
                            </span>
                        ))}
                        <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                checklist.active
                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                    : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                            }`}
                        >
                            {checklist.active ? "Ativo" : "Inativo"}
                        </span>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#233f48] text-[#92bbc9] hover:text-white transition-colors shrink-0"
                >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            {/* ── s90: ABAS ───────────────────────────────────────────────────
                O painel era uma coluna única com seções empilhadas. Sem abas, um
                deep-link não tinha "para onde" apontar: as Ocorrências ficavam abaixo
                da dobra, depois de Execução + Descrição + Configuração, e o usuário
                podia nem vê-las. */}
            <div
                role="tablist"
                aria-label="Seções da rotina"
                className="flex border-b border-[#233f48] shrink-0 px-2"
            >
                {([
                    { id: "tasks" as const, label: "Tarefas", count: checklist.tasks?.length ?? 0 },
                    { id: "issues" as const, label: "Ocorrências", count: issues.length },
                ]).map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            role="tab"
                            id={`panel-tab-${tab.id}`}
                            aria-selected={active}
                            aria-controls={`panel-tabpanel-${tab.id}`}
                            onClick={() => setActiveTab(tab.id)}
                            className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                                active ? "text-white" : "text-[#92bbc9] hover:text-white"
                            }`}
                        >
                            {tab.label}
                            {tab.count > 0 && (
                                <span
                                    className={`ml-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                                        tab.id === "issues" && openIssuesCount > 0
                                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/40"
                                            : "bg-[#233f48] text-[#92bbc9]"
                                    }`}
                                >
                                    {tab.count}
                                </span>
                            )}
                            {active && (
                                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#13b6ec] rounded-full" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Aviso de escopo histórico: o painel pode estar mostrando OUTRO dia. */}
            {isHistorical && (
                <div className="flex items-center gap-2 px-4 py-2 bg-[#13b6ec]/10 border-b border-[#13b6ec]/20 shrink-0">
                    <span className="material-symbols-outlined text-[16px] text-[#13b6ec]" aria-hidden="true">
                        history
                    </span>
                    <span className="text-[#92bbc9] text-xs">
                        Mostrando a execução de{" "}
                        <strong className="text-white">{formatDateBR(scopedDateKey)}</strong>
                    </span>
                </div>
            )}

            {/* Content */}
            <div
                className="flex-1 overflow-y-auto"
                role="tabpanel"
                id={`panel-tabpanel-${activeTab}`}
                aria-labelledby={`panel-tab-${activeTab}`}
            >

                {/* ── Execução do dia ────────────────────────────────────────── */}
                {activeTab === "tasks" && restaurantId && hasExecution && (
                    <div className="p-4 border-b border-[#1a2c32]">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide">
                                {isHistorical ? "Execução do dia" : "Execução de hoje"}
                            </p>
                            {assumptionDetail?.execution_status && (
                                <span className={`text-xs font-bold ${statusColor[assumptionDetail.execution_status] ?? "text-[#92bbc9]"}`}>
                                    {statusLabel[assumptionDetail.execution_status] ?? assumptionDetail.execution_status}
                                </span>
                            )}
                        </div>

                        {/* Executor */}
                        {assumptionDetail?.user_name && (
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-7 h-7 rounded-full bg-[#13b6ec]/20 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-[#13b6ec] text-[16px]">person</span>
                                </div>
                                <div>
                                    <p className="text-white text-sm font-medium">{assumptionDetail.user_name}</p>
                                    {assumptionDetail.completed_at && (
                                        <p className="text-[#92bbc9] text-xs">
                                            Concluída às{" "}
                                            {new Date(assumptionDetail.completed_at).toLocaleTimeString("pt-BR", {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Observação */}
                        {assumptionDetail?.observation && (
                            <div className="bg-[#1a2c32] border border-[#325a67] rounded-xl p-3 mb-3">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <span className="material-symbols-outlined text-[#92bbc9] text-[14px]">chat</span>
                                    <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide">Observação</p>
                                </div>
                                <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">
                                    {assumptionDetail.observation}
                                </p>
                            </div>
                        )}

                        {/* Badge de fotos enviadas */}
                        {hasPhotos && (
                            <div className="flex items-center gap-1.5 text-[#13b6ec] text-xs font-semibold mb-2">
                                <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                                {executions.filter(executionHasPhoto).length}{" "}
                                {executions.filter(executionHasPhoto).length === 1
                                    ? "foto enviada"
                                    : "fotos enviadas"}
                            </div>
                        )}

                        {/* Loading execuções */}
                        {execLoading && (
                            <div className="flex justify-center py-4">
                                <span className="material-symbols-outlined animate-spin text-xl text-[#13b6ec]">
                                    progress_activity
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Informações básicas */}
                {activeTab === "tasks" && checklist.description && (
                    <div className="p-4 border-b border-[#1a2c32]">
                        <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide mb-2">Descrição</p>
                        <p className="text-white text-sm leading-relaxed">{checklist.description}</p>
                    </div>
                )}

                {/* Configuração */}
                {activeTab === "tasks" && (
                <div className="p-4 border-b border-[#1a2c32]">
                    <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide mb-3">Configuração</p>
                    <div className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[#92bbc9] text-sm">Turno</span>
                            <span className="text-white text-sm font-medium">
                                {formatShiftNames(checklist.shifts)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[#92bbc9] text-sm">Recorrência</span>
                            <span className="text-white text-sm font-medium">
                                {describeRecurrence({
                                    recurrence: checklist.recurrence,
                                    recurrence_config: checklist.recurrence_config,
                                })}
                            </span>
                        </div>
                        {(checklist.start_time || checklist.end_time) && (
                            <div className="flex items-center justify-between">
                                <span className="text-[#92bbc9] text-sm">Horário</span>
                                <span className="text-white text-sm font-medium">
                                    {checklist.start_time && checklist.end_time
                                        ? `${checklist.start_time} – ${checklist.end_time}`
                                        : checklist.start_time
                                            ? `A partir de ${checklist.start_time}`
                                            : `Até ${checklist.end_time}`}
                                </span>
                            </div>
                        )}
                        {(() => {
                            const minutes = durationMinutes(checklist.start_time, checklist.end_time);
                            if (minutes === null) return null;
                            return (
                                <div className="flex items-center justify-between">
                                    <span className="text-[#92bbc9] text-sm">Duração</span>
                                    <span className="text-white text-sm font-medium">
                                        {formatDuration(minutes)}
                                    </span>
                                </div>
                            );
                        })()}
                        <div className="flex items-center justify-between">
                            <span className="text-[#92bbc9] text-sm">Tipo</span>
                            <span className="text-white text-sm font-medium">
                                {TYPE_LABELS[checklist.checklist_type ?? "regular"] ?? "—"}
                            </span>
                        </div>
                        {displayAreas(checklist).length > 0 && (
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-[#92bbc9] text-sm shrink-0">
                                    {displayAreas(checklist).length > 1 ? "Áreas" : "Área"}
                                </span>
                                <span className="flex items-center justify-end gap-x-2 gap-y-1 flex-wrap text-white text-sm font-medium" title={areasLabel(checklist)}>
                                    {displayAreas(checklist).map((a) => (
                                        <span key={a.id} className="flex items-center gap-1.5">
                                            <span
                                                className="w-2 h-2 rounded-full shrink-0"
                                                style={{ backgroundColor: a.color || "#325a67" }}
                                            />
                                            {a.name}
                                        </span>
                                    ))}
                                </span>
                            </div>
                        )}
                        {displayResponsibles(checklist).length > 0 && (
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-[#92bbc9] text-sm shrink-0">
                                    {displayResponsibles(checklist).length > 1 ? "Responsáveis" : "Responsável"}
                                </span>
                                <span className="text-white text-sm font-medium text-right">
                                    {displayResponsibles(checklist).map((r) => r.name).join(", ")}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                )}

                {/* ── Aba OCORRÊNCIAS ────────────────────────────────────────────
                    s90 — antes era uma seção empilhada no fim do scroll, e só renderizava
                    se `assumptionDetail?.id && issues.length > 0`. Agora é uma aba com
                    empty state próprio: um deep-link para uma ocorrência que não está mais
                    lá encontra uma explicação, não uma seção que sumiu. */}
                {activeTab === "issues" && (
                    <div id="issues-section" className="p-4">
                        {issueNotFound && (
                            <div
                                role="alert"
                                className="mb-4 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3"
                            >
                                <span className="material-symbols-outlined text-[18px] text-amber-400 shrink-0" aria-hidden="true">
                                    info
                                </span>
                                <p className="text-amber-300/90 text-xs leading-relaxed">
                                    Esta ocorrência não está mais disponível. Ela pode ter sido
                                    removida, ou pertence a outro dia de execução.
                                </p>
                            </div>
                        )}

                        {issues.length === 0 ? (
                            <div className="py-12 flex flex-col items-center gap-2 text-center">
                                <span className="material-symbols-outlined text-3xl text-[#325a67]" aria-hidden="true">
                                    check_circle
                                </span>
                                <p className="text-[#92bbc9] text-sm">
                                    Nenhuma ocorrência {isHistorical ? "neste dia" : "hoje"}
                                </p>
                            </div>
                        ) : (
                            <>
                                {openIssuesCount > 0 && (
                                    <div className="flex justify-end mb-3">
                                        <span className="text-[10px] font-bold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40 px-2 py-0.5">
                                            {openIssuesCount} aberta{openIssuesCount > 1 ? "s" : ""}
                                        </span>
                                    </div>
                                )}
                                <IssueList
                                    issues={issues}
                                    selectedId={selectedIssue?.id ?? null}
                                    onSelect={(i) => setSelectedIssue(i)}
                                    taskTitleById={taskTitleById}
                                    focusedIssueId={focusIssueId ?? null}
                                    focusedRef={focusedIssueRef}
                                />
                                {selectedIssue && (
                                    <div className="mt-4 pt-4 border-t border-[#233f48]">
                                        <IssueDetail
                                            issue={selectedIssue}
                                            canManage={canManageIssues}
                                            taskTitle={taskTitleById[selectedIssue.task_id]}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ── Tarefas (com status de execução e fotos) ──────────────── */}
                {activeTab === "tasks" && (
                <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[#92bbc9] text-xs font-bold uppercase tracking-wide">Tarefas</p>
                        <span className="text-[#325a67] text-xs">
                            {checklist.tasks?.length ?? 0}{" "}
                            {(checklist.tasks?.length ?? 0) === 1 ? "tarefa" : "tarefas"}
                        </span>
                    </div>

                    {!checklist.tasks || checklist.tasks.length === 0 ? (
                        <div className="text-center py-8">
                            <span className="material-symbols-outlined text-3xl text-[#325a67]">checklist</span>
                            <p className="text-[#92bbc9] text-sm mt-2">Nenhuma tarefa cadastrada</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {[...checklist.tasks]
                                .sort((a, b) => a.order - b.order)
                                .map((task, idx) => {
                                    const execution = executionMap.get(task.id);
                                    const isDone = execution?.status === "done";
                                    // s90 — removido `isBlocked` (execution.status === 'blocked'):
                                    // o s45 eliminou esse status do CHECK de task_executions ao migrar
                                    // impedimentos para `task_issues`, então a condição era SEMPRE falsa.
                                    // Impedimento hoje é uma ocorrência com severity='blocker' e aparece
                                    // na seção Ocorrências, não inline na tarefa.
                                    const isSkipped = execution?.status === "skipped";
                                    const photoUrls = signedUrls[task.id] ?? [];

                                    return (
                                        <div
                                            key={task.id}
                                            className={`flex items-start gap-3 p-3 border rounded-xl transition-colors ${
                                                isSkipped
                                                    ? "bg-amber-500/5 border-amber-500/30"
                                                    : isDone
                                                        ? "bg-emerald-500/5 border-emerald-500/20"
                                                        : "bg-[#0a1215] border-[#233f48]"
                                            }`}
                                        >
                                            {/* Status icon */}
                                            <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                                                <span
                                                    className={`text-xs font-bold w-5 text-right ${
                                                        isSkipped ? "text-amber-400" : isDone ? "text-emerald-400" : "text-[#325a67]"
                                                    }`}
                                                >
                                                    {isSkipped ? (
                                                        <span className="material-symbols-outlined text-[16px] text-amber-400">
                                                            block
                                                        </span>
                                                    ) : isDone ? (
                                                        <span className="material-symbols-outlined text-[16px] text-emerald-400">
                                                            check_circle
                                                        </span>
                                                    ) : (
                                                        <span className="text-[#325a67]">{idx + 1}</span>
                                                    )}
                                                </span>
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p
                                                    className={`text-sm font-medium leading-snug ${
                                                        isSkipped ? "text-amber-300 line-through decoration-amber-400/40" : isDone ? "text-emerald-300" : "text-white"
                                                    }`}
                                                >
                                                    {task.title}
                                                </p>
                                                {isSkipped && (
                                                    <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1 font-semibold uppercase tracking-wide">
                                                        <span className="material-symbols-outlined text-[12px]">block</span>
                                                        Não concluída — pulada por ocorrência
                                                    </p>
                                                )}
                                                {task.description && (
                                                    <p className="text-[#92bbc9] text-xs mt-0.5 whitespace-pre-wrap">{task.description}</p>
                                                )}
                                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                    {task.requires_photo && !isDone && (
                                                        <span className="flex items-center gap-1 text-amber-400 text-[10px] font-bold">
                                                            <span className="material-symbols-outlined text-[12px]">
                                                                photo_camera
                                                            </span>
                                                            Foto obrigatória
                                                        </span>
                                                    )}
                                                    {task.is_critical && (
                                                        <span className="flex items-center gap-1 text-red-400 text-[10px] font-bold">
                                                            <span className="material-symbols-outlined text-[12px]">
                                                                priority_high
                                                            </span>
                                                            Crítica
                                                        </span>
                                                    )}
                                                    {isDone && execution?.has_alert && (
                                                        <span className="flex items-center gap-1 bg-amber-500/15 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-500/30">
                                                            <span className="material-symbols-outlined text-[12px]">
                                                                warning
                                                            </span>
                                                            Alerta
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Sprint 35 — respostas registradas pelo colaborador */}
                                                {isDone && execution?.value_date && (
                                                    <p className="text-[#92bbc9] text-xs mt-2">
                                                        <span className="font-bold">Data de validade informada:</span>{" "}
                                                        <span className="text-white font-semibold">{formatDateBR(execution.value_date)}</span>
                                                    </p>
                                                )}
                                                {isDone && execution?.value_number !== null && execution?.value_number !== undefined && (
                                                    <p className="text-[#92bbc9] text-xs mt-1">
                                                        <span className="font-bold uppercase tracking-wider text-[10px]">Valor:</span>{" "}
                                                        <span className="text-white font-semibold">{execution.value_number}</span>
                                                    </p>
                                                )}
                                                {isDone && execution?.value_rating !== null && execution?.value_rating !== undefined && (
                                                    <p className="text-[#92bbc9] text-xs mt-1 flex items-center gap-2 flex-wrap">
                                                        <span className="font-bold uppercase tracking-wider text-[10px]">Avaliação:</span>
                                                        <span className="text-yellow-400 font-semibold text-base md:text-lg leading-none tracking-wider">
                                                            {"★".repeat(execution.value_rating)}
                                                            <span className="text-yellow-400/30">{"☆".repeat(5 - execution.value_rating)}</span>
                                                        </span>
                                                    </p>
                                                )}
                                                {isDone && execution?.observation && (
                                                    <div className="mt-2 bg-[#0a1215] border border-[#233f48] rounded-lg p-2.5">
                                                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#92bbc9] mb-1 flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-[12px]">edit_note</span>
                                                            Observação
                                                        </p>
                                                        <p className="text-white text-xs leading-relaxed whitespace-pre-wrap">
                                                            {execution.observation}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Thumbnails — multi-foto Sprint 35 (compat com photo_url legado) */}
                                                {photoUrls.length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        {photoUrls.map((url, photoIdx) => (
                                                            <button
                                                                key={`${task.id}-${photoIdx}`}
                                                                onClick={() =>
                                                                    setSelectedPhoto({
                                                                        url,
                                                                        title: photoUrls.length > 1
                                                                            ? `${task.title} — Foto ${photoIdx + 1}/${photoUrls.length}`
                                                                            : task.title,
                                                                    })
                                                                }
                                                                className="block relative w-20 h-20 rounded-lg overflow-hidden border border-[#13b6ec]/30 hover:border-[#13b6ec] transition-colors group"
                                                            >
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={url}
                                                                    alt={`${task.title} foto ${photoIdx + 1}`}
                                                                    className="w-full h-full object-cover"
                                                                />
                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                                    <span className="material-symbols-outlined text-white text-[18px] opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        zoom_in
                                                                    </span>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#233f48] shrink-0">
                <button
                    onClick={onEdit}
                    className="w-full flex items-center justify-center gap-2 bg-[#13b6ec] hover:bg-[#0ea5d4] text-[#0a1215] font-bold text-sm py-3 rounded-xl transition-colors"
                >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                    Editar rotina
                </button>
            </div>

            {/* Photo modal */}
            {selectedPhoto && (
                <PhotoModal
                    photoUrl={selectedPhoto.url}
                    taskTitle={selectedPhoto.title}
                    onClose={() => setSelectedPhoto(null)}
                />
            )}
        </div>
    );
}

// ── ChecklistEditorPanel (exported) ──────────────────────────────────────────

export interface ChecklistEditorPanelProps {
    checklist: ExtendedChecklist | null;
    mode: "view" | "edit" | "new";
    onModeChange: (mode: "view" | "edit" | "new") => void;
    onClose: () => void;
    onSaved: () => void;
    restaurantId?: string;
    focusIssueId?: string | null;
    /** s90 — escopo temporal vindo do deep-link. Ausente ⇒ dia corrente. */
    dateKey?: string | null;
    initialTab?: ChecklistPanelTab | null;
}

export function ChecklistEditorPanel({
    checklist,
    mode,
    onModeChange,
    onClose,
    onSaved,
    restaurantId,
    focusIssueId,
    dateKey,
    initialTab,
}: ChecklistEditorPanelProps) {
    if (mode === "view" && checklist) {
        return (
            <ChecklistViewPanel
                checklist={checklist}
                restaurantId={restaurantId}
                onEdit={() => onModeChange("edit")}
                onClose={onClose}
                focusIssueId={focusIssueId}
                dateKey={dateKey}
                initialTab={initialTab}
            />
        );
    }

    return (
        <div className="h-full overflow-hidden flex flex-col">
            <ChecklistForm checklist={checklist} onSaved={onSaved} onCancel={onClose} />
        </div>
    );
}
