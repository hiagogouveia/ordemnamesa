'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from '@/lib/providers/use-session';
import { useActivityData, useToggleActivityTask } from '@/lib/hooks/use-activity-execution';
import { useChecklistAssumption, useCompleteChecklist } from '@/lib/hooks/use-tasks';
import { useTaskIssues } from '@/lib/hooks/use-task-issues';
import { ExecutionItem, type ExecutionToggleInput } from '@/components/turno/execution-item';
import { IssueReportModal } from '@/components/checklists/issues/IssueReportModal';
import type { TaskIssue } from '@/lib/types';

export default function ActivityExecutionPage() {
    const router = useRouter();
    const params = useParams();
    const checklistId = params.id as string;
    const session = useSession();
    const restaurantId = session.restaurantId;
    const sessionLoading = session.status === 'loading';

    const [showFinalizeModal, setShowFinalizeModal] = useState(false);
    const [finalizing, setFinalizing] = useState(false);
    const [observation, setObservation] = useState("");
    const [photoValidationError, setPhotoValidationError] = useState<string | null>(null);

    // Modal de ocorrência (substitui o antigo "reportar problema")
    const [reportModalTaskId, setReportModalTaskId] = useState<string | null>(null);
    const [editingIssue, setEditingIssue] = useState<TaskIssue | null>(null);
    const [issueFlash, setIssueFlash] = useState<{ kind: 'created' | 'updated' } | null>(null);

    const { data: activityData, isLoading, isError, isFetched } = useActivityData(restaurantId || undefined, checklistId);
    const { data: assumption } = useChecklistAssumption(restaurantId || undefined, checklistId);
    const toggleTask = useToggleActivityTask();
    const completeMutation = useCompleteChecklist();

    const { checklist, tasks, executions } = activityData || {};

    const isCompleted = Boolean(assumption?.completed_at);

    const { data: issues } = useTaskIssues({
        restaurantId: restaurantId || undefined,
        checklistAssumptionId: assumption?.id,
    });

    const openIssuesByTaskId = useMemo(() => {
        const map = new Map<string, number>();
        (issues ?? []).forEach(i => {
            if (i.status === 'open' || i.status === 'investigating') {
                map.set(i.task_id, (map.get(i.task_id) ?? 0) + 1);
            }
        });
        return map;
    }, [issues]);

    // Sprint 46: ocorrência aberta DO usuário atual por task (apenas status='open' permite edição)
    const myOpenIssueByTaskId = useMemo(() => {
        const map = new Map<string, TaskIssue>();
        if (!session.userId) return map;
        (issues ?? []).forEach(i => {
            if (i.status === 'open' && i.reported_by === session.userId) {
                map.set(i.task_id, i);
            }
        });
        return map;
    }, [issues, session.userId]);

    // Auto-dismiss banner de sucesso (3s)
    React.useEffect(() => {
        if (!issueFlash) return;
        const t = setTimeout(() => setIssueFlash(null), 3500);
        return () => clearTimeout(t);
    }, [issueFlash]);

    const progress = useMemo(() => {
        if (!tasks || tasks.length === 0) return 0;
        const doneCount = tasks.filter(t =>
            executions?.some(e => e.task_id === t.id && e.status === 'done')
        ).length;
        return Math.round((doneCount / tasks.length) * 100);
    }, [tasks, executions]);

    const isAllDone = progress === 100;
    const hasAnyOpenIssue = openIssuesByTaskId.size > 0;

    const handleToggle = async (taskId: string, executionId: string | undefined, input: ExecutionToggleInput) => {
        if (!restaurantId || !checklistId || isCompleted) return;
        const task = tasks?.find(t => t.id === taskId);
        const requiresPhoto = Boolean(task?.requires_photo);
        try {
            await toggleTask.mutateAsync({
                restaurantId,
                checklistId,
                taskId,
                executionId,
                isDone: input.isDone,
                photoUrl: input.photoUrl,
                requiresPhoto,
                type: task?.type ?? null,
                requiresObservation: task?.requires_observation,
                maxPhotos: task?.max_photos ?? null,
                taskConfig: task?.task_config ?? null,
                photos: input.photos,
                observation: input.observation,
                valueBoolean: input.valueBoolean,
                valueDate: input.valueDate,
                valueNumber: input.valueNumber,
                valueRating: input.valueRating,
                hasAlert: input.hasAlert,
            });
        } catch (e) {
            console.error('Erro ao alternar tarefa:', e);
        }
    };

    const handleReportProblem = (taskId: string) => {
        setEditingIssue(null);
        setReportModalTaskId(taskId);
    };

    const handleEditIssue = (issue: TaskIssue) => {
        setEditingIssue(issue);
        setReportModalTaskId(issue.task_id);
    };

    const closeIssueModal = () => {
        setReportModalTaskId(null);
        setEditingIssue(null);
    };

    const handleConfirmFinalize = async () => {
        if (!restaurantId || !checklistId) return;

        // Validação de segurança: tasks que exigem foto e não têm foto na execução
        // Compat: leitura considera photos[] (Sprint 35) OU photo_url (legado)
        const missingPhotoTasks = (tasks ?? []).filter(t =>
            t.requires_photo &&
            !executions?.some(e =>
                e.task_id === t.id &&
                e.status === 'done' &&
                ((Array.isArray(e.photos) && e.photos.length > 0) || !!e.photo_url)
            )
        );
        if (missingPhotoTasks.length > 0) {
            setPhotoValidationError(
                `${missingPhotoTasks.length === 1 ? '1 tarefa exige' : `${missingPhotoTasks.length} tarefas exigem`} foto e ainda não ${missingPhotoTasks.length === 1 ? 'foi registrada' : 'foram registradas'}.`
            );
            return;
        }

        setPhotoValidationError(null);
        setFinalizing(true);
        try {
            await completeMutation.mutateAsync({ restaurantId, checklistId, observation: observation || undefined });
            setShowFinalizeModal(false);
        } catch (e) {
            console.error('Erro ao finalizar atividade:', e);
        } finally {
            setFinalizing(false);
        }
    };

    if (sessionLoading || !restaurantId || isLoading || !isFetched) {
        return (
            <div className="min-h-screen bg-[#101d22] flex flex-col pt-12 p-4 items-center animate-pulse">
                <div className="h-12 w-full max-w-[480px] bg-[#1a2c32] rounded-xl mb-6"></div>
                <div className="h-4 w-full max-w-[480px] bg-[#1a2c32] rounded-full mb-8"></div>
                <div className="w-full max-w-[480px] space-y-4">
                    <div className="h-20 bg-[#1a2c32] rounded-2xl w-full"></div>
                    <div className="h-20 bg-[#1a2c32] rounded-2xl w-full"></div>
                    <div className="h-20 bg-[#1a2c32] rounded-2xl w-full"></div>
                </div>
            </div>
        );
    }

    if (isError || !checklist || !tasks) {
        return (
            <div className="min-h-screen bg-[#101d22] flex flex-col items-center justify-center p-6 text-center">
                <span className="material-symbols-outlined text-red-500 text-5xl mb-4">error</span>
                <h2 className="text-white text-xl font-bold mb-2">Atividade não encontrada</h2>
                <p className="text-[#92bbc9] mb-8">Não foi possível carregar os detalhes desta atividade.</p>
                <button
                    onClick={() => router.push('/turno')}
                    className="bg-[#233f48] text-white px-6 py-3 rounded-xl font-bold active:scale-95 transition-transform"
                >
                    Voltar ao Turno
                </button>
            </div>
        );
    }

    const reportingTask = reportModalTaskId ? tasks.find(t => t.id === reportModalTaskId) : null;
    const reportingExecution = reportModalTaskId
        ? executions?.find(e => e.task_id === reportModalTaskId)
        : null;

    return (
        <div className="min-h-[100dvh] bg-[#101d22] font-sans flex flex-col">
            {/* Toast transitório de ocorrência (Sprint 46) */}
            {issueFlash && (
                <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] max-w-[440px] w-[calc(100%-1.5rem)] bg-amber-500 text-[#0c1518] rounded-xl shadow-2xl px-4 py-3 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-4 duration-300">
                    <span className="material-symbols-outlined text-[20px] shrink-0">warning</span>
                    <div className="flex-1 text-sm font-semibold leading-tight">
                        {issueFlash.kind === 'created'
                            ? 'Ocorrência registrada. Agora conclua a tarefa normalmente.'
                            : 'Ocorrência atualizada.'}
                    </div>
                    <button
                        onClick={() => setIssueFlash(null)}
                        className="text-[#0c1518]/70 hover:text-[#0c1518] text-lg leading-none"
                        aria-label="Fechar"
                    >×</button>
                </div>
            )}

            {/* Header Sticky */}
            <header className="sticky top-0 z-30 bg-[#101d22]/95 backdrop-blur-md border-b border-[#233f48] px-4 py-4">
                <div className="max-w-[480px] mx-auto w-full flex items-center gap-3">
                    <button
                        onClick={() => router.push(`/turno/atividade/${checklistId}`)}
                        className="w-10 h-10 shrink-0 flex items-center justify-center bg-[#1a2c32] border border-[#233f48] rounded-full text-white active:bg-[#233f48] transition-colors"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-white text-lg font-bold truncate leading-tight">
                            {checklist.name}
                        </h1>
                        {assumption && (
                            <p className="text-[#13b6ec] text-xs font-medium truncate flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">person</span>
                                {isCompleted
                                    ? `Finalizada por: ${assumption.completed_by_user_name || assumption.user_name}`
                                    : `Em execução por: ${assumption.user_name}`
                                }
                            </p>
                        )}
                    </div>
                    {isCompleted && (
                        <span className="shrink-0 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">task_alt</span>
                            {hasAnyOpenIssue ? 'Concluída c/ ocorrência' : 'Concluída'}
                        </span>
                    )}
                </div>

                {/* Progress Bar */}
                <div className="max-w-[480px] mx-auto w-full mt-4">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-white font-bold text-sm">Progresso</span>
                        <span className={`text-sm font-bold ${isAllDone ? 'text-[#13b6ec]' : 'text-[#92bbc9]'}`}>
                            {progress}%
                        </span>
                    </div>
                    <div className="w-full h-3 bg-[#1a2c32] rounded-full overflow-hidden border border-[#233f48]/50">
                        <div
                            className={`h-full transition-all duration-700 ease-out rounded-full ${
                                isCompleted
                                    ? hasAnyOpenIssue ? 'bg-amber-500' : 'bg-emerald-500'
                                    : isAllDone
                                        ? 'bg-[#13b6ec] shadow-[0_0_10px_rgba(19,182,236,0.5)]'
                                        : 'bg-gradient-to-r from-[#13b6ec]/70 to-[#13b6ec]'
                            }`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-4 py-6">
                <div className="max-w-[480px] mx-auto w-full flex flex-col gap-4 pb-48">

                    {/* Completed banner */}
                    {isCompleted && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-emerald-400 text-xl">task_alt</span>
                            </div>
                            <div>
                                <h2 className="text-emerald-300 font-bold text-sm">Atividade Finalizada</h2>
                                <p className="text-emerald-400/70 text-xs mt-0.5">As tarefas não podem mais ser alteradas.</p>
                            </div>
                        </div>
                    )}

                    {/* Banner informativo de ocorrências abertas (não bloqueia) */}
                    {hasAnyOpenIssue && !isCompleted && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-amber-400 text-xl">warning</span>
                            </div>
                            <div>
                                <h2 className="text-amber-300 font-bold text-sm">
                                    {openIssuesByTaskId.size === 1 ? '1 ocorrência registrada' : `${openIssuesByTaskId.size} ocorrências registradas`}
                                </h2>
                                <p className="text-amber-400/70 text-xs mt-0.5">O gestor foi notificado. Você pode continuar e finalizar a rotina normalmente.</p>
                            </div>
                        </div>
                    )}

                    {/* All done — ready to finalize banner */}
                    {isAllDone && !isCompleted && (
                        <div className="bg-[#13b6ec]/10 border border-[#13b6ec]/30 rounded-2xl p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#13b6ec] rounded-full flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(19,182,236,0.4)]">
                                <span className="material-symbols-outlined text-[#0a1215] text-xl font-bold">celebration</span>
                            </div>
                            <div>
                                <h2 className="text-[#13b6ec] font-bold text-sm">Todas as tarefas concluídas!</h2>
                                <p className="text-[#13b6ec]/70 text-xs mt-0.5">Clique em &quot;Finalizar Atividade&quot; para encerrar.</p>
                            </div>
                        </div>
                    )}

                    {/* Task List */}
                    <div className="flex flex-col gap-3">
                        {tasks.map((task, index) => {
                            const execution = executions?.find(e => e.task_id === task.id);

                            // Sequential lock logic
                            const enforceSequential = checklist.enforce_sequential_order;
                            let isAccessBlocked = false;

                            if (enforceSequential && index > 0) {
                                const prevTask = tasks[index - 1];
                                const prevExecution = executions?.find(e => e.task_id === prevTask.id);
                                if (!prevExecution || prevExecution.status !== 'done') {
                                    isAccessBlocked = true;
                                }
                            }

                            return (
                                <ExecutionItem
                                    key={task.id}
                                    task={task}
                                    execution={execution}
                                    onToggle={handleToggle}
                                    onReportProblem={handleReportProblem}
                                    onEditIssue={handleEditIssue}
                                    locked={isCompleted || isAccessBlocked}
                                    isBlockedSequential={isAccessBlocked}
                                    restaurantId={restaurantId ?? ''}
                                    hasOpenIssue={openIssuesByTaskId.has(task.id)}
                                    myOpenIssue={myOpenIssueByTaskId.get(task.id) ?? null}
                                />
                            );
                        })}
                        {tasks.length === 0 && (
                            <div className="text-center py-10 text-[#92bbc9] bg-[#1a2c32] rounded-2xl border border-dashed border-[#233f48]">
                                Nenhum item neste checklist.
                            </div>
                        )}
                    </div>

                    {/* Observation Field */}
                    {isAllDone && !isCompleted && (
                        <div className="mt-6 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <label className="text-white text-base font-bold ml-1 flex flex-col">
                                Observações (opcional)
                                <span className="text-xs text-[#92bbc9] mt-0.5 font-normal">Algum problema ou observação sobre a rotina?</span>
                            </label>
                            <textarea
                                value={observation}
                                onChange={(e) => setObservation(e.target.value)}
                                placeholder="Digite algo, se necessário..."
                                className="w-full bg-[#1a2c32] border border-[#233f48] rounded-xl p-4 text-white text-base placeholder:text-[#92bbc9]/50 focus:outline-none focus:border-[#13b6ec] focus:ring-1 focus:ring-[#13b6ec] resize-none transition-all min-h-[120px]"
                            />
                        </div>
                    )}

                    {/* Exibição da Observação após concluído */}
                    {isCompleted && assumption?.observation && (
                        <div className="mt-6 flex flex-col gap-2">
                            <label className="text-white text-base font-bold ml-1 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#92bbc9] text-xl">chat</span>
                                Observações do colaborador
                            </label>
                            <div className="w-full bg-[#1a2c32] border border-[#233f48] rounded-xl p-4 text-[#92bbc9] text-base min-h-[120px] whitespace-pre-wrap leading-relaxed">
                                {assumption.observation}
                            </div>
                        </div>
                    )}

                </div>
            </main>

            {/* Bottom Action */}
            <div className="fixed bottom-0 left-0 lg:left-64 right-0 px-4 pt-4 pb-20 lg:pb-4 bg-gradient-to-t from-[#0a1215] via-[#0a1215]/95 to-transparent z-40">
                <div className="max-w-[480px] mx-auto flex flex-col gap-2">
                    {isCompleted ? (
                        <button
                            onClick={() => router.push('/turno')}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base py-4 rounded-xl shadow-[0_8px_20px_rgba(16,185,129,0.2)] active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                            Voltar ao Turno
                        </button>
                    ) : isAllDone ? (
                        <button
                            onClick={() => setShowFinalizeModal(true)}
                            className="w-full bg-[#13b6ec] hover:bg-[#10a1d4] text-[#0a1215] font-bold text-base py-4 rounded-xl shadow-[0_8px_20px_rgba(19,182,236,0.3)] active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[20px]">check_circle</span>
                            Finalizar Atividade
                        </button>
                    ) : (
                        <div className="text-center text-[#325a67] text-xs py-2">
                            Complete todas as tarefas para finalizar
                        </div>
                    )}
                </div>
            </div>

            {/* Finalize Confirmation Modal */}
            {showFinalizeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl w-full max-w-[360px] flex flex-col gap-0 shadow-2xl overflow-hidden">
                        <div className="p-6 flex flex-col gap-3">
                            <div className="w-12 h-12 bg-[#13b6ec]/15 rounded-full flex items-center justify-center mb-1">
                                <span className="material-symbols-outlined text-[#13b6ec] text-2xl">task_alt</span>
                            </div>
                            <h3 className="text-white font-bold text-lg leading-tight">Finalizar atividade</h3>
                            <p className="text-[#92bbc9] text-sm leading-relaxed">
                                Você tem certeza que deseja finalizar esta atividade?
                                Após finalizar, as tarefas não poderão mais ser alteradas.
                            </p>
                            {hasAnyOpenIssue && (
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
                                    <span className="material-symbols-outlined text-amber-400 text-[16px] shrink-0 mt-0.5">warning</span>
                                    <p className="text-amber-300 text-xs leading-snug">
                                        Esta rotina será finalizada com ocorrência aberta. O gestor já foi notificado.
                                    </p>
                                </div>
                            )}
                            {photoValidationError && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                                    <span className="material-symbols-outlined text-red-400 text-[16px] shrink-0 mt-0.5">error</span>
                                    <p className="text-red-400 text-xs font-semibold leading-snug">{photoValidationError}</p>
                                </div>
                            )}
                        </div>
                        <div className="flex border-t border-[#233f48]">
                            <button
                                onClick={() => setShowFinalizeModal(false)}
                                disabled={finalizing}
                                className="flex-1 py-4 text-[#92bbc9] font-bold text-sm hover:bg-[#233f48]/50 transition-colors border-r border-[#233f48] disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmFinalize}
                                disabled={finalizing}
                                className="flex-1 py-4 text-[#13b6ec] font-bold text-sm hover:bg-[#13b6ec]/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {finalizing ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                        Finalizando...
                                    </>
                                ) : (
                                    'Confirmar Finalização'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de registrar/editar ocorrência (Sprint 46) */}
            {reportModalTaskId && reportingTask && restaurantId && (
                <IssueReportModal
                    isOpen={!!reportModalTaskId}
                    onClose={closeIssueModal}
                    restaurantId={restaurantId}
                    taskId={reportingTask.id}
                    taskTitle={reportingTask.title}
                    checklistId={checklistId}
                    checklistAssumptionId={assumption?.id ?? null}
                    taskExecutionId={reportingExecution?.id ?? null}
                    existingIssue={editingIssue}
                    onCreated={() => setIssueFlash({ kind: 'created' })}
                    onUpdated={() => setIssueFlash({ kind: 'updated' })}
                />
            )}
        </div>
    );
}
