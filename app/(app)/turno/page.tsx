'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useKanbanTasks, useAssumeTask, useUpdateTaskStatus, KanbanTask, KanbanExecution } from '@/lib/hooks/use-tasks';
import { usePurchaseLists } from '@/lib/hooks/use-purchases';
import { useUserRoles } from '@/lib/hooks/use-user-roles-shifts';
import { useShifts } from '@/lib/hooks/use-shifts';
import { getCurrentShift } from '@/lib/utils';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function KanbanPage() {
    const { restaurantId } = useRestaurantStore();

    const [user, setUser] = useState<{ id: string; name: string } | null>(null);

    // Fetch auth user
    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => {
            if (data.user) {
                setUser({ id: data.user.id, name: data.user.user_metadata?.name || 'Membro' });
            }
        });
    }, []);

    const { data: kanbanData, isLoading: loadingKanban } = useKanbanTasks(restaurantId || undefined);
    const { data: shifts = [] } = useShifts(restaurantId || undefined);
    const { data: userRolesData = [] } = useUserRoles(restaurantId || undefined, user?.id);
    const { data: purchaseLists = [] } = usePurchaseLists(restaurantId || undefined, 'open');

    const assumeTask = useAssumeTask();
    const updateTask = useUpdateTaskStatus();

    const [timeNow, setTimeNow] = useState<string>('');

    useEffect(() => {
        setTimeNow(new Date().toTimeString().slice(0, 5));
        const interval = setInterval(() => setTimeNow(new Date().toTimeString().slice(0, 5)), 60000);
        return () => clearInterval(interval);
    }, []);

    // Derived states
    const currentShift = useMemo(() => getCurrentShift(shifts, timeNow), [shifts, timeNow]);

    const userRoleIds = useMemo(() => userRolesData.map(ur => ur.role_id), [userRolesData]);
    const hasNoRoles = user !== null && userRolesData.length === 0;

    const activePurchaseList = useMemo(() => {
        if (!userRoleIds.length) return null;
        return purchaseLists.find(pl => pl.target_role_ids?.some((id: string) => userRoleIds.includes(id)));
    }, [purchaseLists, userRoleIds]);

    const { todoTasks, doingExecs, doneExecs, flaggedExecs } = useMemo(() => {
        if (!kanbanData || !user) return { todoTasks: [], doingExecs: [], doneExecs: [], flaggedExecs: [] };

        const { tasks, executions } = kanbanData;
        const execMapByTaskId = new Map(executions.map(e => [e.task_id, e]));

        // Para fazer: Tasks that do NOT have a non-skipped execution today
        const todo = tasks.filter(t => {
            const exec = execMapByTaskId.get(t.id);
            return !exec || exec.status === 'skipped';
        });

        // Ordenar: is_required=true primeiro
        todo.sort((a, b) => {
            const aReq = (a as { is_required?: boolean }).is_required ? 1 : 0;
            const bReq = (b as { is_required?: boolean }).is_required ? 1 : 0;
            return bReq - aReq;
        });

        const doing = executions.filter(e => e.status === 'doing');
        const done = executions.filter(e => e.status === 'done');
        const flagged = executions.filter(e => e.status === 'flagged');

        // Append task info to executions
        const mapTask = (e: KanbanExecution) => ({ ...e, task: tasks.find(t => t.id === e.task_id) });

        return {
            todoTasks: todo,
            doingExecs: doing.map(mapTask).filter(e => e.task),
            doneExecs: done.map(mapTask).filter(e => e.task),
            flaggedExecs: flagged.map(mapTask).filter(e => e.task),
        };
    }, [kanbanData, user]);

    const allRequiredDone = useMemo(() => {
        if (!kanbanData) return false;
        const requiredTasks = kanbanData.tasks.filter(t => (t as { is_required?: boolean }).is_required);
        if (requiredTasks.length === 0) return false;
        const execMapByTaskId = new Map(kanbanData.executions.map(e => [e.task_id, e]));
        return requiredTasks.every(t => {
            const exec = execMapByTaskId.get(t.id);
            return exec && exec.status === 'done';
        });
    }, [kanbanData]);

    // Modals
    const [assumeModal, setAssumeModal] = useState<KanbanTask | null>(null);
    const [problemModal, setProblemModal] = useState<KanbanExecution & { task?: KanbanTask } | null>(null);
    const [problemText, setProblemText] = useState('');

    const handleAssume = async (task: KanbanTask) => {
        if (!restaurantId || !task) return;
        try {
            await assumeTask.mutateAsync({ restaurantId, taskId: task.id, checklistId: task.checklist_id });
            setAssumeModal(null);
        } catch (e: unknown) {
            alert((e as Error).message || 'Erro ao assumir tarefa. Limite atingido?');
        }
    };

    const handleConcluir = async (exec: KanbanExecution, file?: File) => {
        if (!restaurantId || !user) return;

        let photoUrl = undefined;
        if (file) {
            const supabase = createClient();
            const filePath = `${restaurantId}/${exec.id}/${Date.now()}_${file.name}`;
            const { error } = await supabase.storage.from('photos').upload(filePath, file);
            if (error) {
                alert('Erro no upload da foto: ' + error.message);
                return;
            }
            const { data: publicUrlData } = supabase.storage.from('photos').getPublicUrl(filePath);
            photoUrl = publicUrlData.publicUrl;
        }

        try {
            await updateTask.mutateAsync({
                restaurantId,
                executionId: exec.id,
                status: 'done',
                photo_url: photoUrl
            });
        } catch (e: unknown) {
            alert('Erro ao concluir: ' + (e as Error).message);
        }
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, exec: KanbanExecution) => {
        if (e.target.files && e.target.files[0]) {
            handleConcluir(exec, e.target.files[0]);
        }
    };

    const handleProblemaSubmit = async () => {
        if (!restaurantId || !problemModal) return;
        try {
            await updateTask.mutateAsync({
                restaurantId,
                executionId: problemModal.id,
                status: 'flagged',
                notes: problemText
            });
            setProblemModal(null);
            setProblemText('');
        } catch (e: unknown) {
            alert('Erro ao registrar problema: ' + (e as Error).message);
        }
    };

    // UI Helpers
    const getGreeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Bom dia';
        if (h < 18) return 'Boa tarde';
        return 'Boa noite';
    };

    const timeAgo = (dateStr: string) => {
        const diff = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 60000);
        return diff < 1 ? 'agora' : `há ${diff}m`;
    };

    return (
        <div className="min-h-full bg-[#101d22] font-sans pb-20">
            {/* Header fixo */}
            <header className="sticky top-0 z-30 bg-[#101d22]/95 backdrop-blur border-b border-[#233f48] px-4 py-4 md:px-8">
                <div className="max-w-[480px] mx-auto w-full flex flex-col gap-2">
                    <h1 className="text-white text-xl md:text-2xl font-black">
                        {getGreeting()}, {user?.name.split(' ')[0] || '...'}
                    </h1>
                    <div className="flex justify-between items-center text-sm font-medium">
                        <span className="text-[#13b6ec]">
                            {currentShift ? `Turno: ${currentShift.name}` : 'Fora do horário de turno'}
                        </span>
                        <span className="text-[#92bbc9] bg-[#1a2c32] px-2 py-1 rounded-md border border-[#233f48]">
                            {todoTasks.length} tarefas para fazer
                        </span>
                    </div>
                </div>
            </header>

            <main className="max-w-[480px] mx-auto w-full p-4 flex flex-col gap-6">

                {/* Banner todas obrigatórias concluídas */}
                {allRequiredDone && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3">
                        <span className="material-symbols-outlined text-emerald-400 text-xl shrink-0">task_alt</span>
                        <p className="text-emerald-300 font-bold text-sm">Todas as tarefas obrigatórias concluídas!</p>
                    </div>
                )}

                {/* Banner sem área atribuída */}
                {hasNoRoles && (
                    <div className="bg-[#1a2c32] border border-amber-500/40 rounded-xl p-4 flex items-start gap-3">
                        <span className="material-symbols-outlined text-amber-400 text-xl shrink-0 mt-0.5">warning</span>
                        <div>
                            <p className="text-amber-300 font-bold text-sm">Você não tem área atribuída</p>
                            <p className="text-[#92bbc9] text-xs mt-0.5">Fale com seu gestor para ser adicionado a uma área. Enquanto isso, apenas tarefas gerais são exibidas.</p>
                        </div>
                    </div>
                )}

                {/* Banner de recebimento */}
                {activePurchaseList && (
                    <div className="bg-[#1a2c32] border border-[#f59e0b] rounded-xl p-4 flex flex-col gap-3 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                        <div className="flex items-center gap-2 text-[#f59e0b] font-bold text-sm">
                            <span className="material-symbols-outlined">inventory_2</span>
                            📦 Pedido aguardando conferência
                        </div>
                        <p className="text-[#92bbc9] text-xs">A lista &ldquo;{activePurchaseList.title}&rdquo; tem itens designados para sua função que acabaram de chegar.</p>
                        <Link href={`/recebimento/${activePurchaseList.id}`} className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 bg-[#f59e0b] hover:bg-[#d97706] text-[#111e22] rounded-lg font-bold transition-colors">
                            <span className="material-symbols-outlined text-lg">fact_check</span> Conferir Agora
                        </Link>
                    </div>
                )}

                {loadingKanban ? (
                    <div className="flex flex-col gap-3 animate-pulse">
                        <div className="h-10 bg-[#1a2c32] rounded-lg w-full mb-4" />
                        <div className="h-24 bg-[#1a2c32] rounded-xl w-full" />
                        <div className="h-24 bg-[#1a2c32] rounded-xl w-full" />
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">

                        {/* PARA FAZER */}
                        <section className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#92bbc9]">list_alt</span>
                                <h2 className="text-white font-bold tracking-wide uppercase text-sm">Para Fazer</h2>
                                <span className="ml-auto bg-[#233f48] text-white text-xs px-2 py-0.5 rounded-full">{todoTasks.length}</span>
                            </div>

                            {todoTasks.length === 0 ? (
                                <div className="text-center py-8 text-[#92bbc9] text-sm bg-[#1a2c32] rounded-xl border border-dashed border-[#233f48]">
                                    {kanbanData?.tasks.length === 0 ? "Nenhum checklist ativo para você" : "✓ Todas as tarefas concluídas!"}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {todoTasks.map(task => {
                                        const isAssignedToOther = task.assigned_to_user_id && task.assigned_to_user_id !== user?.id;
                                        const isRequired = (task as { is_required?: boolean }).is_required;
                                        return (
                                            <div key={task.id}
                                                onClick={() => !isAssignedToOther && setAssumeModal(task)}
                                                className={`bg-[#1a2c32] rounded-xl p-3 flex flex-col gap-2 shadow-sm transition-all ${isRequired ? 'border-l-4 border-[#13b6ec] border border-[#13b6ec]/30' : 'border-l-4 border-[#233f48]'} ${!isAssignedToOther ? 'cursor-pointer hover:bg-[#1f363d]' : 'opacity-75'}`}>

                                                <div className="flex justify-between items-start gap-3">
                                                    <span className="text-white text-sm font-medium leading-snug">{task.title}</span>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        {isRequired && (
                                                            <span className="bg-[#13b6ec]/10 text-[#13b6ec] text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[12px]">bolt</span> Obrigatório
                                                            </span>
                                                        )}
                                                        {task.is_critical && (
                                                            <span className="bg-red-500/10 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">Crítica</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 mt-1 text-xs font-medium text-[#92bbc9]">
                                                    {task.requires_photo && (
                                                        <span className="flex items-center gap-1 text-amber-400"><span className="material-symbols-outlined text-[14px]">photo_camera</span> Foto</span>
                                                    )}
                                                    {isAssignedToOther ? (
                                                        <span className="text-[#325a67]">Atribuída a outro</span>
                                                    ) : (
                                                        <span className="text-[#13b6ec] ml-auto">Toque para assumir</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* FAZENDO */}
                        {doingExecs.length > 0 && (
                            <section className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400">hourglass_top</span>
                                    <h2 className="text-amber-400 font-bold tracking-wide uppercase text-sm">Fazendo</h2>
                                    <span className="ml-auto bg-amber-400/20 text-amber-400 text-xs px-2 py-0.5 rounded-full">{doingExecs.length}</span>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {doingExecs.map(exec => (
                                        <div key={exec.id} className="bg-[#1a2c32] border border-amber-500/20 rounded-xl p-4 flex flex-col gap-4">
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-white text-sm font-medium leading-snug">{exec.task?.title}</span>
                                                <span className="text-amber-400 text-[10px] font-bold shrink-0">{timeAgo(exec.executed_at)}</span>
                                            </div>

                                            <div className="flex gap-2">
                                                {exec.task?.requires_photo ? (
                                                    <label className="flex-1 cursor-pointer">
                                                        <div className="flex items-center justify-center gap-2 bg-[#13b6ec]/10 hover:bg-[#13b6ec]/20 text-[#13b6ec] py-2 rounded-lg text-sm font-bold transition-colors">
                                                            <span className="material-symbols-outlined text-base">photo_camera</span> Concluir c/ Foto
                                                        </div>
                                                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoUpload(e, exec)} />
                                                    </label>
                                                ) : (
                                                    <button onClick={() => handleConcluir(exec)} className="flex-1 flex items-center justify-center gap-2 bg-[#13b6ec]/10 hover:bg-[#13b6ec]/20 text-[#13b6ec] py-2 rounded-lg text-sm font-bold transition-colors">
                                                        <span className="material-symbols-outlined text-base">check</span> Concluir
                                                    </button>
                                                )}
                                                <button onClick={() => setProblemModal(exec)} className="px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg flex items-center justify-center transition-colors border border-red-500/20">
                                                    <span className="material-symbols-outlined text-base">warning</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* IMPEDIDO */}
                        {flaggedExecs.length > 0 && (
                            <section className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-red-400">block</span>
                                    <h2 className="text-red-400 font-bold tracking-wide uppercase text-sm">Com Problema</h2>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {flaggedExecs.map(exec => (
                                        <div key={exec.id} className="bg-red-950/20 border border-red-900/50 rounded-xl p-3 flex flex-col gap-3 border-l-4 border-l-red-500">
                                            <span className="text-white text-sm font-medium">{exec.task?.title}</span>
                                            <p className="text-red-300 text-xs italic bg-red-950/40 p-2 rounded -mt-1">&ldquo;{exec.notes}&rdquo;</p>
                                            <button onClick={() => updateTask.mutate({ restaurantId: restaurantId!, executionId: exec.id, status: 'doing' })} className="w-full py-1.5 bg-red-500/10 text-red-400 text-xs font-bold rounded-md hover:bg-red-500/20 uppercase tracking-widest mt-1">
                                                Retomar Tarefa
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* CONCLUÍDAS (Collapsible natively via HTML details, simple implementation) */}
                        <details className="group">
                            <summary className="flex items-center justify-between cursor-pointer p-3 bg-[#1a2c32] rounded-xl border border-[#233f48] select-none list-none [&::-webkit-details-marker]:hidden">
                                <div className="flex items-center gap-2 text-emerald-400">
                                    <span className="material-symbols-outlined text-lg">task_alt</span>
                                    <h2 className="font-bold tracking-wide uppercase text-sm">Concluídas hoje</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="bg-emerald-400/10 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-bold">{doneExecs.length}</span>
                                    <span className="material-symbols-outlined text-[#92bbc9] group-open:rotate-180 transition-transform">expand_more</span>
                                </div>
                            </summary>
                            <div className="flex flex-col gap-2 mt-3 pl-2 border-l-2 border-emerald-900/30">
                                {doneExecs.length === 0 && <span className="text-[#325a67] text-xs p-2">Nenhuma tarefa finalizada hoje.</span>}
                                {doneExecs.map(exec => (
                                    <div key={exec.id} className="flex justify-between items-center bg-[#1a2c32]/50 rounded-lg p-2 filter grayscale-[50%] opacity-80">
                                        <span className="text-white text-xs truncate max-w-[70%]">{exec.task?.title}</span>
                                        <span className="text-[#92bbc9] text-[10px]">{new Date(exec.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                ))}
                            </div>
                        </details>

                    </div>
                )}
            </main>

            {/* Modals */}
            {assumeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl p-5 w-full max-w-[360px] flex flex-col gap-4 shadow-xl">
                        <h3 className="text-white font-bold text-lg leading-tight">Assumir Tarefa</h3>
                        <p className="text-[#92bbc9] text-sm">Deseja ser o responsável por: <strong className="text-white">&ldquo;{assumeModal.title}&rdquo;</strong>?</p>
                        {assumeModal.requires_photo && (
                            <div className="bg-amber-400/10 text-amber-400 text-xs p-2 rounded-lg flex items-center gap-2 font-medium">
                                <span className="material-symbols-outlined text-base">photo_camera</span> Ao concluir, uma foto será exigida.
                            </div>
                        )}
                        <div className="flex gap-3 mt-2">
                            <button onClick={() => setAssumeModal(null)} className="flex-1 py-2.5 rounded-xl bg-[#233f48] text-white font-medium hover:bg-[#2c4e5a] transition-colors text-sm">Cancelar</button>
                            <button onClick={() => handleAssume(assumeModal)} className="flex-1 py-2.5 rounded-xl bg-[#13b6ec] text-[#111e22] font-bold hover:bg-[#10a1d4] transition-colors shadow-[0_0_15px_rgba(19,182,236,0.2)] text-sm">Assumir</button>
                        </div>
                    </div>
                </div>
            )}

            {problemModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl p-5 w-full max-w-[360px] flex flex-col gap-4 shadow-xl">
                        <div className="flex items-center gap-2 text-red-400">
                            <span className="material-symbols-outlined text-2xl">warning</span>
                            <h3 className="font-bold text-lg">Reportar Problema</h3>
                        </div>
                        <p className="text-[#92bbc9] text-xs leading-relaxed">A tarefa de <strong className="text-white">&ldquo;{problemModal.task?.title}&rdquo;</strong> será pausada. Descreva o motivo do impedimento abaixo.</p>

                        <textarea
                            autoFocus
                            value={problemText}
                            onChange={(e) => setProblemText(e.target.value)}
                            className="bg-[#101d22] border border-[#233f48] rounded-xl p-3 text-white text-sm focus:border-red-400 focus:outline-none min-h-[100px] resize-none"
                            placeholder="Ex: Faltou material XYZ..."
                        />

                        <div className="flex gap-3 mt-2">
                            <button onClick={() => { setProblemModal(null); setProblemText(''); }} className="flex-1 py-2.5 rounded-xl bg-[#233f48] text-white font-medium text-sm">Cancelar</button>
                            <button
                                onClick={handleProblemaSubmit}
                                disabled={!problemText.trim()}
                                className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-500 border border-red-500/30 font-bold disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wide">
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
