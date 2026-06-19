import React, { useState, useMemo } from 'react';
import { KanbanTask, KanbanExecution } from '@/lib/hooks/use-tasks';
import { PhotoUpload } from '@/components/tasks/photo-upload';
import { useSignedUrl } from '@/lib/hooks/use-signed-url';
import { resolveTaskType, computeTaskAlert } from '@/lib/utils/task-alert';
import { formatDateBR } from '@/lib/utils/brazil-date';
import { AsyncButton } from '@/components/ui/async-button';
import type { TaskIssue } from '@/lib/types';

export interface ExecutionToggleInput {
    isDone: boolean;
    photoUrl?: string;
    photos?: string[];
    observation?: string;
    valueBoolean?: boolean;
    valueDate?: string;
    valueNumber?: number;
    valueRating?: number;
    hasAlert?: boolean;
}

interface ExecutionItemProps {
    task: KanbanTask;
    execution?: KanbanExecution;
    onToggle: (taskId: string, executionId: string | undefined, input: ExecutionToggleInput) => void;
    onReportProblem: (taskId: string) => void;
    /** Sprint 46: callback para abrir o modal em modo edição da ocorrência do autor. */
    onEditIssue?: (issue: TaskIssue) => void;
    /** Sprint 46: "Não foi possível concluir" — marca task como skipped, opcionalmente vinculada à ocorrência. */
    onSkipTask?: (taskId: string, linkedIssueId: string | null) => void;
    /** Sprint 46: desfaz skip. */
    onUnskipTask?: (taskId: string) => void;
    locked?: boolean;
    isBlockedSequential?: boolean;
    restaurantId: string;
    /** Indica se há ao menos uma ocorrência aberta/investigando para esta task (s45). */
    hasOpenIssue?: boolean;
    /** Sprint 46: ocorrência do usuário atual nesta task, quando existe e é dele. */
    myOpenIssue?: TaskIssue | null;
    /** Mutation desta task está pendente — desabilita botão de skip e mostra spinner. */
    skipPending?: boolean;
    /** Mutation de toggle (concluir/desfazer) desta task está pendente. */
    togglePending?: boolean;
    /** A2: destaca temporariamente a task quando navegada a partir do erro de finalização. */
    highlight?: boolean;
}

/** Vibração tátil curta (A6) — degrada silenciosamente onde não há suporte. */
function triggerHaptic() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate(15); } catch { /* no-op */ }
    }
}

/**
 * Wrapper que aplica `id` (para scroll/navegação A2) e o anel de destaque.
 * Mantém um único ponto de ancoragem independente do branch de render interno.
 */
export function ExecutionItem(props: ExecutionItemProps) {
    return (
        <div
            id={`exec-task-${props.task.id}`}
            className={`scroll-mt-24 rounded-2xl transition-shadow duration-300 ${
                props.highlight ? 'ring-2 ring-red-500/70 ring-offset-2 ring-offset-[#101d22]' : ''
            }`}
        >
            <ExecutionItemContent {...props} />
        </div>
    );
}

function ExecutionItemContent({ task, execution, onToggle, onReportProblem, onEditIssue, onSkipTask, onUnskipTask, locked = false, isBlockedSequential = false, restaurantId, hasOpenIssue = false, myOpenIssue = null, skipPending = false, togglePending = false }: ExecutionItemProps) {
    const isDone = Boolean(execution && execution.status === 'done');
    const isSkipped = Boolean(execution && execution.status === 'skipped');
    const [isAnimating, setIsAnimating] = useState(false);
    const [photoError, setPhotoError] = useState<string | null>(null);

    const taskType = resolveTaskType(task.type ?? null);
    const requiresPhoto = Boolean(task.requires_photo);
    const requiresObservation = Boolean(task.requires_observation);
    const maxPhotos = task.max_photos ?? null;

    // Estado local — valores em digitação antes de concluir
    const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
    const [pendingObservation, setPendingObservation] = useState<string>("");
    const [pendingDate, setPendingDate] = useState<string>("");
    const [pendingNumber, setPendingNumber] = useState<string>("");
    const [pendingRating, setPendingRating] = useState<number>(0);
    const [validationError, setValidationError] = useState<string | null>(null);

    // Para tasks já executadas, exibir foto salva (compat: photos[] OU photo_url)
    const existingPhotoPath = useMemo(() => {
        const ph = execution?.photos;
        if (Array.isArray(ph) && ph.length > 0) return ph[0];
        return execution?.photo_url ?? undefined;
    }, [execution]);
    const donePhotoUrl = useSignedUrl(isDone ? existingPhotoPath : undefined);

    const hasAlertSaved = Boolean(execution?.has_alert);

    // Alerta em tempo real (não bloqueante) — calculado a partir dos valores
    // que o colaborador está digitando, antes de concluir.
    const pendingHasAlert = useMemo(() => {
        const numericValue = pendingNumber.trim() === "" ? null : Number(pendingNumber);
        return computeTaskAlert({
            type: taskType,
            value_date: pendingDate || null,
            value_number: numericValue !== null && Number.isFinite(numericValue) ? numericValue : null,
            value_rating: pendingRating > 0 ? pendingRating : null,
            config: task.task_config ?? null,
        });
    }, [taskType, pendingDate, pendingNumber, pendingRating, task.task_config]);

    const alertMessage = useMemo(() => {
        if (!pendingHasAlert) return null;
        if (taskType === 'date') return 'Atenção: data igual ou anterior a hoje.';
        if (taskType === 'number') return 'Atenção: valor fora do esperado.';
        if (taskType === 'rating') return 'Atenção: avaliação baixa registrada.';
        return 'Atenção: valor fora do esperado.';
    }, [pendingHasAlert, taskType]);

    // ── Helpers ─────────────────────────────────────────────────────────────
    const animateToggle = () => {
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 300);
    };

    const buildToggleInput = (overrides: Partial<ExecutionToggleInput> = {}): ExecutionToggleInput => {
        const input: ExecutionToggleInput = { isDone: true, ...overrides };

        if (taskType === 'boolean') {
            input.valueBoolean = true;
        } else if (taskType === 'date') {
            input.valueDate = pendingDate;
        } else if (taskType === 'number') {
            const n = Number(pendingNumber);
            if (Number.isFinite(n)) input.valueNumber = n;
        } else if (taskType === 'rating') {
            input.valueRating = pendingRating;
        }

        if (requiresObservation || pendingObservation.trim()) {
            input.observation = pendingObservation.trim();
        }

        if (pendingPhotos.length > 0) {
            input.photos = pendingPhotos;
            input.photoUrl = pendingPhotos[0];
        }

        const alert = computeTaskAlert({
            type: taskType,
            value_date: input.valueDate ?? null,
            value_number: input.valueNumber ?? null,
            value_rating: input.valueRating ?? null,
            config: task.task_config ?? null,
        });
        input.hasAlert = alert;

        return input;
    };

    const validateBeforeComplete = (): string | null => {
        if (requiresPhoto && pendingPhotos.length === 0) {
            return 'Adicione ao menos uma foto antes de concluir.';
        }
        if (requiresObservation && pendingObservation.trim() === "") {
            return 'Preencha a observação obrigatória.';
        }
        if (taskType === 'date' && !pendingDate) {
            return 'Selecione uma data.';
        }
        if (taskType === 'number') {
            const n = Number(pendingNumber);
            if (pendingNumber.trim() === "" || !Number.isFinite(n)) {
                return 'Informe um valor numérico válido.';
            }
        }
        if (taskType === 'rating' && pendingRating < 1) {
            return 'Selecione uma avaliação.';
        }
        return null;
    };

    const handleSimpleToggle = () => {
        if (locked) return;
        // Bool simples sem foto/observação/etc — fluxo legado intacto
        if (!isDone) triggerHaptic(); // A6: feedback tátil apenas ao concluir
        animateToggle();
        onToggle(task.id, execution?.id, buildToggleInput({ isDone: !isDone }));
    };

    const handleConclude = () => {
        const err = validateBeforeComplete();
        if (err) {
            setValidationError(err);
            return;
        }
        setValidationError(null);
        triggerHaptic(); // A6: feedback tátil ao concluir
        animateToggle();
        onToggle(task.id, execution?.id, buildToggleInput());
    };

    const handleUndo = () => {
        if (locked) return;
        onToggle(task.id, execution?.id, { isDone: false });
        setPendingPhotos([]);
        setPendingObservation("");
        setPendingDate("");
        setPendingNumber("");
        setPendingRating(0);
        setPhotoError(null);
        setValidationError(null);
    };

    const handlePhotoUploaded = (filePath: string) => {
        setPendingPhotos((prev) => {
            if (maxPhotos !== null && prev.length >= maxPhotos) return prev;
            return [...prev, filePath];
        });
        setPhotoError(null);
        setValidationError(null);
    };

    const handleRemovePhoto = (index: number) => {
        setPendingPhotos((prev) => prev.filter((_, i) => i !== index));
    };

    // Badge inline reutilizável de ocorrência (não-bloqueante)
    const issueBadge = hasOpenIssue ? (
        <span className="shrink-0 bg-amber-500/15 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-500/30 flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">warning</span>
            Ocorrência
        </span>
    ) : null;

    // Card editável da própria ocorrência (Sprint 46): aparece quando o usuário é
    // autor e a ocorrência está em status 'open'. Para outros casos (issue de
    // outro staff, ou já em investigating/resolved), continua só o badge.
    const myEditableIssue = myOpenIssue && myOpenIssue.status === 'open' ? myOpenIssue : null;
    const inlineIssueCard = myEditableIssue ? (
        <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex flex-col gap-2.5">
            <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-amber-400 text-[18px] shrink-0 mt-0.5">warning</span>
                <div className="flex-1 min-w-0">
                    <p className="text-[11px] uppercase tracking-wide font-bold text-amber-400">Ocorrência registrada · aguardando conclusão da tarefa</p>
                    <p className="text-xs text-white mt-1 line-clamp-2 whitespace-pre-wrap">{myEditableIssue.description}</p>
                    {myEditableIssue.photos.length > 0 && (
                        <p className="text-[10px] text-amber-400/70 mt-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">image</span>
                            {myEditableIssue.photos.length} foto{myEditableIssue.photos.length > 1 ? 's' : ''}
                        </p>
                    )}
                </div>
                {onEditIssue && !locked && (
                    <button
                        onClick={() => onEditIssue(myEditableIssue)}
                        className="shrink-0 text-[11px] font-semibold text-amber-300 hover:text-amber-200 underline-offset-2 hover:underline"
                    >
                        Ver / Editar
                    </button>
                )}
            </div>
            {onSkipTask && !locked && !isDone && !isSkipped && (
                <AsyncButton
                    onClick={() => onSkipTask(task.id, myEditableIssue.id)}
                    isPending={skipPending}
                    loadingLabel="Registrando…"
                    icon="block"
                    iconClassName="text-[14px]"
                    className="self-stretch flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15 transition-colors"
                >
                    Não foi possível concluir
                </AsyncButton>
            )}
        </div>
    ) : null;

    // ── RENDER: task pulada (skipped — Sprint 46) ───────────────────────
    if (isSkipped) {
        return (
            <div className="w-full flex flex-col gap-0 rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                <div className="flex items-center gap-4 p-4 min-h-[64px]">
                    <div className="shrink-0 w-7 h-7 rounded-full border-[2px] flex items-center justify-center bg-amber-500/20 border-amber-500 text-amber-400">
                        <span className="material-symbols-outlined text-[16px] font-bold">block</span>
                    </div>
                    <div className="flex-1 py-1">
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-base font-semibold leading-snug text-white line-through decoration-amber-400/40">
                                {task.title}
                            </span>
                            <span className="shrink-0 bg-amber-500/15 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-500/30 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">block</span>
                                Não concluída
                            </span>
                        </div>
                        {task.description && (
                            <p className="text-sm mt-1 text-[#92bbc9]/70">{task.description}</p>
                        )}
                        {myEditableIssue && (
                            <p className="text-[11px] mt-2 text-amber-400/80 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">warning</span>
                                Pulada por ocorrência registrada
                            </p>
                        )}
                    </div>
                    {!locked && onUnskipTask && (
                        <button
                            onClick={() => onUnskipTask(task.id)}
                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-[#92bbc9]/60 hover:text-[#92bbc9] hover:bg-[#233f48] transition-colors"
                            title="Desfazer"
                        >
                            <span className="material-symbols-outlined text-[18px]">undo</span>
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // ── RENDER: task concluída ──────────────────────────────────────────
    if (isDone) {
        const allPhotos: string[] = Array.isArray(execution?.photos) && execution.photos.length > 0
            ? execution.photos
            : (execution?.photo_url ? [execution.photo_url] : []);

        return (
            <div className={`
                w-full flex flex-col gap-0 rounded-2xl border text-left
                bg-[#1a2c32]/40 border-[#13b6ec]/30 shadow-[0_4px_12px_rgba(19,182,236,0.05)]
                overflow-hidden relative transition-shadow duration-300
                ${isAnimating ? 'ring-2 ring-[#13b6ec]/60 shadow-[0_0_20px_rgba(19,182,236,0.35)]' : ''}
            `}>
                <div className="absolute inset-0 bg-gradient-to-r from-[#13b6ec]/10 to-transparent pointer-events-none" />

                <div className="relative flex items-center gap-4 p-4 min-h-[64px]">
                    <div className="shrink-0 flex items-center justify-center">
                        <div className={`
                            w-7 h-7 rounded-full border-[2px] flex items-center justify-center
                            bg-[#13b6ec] border-[#13b6ec] text-[#0a1215]
                            ${isAnimating ? 'scale-125' : 'scale-100'} transition-transform duration-200
                        `}>
                            <span className={`material-symbols-outlined text-[16px] font-bold ${isAnimating ? 'animate-in zoom-in duration-200' : ''}`}>check</span>
                        </div>
                    </div>

                    <div className="flex-1 py-1">
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-base font-semibold leading-snug text-white">
                                {task.title}
                            </span>
                            <div className="flex items-center gap-1.5">
                                {issueBadge}
                                {hasAlertSaved && (
                                    <span className="shrink-0 bg-amber-500/15 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-500/30 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px]">warning</span>
                                        Alerta
                                    </span>
                                )}
                            </div>
                        </div>
                        {task.description && (
                            <p className="text-sm mt-1 text-[#92bbc9]/70">{task.description}</p>
                        )}
                        {/* Valor registrado por tipo */}
                        {execution?.value_date && (
                            <p className="text-xs mt-1 text-[#92bbc9]">
                                Data de validade informada: <span className="text-white font-semibold">{formatDateBR(execution.value_date)}</span>
                            </p>
                        )}
                        {execution?.value_number !== null && execution?.value_number !== undefined && (
                            <p className="text-xs mt-1 text-[#92bbc9]">
                                Valor: <span className="text-white font-semibold">{execution.value_number}</span>
                            </p>
                        )}
                        {execution?.value_rating !== null && execution?.value_rating !== undefined && (
                            <p className="text-xs mt-1 text-[#92bbc9]">
                                Avaliação:{' '}
                                <span className="text-yellow-400 font-semibold">
                                    {'★'.repeat(execution.value_rating)}
                                    {'☆'.repeat(5 - execution.value_rating)}
                                </span>
                            </p>
                        )}
                        {execution?.observation && (
                            <p className="text-xs mt-1 text-[#92bbc9] italic">
                                &ldquo;{execution.observation}&rdquo;
                            </p>
                        )}
                        {allPhotos.length > 0 && (
                            <div className="flex items-center gap-1 mt-2 text-[#13b6ec] text-xs font-semibold">
                                <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                                {allPhotos.length === 1 ? '1 foto registrada' : `${allPhotos.length} fotos registradas`}
                            </div>
                        )}
                    </div>

                    {!locked && (
                        <button
                            onClick={handleUndo}
                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-[#92bbc9]/60 hover:text-[#92bbc9] hover:bg-[#233f48] transition-colors"
                            title="Desfazer"
                        >
                            <span className="material-symbols-outlined text-[18px]">undo</span>
                        </button>
                    )}
                </div>

                {donePhotoUrl && (
                    <div className="relative mx-4 mb-3 rounded-xl overflow-hidden border border-[#13b6ec]/20 max-h-32">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={donePhotoUrl} alt="Evidência" className="w-full object-cover max-h-32" />
                    </div>
                )}
                {inlineIssueCard && (
                    <div className="px-4 pb-3">{inlineIssueCard}</div>
                )}
            </div>
        );
    }

    // ── RENDER: boolean simples sem requisitos extras (fluxo legado) ─────
    const hasExtraRequirement = taskType !== 'boolean' || requiresPhoto || requiresObservation;

    if (!hasExtraRequirement) {
        return (
            <div className="w-full flex flex-col gap-0">
                <button
                    onClick={handleSimpleToggle}
                    disabled={locked || togglePending}
                    aria-busy={togglePending || undefined}
                    className={`
                        w-full flex items-center gap-4 p-4 min-h-[64px] rounded-2xl border text-left
                        transition-all duration-200 ease-out relative overflow-hidden group
                        ${locked ? 'cursor-default opacity-75' : 'active:scale-[0.98]'}
                        ${locked
                            ? 'bg-[#16262c] border-[#233f48]'
                            : 'bg-[#16262c] border-[#233f48] shadow-sm hover:border-[#325a67]'
                        }
                    `}
                >
                    <div className="relative shrink-0 flex items-center justify-center">
                        <div
                            className={`
                                w-7 h-7 rounded-full border-[2px] flex items-center justify-center
                                transition-colors duration-200 border-[#325a67] bg-transparent text-transparent
                                ${isAnimating ? 'scale-110' : 'scale-100'}
                            `}
                        >
                            <span className="material-symbols-outlined text-[16px] font-bold opacity-0 scale-50">check</span>
                        </div>
                    </div>

                    <div className="relative flex-1 py-1">
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-base font-semibold leading-snug text-[#e0e0e0]">
                                {task.title}
                            </span>
                            <div className="flex items-center gap-1.5">
                                {issueBadge}
                                {task.is_critical && !locked && (
                                    <span className="shrink-0 bg-red-500/10 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                        Crítica
                                    </span>
                                )}
                            </div>
                        </div>
                        {task.description && (
                            <p className="text-sm mt-1 text-[#92bbc9]">{task.description}</p>
                        )}
                        {isBlockedSequential && (
                            <div className="flex items-center gap-1 mt-2 text-[#92bbc9]/70 text-xs font-semibold">
                                <span className="material-symbols-outlined text-[14px]">lock</span>
                                Conclua a tarefa acima para habilitar
                            </div>
                        )}
                    </div>
                </button>

                {inlineIssueCard}

                {!locked && !isBlockedSequential && !myEditableIssue && (
                    <button
                        onClick={() => onReportProblem(task.id)}
                        className="mt-1 self-start ml-11 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        Registrar ocorrência
                    </button>
                )}
            </div>
        );
    }

    // ── RENDER: task com requisitos extras (tipos novos OU foto/obs) ──────
    if (locked) {
        // Locked sem completar: mostrar só info
        return (
            <div className="w-full flex flex-col rounded-2xl border text-left bg-[#16262c] border-[#233f48] shadow-sm overflow-hidden p-4">
                <span className="text-base font-semibold leading-snug text-[#92bbc9]">{task.title}</span>
                {task.description && (
                    <p className="text-sm mt-1 text-[#92bbc9]/60">{task.description}</p>
                )}
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col rounded-2xl border text-left bg-[#16262c] border-[#233f48]/80 shadow-sm overflow-hidden">
            <div className="flex items-start gap-3.5 px-4 pt-4 pb-3">
                <div className="shrink-0 flex items-center justify-center pt-0.5">
                    <div className="w-7 h-7 rounded-full border border-[#325a67]/80 bg-[#13b6ec]/5 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[15px] text-[#13b6ec]">
                            {taskType === 'date' ? 'event' :
                                taskType === 'number' ? 'tag' :
                                taskType === 'rating' ? 'star' : 'check_circle'}
                        </span>
                    </div>
                </div>

                <div className="flex-1 py-1">
                    <div className="flex items-start justify-between gap-3">
                        <span className="text-base font-semibold leading-snug text-[#e0e0e0]">
                            {task.title}
                        </span>
                        <div className="flex items-center gap-1.5">
                            {issueBadge}
                            {task.is_critical && (
                                <span className="shrink-0 bg-red-500/10 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    Crítica
                                </span>
                            )}
                            {!myEditableIssue && !isBlockedSequential && (
                                <button
                                    onClick={() => onReportProblem(task.id)}
                                    aria-label="Mais opções da tarefa"
                                    className="shrink-0 -my-2 -mr-2 w-10 h-10 flex items-center justify-center rounded-full text-[#92bbc9]/60 hover:text-[#92bbc9] hover:bg-white/5 active:scale-95 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13b6ec]/40"
                                >
                                    <span className="material-symbols-outlined text-[20px]">more_horiz</span>
                                </button>
                            )}
                        </div>
                    </div>
                    {task.description && (
                        <p className="text-[13px] leading-relaxed mt-1 text-[#92bbc9]/85">{task.description}</p>
                    )}
                    {isBlockedSequential && (
                        <div className="flex items-center gap-1 mt-2 text-[#92bbc9]/70 text-xs font-semibold">
                            <span className="material-symbols-outlined text-[14px]">lock</span>
                            Conclua a tarefa acima para habilitar
                        </div>
                    )}
                </div>
            </div>

            {!isBlockedSequential && (
                <div className="px-4 pb-4 flex flex-col gap-3.5">
                    {/* Input específico do tipo */}
                    {taskType === 'date' && (
                        <div>
                            <label className="block text-[11px] font-semibold text-[#92bbc9]/80 uppercase tracking-wide mb-1.5">
                                Data
                            </label>
                            <input
                                type="date"
                                value={pendingDate}
                                onChange={(e) => setPendingDate(e.target.value)}
                                className="w-full min-h-[48px] bg-[#101d22] border border-[#233f48] rounded-xl px-4 py-3 text-white outline-none transition-colors focus:border-[#13b6ec] focus:ring-2 focus:ring-[#13b6ec]/20"
                            />
                        </div>
                    )}

                    {taskType === 'number' && (
                        <div>
                            <label className="block text-[11px] font-semibold text-[#92bbc9]/80 uppercase tracking-wide mb-1.5">
                                Valor
                            </label>
                            <input
                                type="number"
                                inputMode="decimal"
                                value={pendingNumber}
                                onChange={(e) => setPendingNumber(e.target.value)}
                                placeholder="Digite o valor"
                                className="w-full min-h-[48px] bg-[#101d22] border border-[#233f48] rounded-xl px-4 py-3 text-white outline-none transition-colors focus:border-[#13b6ec] focus:ring-2 focus:ring-[#13b6ec]/20"
                            />
                            {(task.task_config?.min_value !== undefined || task.task_config?.max_value !== undefined) && (
                                <p className="text-[11px] text-[#92bbc9]/70 mt-1.5">
                                    Faixa esperada:
                                    {task.task_config?.min_value !== undefined && ` mín ${task.task_config.min_value}`}
                                    {task.task_config?.max_value !== undefined && ` máx ${task.task_config.max_value}`}
                                </p>
                            )}
                        </div>
                    )}

                    {taskType === 'rating' && (
                        <div>
                            <label className="block text-[11px] font-semibold text-[#92bbc9]/80 uppercase tracking-wide mb-2">
                                Avaliação
                            </label>
                            <div className="flex items-center gap-2">
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setPendingRating(n)}
                                        className="p-1 rounded-lg active:scale-95 transition-transform"
                                        aria-label={`${n} estrela(s)`}
                                    >
                                        <span className={`material-symbols-outlined text-[28px] ${n <= pendingRating ? 'text-yellow-400' : 'text-[#325a67]'}`}>
                                            {n <= pendingRating ? 'star' : 'star_border'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Multi-foto */}
                    {requiresPhoto && (
                        <div className="flex flex-col gap-2">
                            <label className="block text-[11px] font-semibold text-[#92bbc9]/80 uppercase tracking-wide">
                                Fotos
                                {maxPhotos !== null && (
                                    <span className="text-[#92bbc9]/50 normal-case tracking-normal font-medium"> ({pendingPhotos.length}/{maxPhotos})</span>
                                )}
                            </label>
                            {pendingPhotos.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {pendingPhotos.map((path, i) => (
                                        <div key={`${path}-${i}`} className="relative bg-[#101d22] border border-[#13b6ec]/30 rounded-lg px-3 py-2 text-xs text-[#13b6ec] flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[14px]">photo</span>
                                            Foto {i + 1}
                                            <button
                                                type="button"
                                                onClick={() => handleRemovePhoto(i)}
                                                className="ml-1 text-[#92bbc9] hover:text-white transition-colors"
                                                aria-label="Remover foto"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">close</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {(maxPhotos === null || pendingPhotos.length < maxPhotos) && (
                                <PhotoUpload
                                    key={`photo-slot-${pendingPhotos.length}`}
                                    restaurantId={restaurantId}
                                    onUpload={(filePath) => handlePhotoUploaded(filePath)}
                                    disabled={false}
                                />
                            )}
                            {photoError && (
                                <p className="text-red-400 text-xs font-semibold flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">error</span>
                                    {photoError}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Observação */}
                    {(requiresObservation || taskType !== 'boolean') && (
                        <div>
                            <label className="block text-[11px] font-semibold text-[#92bbc9]/80 uppercase tracking-wide mb-1.5">
                                Observação {requiresObservation ? <span className="text-[#13b6ec] normal-case tracking-normal">obrigatória</span> : <span className="text-[#92bbc9]/50 normal-case tracking-normal font-medium">(opcional)</span>}
                            </label>
                            <textarea
                                value={pendingObservation}
                                onChange={(e) => setPendingObservation(e.target.value)}
                                placeholder={requiresObservation ? 'Descreva o que foi feito…' : 'Adicione uma observação (opcional)'}
                                rows={2}
                                className="w-full bg-[#101d22] border border-[#233f48] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#92bbc9]/40 outline-none transition-colors focus:border-[#13b6ec] focus:ring-2 focus:ring-[#13b6ec]/20 resize-none leading-relaxed"
                            />
                        </div>
                    )}

                    {pendingHasAlert && alertMessage && (
                        <p className="text-amber-400 text-xs font-medium flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px]">warning</span>
                            {alertMessage}
                        </p>
                    )}

                    {validationError && (
                        <p className="text-red-400 text-xs font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">error</span>
                            {validationError}
                        </p>
                    )}

                    <AsyncButton
                        onClick={handleConclude}
                        isPending={togglePending}
                        loadingLabel="Concluindo…"
                        icon="check_circle"
                        iconClassName="text-[18px]"
                        className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-150 active:scale-[0.98] bg-[#13b6ec] text-[#0a1215] shadow-[0_2px_8px_rgba(19,182,236,0.18)] hover:bg-[#0fa3d4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13b6ec]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16262c]"
                    >
                        Concluir tarefa
                    </AsyncButton>

                    {inlineIssueCard}

                    {!myEditableIssue && (
                        <button
                            onClick={() => onReportProblem(task.id)}
                            aria-label="Registrar ocorrência: não consegui concluir esta tarefa"
                            className="w-full min-h-[44px] -mt-1 flex items-center justify-center gap-1 text-[13px] text-[#92bbc9]/65 hover:text-[#92bbc9] active:scale-[0.98] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13b6ec]/40 rounded-lg"
                        >
                            <span>Não consegui concluir?</span>
                            <span className="material-symbols-outlined text-[16px] opacity-60">chevron_right</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
