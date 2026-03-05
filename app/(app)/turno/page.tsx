'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useChecklists } from '@/lib/hooks/use-checklists';
import { useTurnoAtual, useCreateExecucao } from '@/lib/hooks/use-execucoes';
import { useRouter } from 'next/navigation';
import { Checklist, ChecklistTask } from '@/lib/types';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskWithMeta extends ChecklistTask {
    checklist: Checklist;
    executionStatus?: 'done' | 'skipped' | 'flagged';
}

interface ColleagueUser {
    id: string;
    name: string;
    avatar_url: string | null;
}

interface ToastState {
    id: number;
    message: string;
    type: 'info' | 'error' | 'success';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getShiftNow = (): 'morning' | 'afternoon' | 'evening' => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
};

const getShiftEndHour = (shift: 'morning' | 'afternoon' | 'evening'): number => {
    const map = { morning: 12, afternoon: 18, evening: 24 };
    return map[shift];
};

const getShiftLabel = (shift: 'morning' | 'afternoon' | 'evening'): string => {
    const map = { morning: '06:00 - 12:00', afternoon: '12:00 - 18:00', evening: '18:00 - 00:00' };
    return map[shift];
};

const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
};

const getInitials = (name: string): string =>
    name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToastContainer({ toasts, onRemove }: { toasts: ToastState[]; onRemove: (id: number) => void }) {
    return (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    onClick={() => onRemove(toast.id)}
                    className={`
            pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium
            animate-[slideIn_0.2s_ease-out] cursor-pointer
            ${toast.type === 'error' ? 'bg-red-500/90 text-white' : ''}
            ${toast.type === 'success' ? 'bg-green-500/90 text-white' : ''}
            ${toast.type === 'info' ? 'bg-[#1a2c32] text-white border border-[#233f48]' : ''}
          `}
                >
                    <span className="material-symbols-outlined text-[18px]">
                        {toast.type === 'error' ? 'error' : toast.type === 'success' ? 'check_circle' : 'info'}
                    </span>
                    {toast.message}
                </div>
            ))}
        </div>
    );
}

function SkeletonCard() {
    return (
        <div className="bg-[#1a2c32] rounded-xl p-4 flex items-center gap-4 animate-pulse">
            <div className="size-6 rounded bg-[#233f48] shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
                <div className="h-4 w-3/4 rounded bg-[#233f48]" />
                <div className="h-3 w-1/2 rounded bg-[#233f48]" />
            </div>
        </div>
    );
}

function Avatar({ name, url, size = 'md' }: { name: string; url?: string | null; size?: 'sm' | 'md' }) {
    const dim = size === 'sm' ? 'size-8' : 'size-10';
    if (url) {
        return (
            <div
                className={`${dim} rounded-full bg-cover bg-center ring-2 ring-[#111e22]`}
                style={{ backgroundImage: `url(${url})` }}
                aria-label={name}
            />
        );
    }
    return (
        <div className={`${dim} rounded-full ring-2 ring-[#111e22] bg-[#233f48] flex items-center justify-center text-xs font-bold text-white`}>
            {getInitials(name)}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomeTurnoPage() {
    const router = useRouter();
    const { restaurantId, restaurantName, userRole } = useRestaurantStore();

    const { data: checklists, isLoading: isLoadingChecklists, error: checklistsError, refetch: refetchChecklists } = useChecklists(restaurantId || undefined);
    const { data: execucoes, isLoading: isLoadingExecucoes, error: execucoesError, refetch: refetchExecucoes } = useTurnoAtual(restaurantId || null);
    const createExecucao = useCreateExecucao();

    const [userName, setUserName] = useState('');
    const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
    const [showEndModal, setShowEndModal] = useState(false);
    const [toasts, setToasts] = useState<ToastState[]>([]);
    const [isMounted, setIsMounted] = useState(false);
    const [countdown, setCountdown] = useState('');
    const [colleagues, setColleagues] = useState<ColleagueUser[]>([]);
    const toastIdRef = useRef(0);

    // ── Auth redirect ──
    useEffect(() => {
        if (userRole && userRole !== 'staff') {
            router.replace('/dashboard');
        }
    }, [userRole, router]);

    // ── Fetch user info ──
    useEffect(() => {
        createClient().auth.getUser().then(({ data }) => {
            if (data.user?.user_metadata?.name) setUserName(data.user.user_metadata.name);
            if (data.user?.user_metadata?.avatar_url) setUserAvatarUrl(data.user.user_metadata.avatar_url);
        });
    }, []);

    // ── Fetch colleagues ──
    useEffect(() => {
        if (!restaurantId) return;
        const supabase = createClient();
        supabase
            .from('restaurant_users')
            .select('id, name, avatar_url')
            .eq('restaurant_id', restaurantId)
            .eq('role', 'staff')
            .eq('active', true)
            .limit(5)
            .then(({ data }) => {
                if (data) setColleagues(data as ColleagueUser[]);
            });
    }, [restaurantId]);

    // ── Mount flag (prevent hydration mismatch for date-based values) ──
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // ── Countdown timer ──
    useEffect(() => {
        if (!isMounted) return;
        const currentShift = getShiftNow();
        const endHour = getShiftEndHour(currentShift);

        const tick = () => {
            const now = new Date();
            const end = new Date();
            end.setHours(endHour % 24, 0, 0, 0);
            if (endHour === 24) end.setDate(end.getDate() + 1);
            const diff = Math.max(0, end.getTime() - now.getTime());
            const h = String(Math.floor(diff / 3_600_000)).padStart(2, '0');
            const m = String(Math.floor((diff % 3_600_000) / 60_000)).padStart(2, '0');
            const s = String(Math.floor((diff % 60_000) / 1_000)).padStart(2, '0');
            setCountdown(`${h}:${m}:${s}`);
        };

        tick();
        const interval = setInterval(tick, 1_000);
        return () => clearInterval(interval);
    }, [isMounted]);

    // ── Toast helpers ──
    const addToast = useCallback((message: string, type: ToastState['type'] = 'info') => {
        const id = ++toastIdRef.current;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3_500);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // ── Task data ──
    const currentShift = getShiftNow();

    const { allTasks, pendingTasks, completedTasks, urgentTasks, tasksByShift } = useMemo(() => {
        if (!checklists || !execucoes) return { allTasks: [], pendingTasks: [], completedTasks: [], urgentTasks: [], tasksByShift: {} as Record<string, TaskWithMeta[]> };

        const execMap = new Map<string, 'done' | 'skipped' | 'flagged'>(
            (execucoes as Array<{ task_id: string; status: 'done' | 'skipped' | 'flagged' }>).map(e => [e.task_id, e.status])
        );

        const activeChecklists = checklists.filter(c => c.active && (c.shift === currentShift || c.shift === 'any'));

        const all: TaskWithMeta[] = [];
        for (const checklist of activeChecklists) {
            for (const task of (checklist.tasks ?? [])) {
                all.push({ ...task, checklist, executionStatus: execMap.get(task.id) });
            }
        }

        const pending = all.filter(t => !t.executionStatus);
        const completed = all.filter(t => t.executionStatus === 'done');
        const urgent = pending.filter(t => t.is_critical);

        // Group pending tasks by checklist shift (for section headers)
        const byShift: Record<string, TaskWithMeta[]> = {};
        for (const task of pending) {
            const shiftKey = task.checklist.shift === 'any' ? currentShift : task.checklist.shift;
            if (!byShift[shiftKey]) byShift[shiftKey] = [];
            byShift[shiftKey].push(task);
        }

        return { allTasks: all, pendingTasks: pending, completedTasks: completed, urgentTasks: urgent, tasksByShift: byShift };
    }, [checklists, execucoes, currentShift]);

    const progress = allTasks.length > 0 ? Math.round((completedTasks.length / allTasks.length) * 100) : 0;
    const nonUrgentPending = pendingTasks.filter(t => !t.is_critical);

    // ── Checkbox handler ──
    const handleCheckbox = useCallback((task: TaskWithMeta, e: React.MouseEvent) => {
        e.stopPropagation();
        if (task.requires_photo) {
            addToast('Esta tarefa exige foto. Clique para abrir.', 'info');
            router.push(`/turno/tarefa/${task.id}?c=${task.checklist_id}`);
            return;
        }
        if (!restaurantId) return;
        createExecucao.mutate({
            task_id: task.id,
            checklist_id: task.checklist_id,
            restaurant_id: restaurantId,
            status: 'done',
        }, {
            onSuccess: () => addToast('Tarefa concluída!', 'success'),
            onError: (err: unknown) => addToast(err instanceof Error ? err.message : 'Erro ao concluir tarefa', 'error'),
        });
    }, [restaurantId, createExecucao, addToast, router]);

    // ── Countdown parts ──
    const [ctH, ctM, ctS] = countdown ? countdown.split(':') : ['--', '--', '--'];

    const isLoading = isLoadingChecklists || isLoadingExecucoes;
    const hasError = checklistsError || execucoesError;

    const handleRetry = () => {
        refetchChecklists();
        refetchExecucoes();
    };

    // ─── Task Card (pending) ──────────────────────────────────────────────────────
    const TaskCard = ({ task }: { task: TaskWithMeta }) => (
        <div
            onClick={() => router.push(`/turno/tarefa/${task.id}?c=${task.checklist_id}`)}
            className="bg-[#1a2c32] hover:bg-[#1f363d] rounded-xl p-4 flex items-center gap-4 group transition-colors cursor-pointer select-none"
        >
            {/* Checkbox */}
            <div
                className="relative flex items-center justify-center size-6 shrink-0"
                onClick={(e) => handleCheckbox(task, e)}
            >
                <div className="size-6 border-2 border-[#92bbc9] rounded hover:border-[#13b6ec] transition-colors" />
            </div>

            {/* Title + chips */}
            <div className="flex-1 flex flex-col md:flex-row md:items-center gap-1 md:gap-4 min-w-0">
                <span className="text-white font-medium text-base group-hover:text-[#13b6ec] transition-colors truncate">
                    {task.title}
                </span>
                <div className="flex items-center gap-2 md:ml-auto shrink-0 flex-wrap">
                    {task.checklist.category && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#233f48] text-[#92bbc9]">
                            {task.checklist.category}
                        </span>
                    )}
                    {task.requires_photo && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-900/30 text-amber-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[11px]">photo_camera</span>
                            Foto
                        </span>
                    )}
                </div>
            </div>

            {/* Document icon */}
            <div className="text-[#92bbc9] hover:text-white transition-colors p-1 shrink-0">
                <span className="material-symbols-outlined text-[20px]">description</span>
            </div>
        </div>
    );

    // ─── Completed Task ──────────────────────────────────────────────────────────
    const CompletedTaskCard = ({ task }: { task: TaskWithMeta }) => (
        <div className="bg-[#1a2c32]/50 rounded-xl p-4 flex items-center gap-4 opacity-60">
            <div className="relative flex items-center justify-center size-6 shrink-0">
                <div className="size-6 rounded bg-[#13b6ec] border-2 border-[#13b6ec] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#111e22] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                </div>
            </div>
            <div className="flex-1 flex flex-col md:flex-row md:items-center gap-1 md:gap-4 min-w-0">
                <span className="text-[#92bbc9] line-through font-medium text-base truncate">{task.title}</span>
                <div className="flex items-center gap-2 md:ml-auto shrink-0">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#233f48] text-[#92bbc9]">
                        Concluído
                    </span>
                </div>
            </div>
        </div>
    );

    // ─── Render ───────────────────────────────────────────────────────────────────
    return (
        <>
            {/* Global animations */}
            <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(1rem); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

            <ToastContainer toasts={toasts} onRemove={removeToast} />

            <div className="relative min-h-full bg-[#101d22] font-sans">
                {/* ── Main Content Area ── */}
                <main className="w-full flex-1 p-4 md:p-8 lg:p-10 flex flex-col gap-8 mx-auto max-w-[1400px]">

                    {/* Greeting */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex flex-col gap-1">
                            <h1 className="text-white text-3xl md:text-4xl font-black leading-tight tracking-tight">
                                {isMounted ? getGreeting() : 'Olá'}, {userName.split(' ')[0] || '...'}
                            </h1>
                            <p className="text-[#92bbc9] text-base">
                                {pendingTasks.length > 0
                                    ? `Você tem ${pendingTasks.length} tarefas pendentes.`
                                    : allTasks.length === 0
                                        ? 'Não há tarefas para este turno.'
                                        : 'Todas as tarefas concluídas! 🎉'}
                            </p>
                        </div>
                        <Link
                            href="/historico"
                            className="bg-[#233f48] hover:bg-[#2c4e5a] text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shrink-0"
                        >
                            <span className="material-symbols-outlined text-[18px]">history</span>
                            <span className="text-sm font-medium">Ver Histórico</span>
                        </Link>
                    </div>

                    {/* Error state */}
                    {hasError && (
                        <div className="bg-red-500/10 border border-red-900/50 rounded-xl p-6 flex flex-col items-center gap-3 text-center">
                            <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
                            <p className="text-red-400 font-medium">Erro ao carregar dados do turno</p>
                            <button
                                onClick={handleRetry}
                                className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-colors text-sm font-medium"
                            >
                                Tentar novamente
                            </button>
                        </div>
                    )}

                    {/* Main grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                        {/* ── Left column ── */}
                        <div className="lg:col-span-8 flex flex-col gap-6">

                            {/* Loading skeletons */}
                            {isLoading && (
                                <div className="flex flex-col gap-3">
                                    <SkeletonCard />
                                    <SkeletonCard />
                                    <SkeletonCard />
                                </div>
                            )}

                            {!isLoading && !hasError && (
                                <>
                                    {/* Urgent / Attention section */}
                                    {urgentTasks.length > 0 && (
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center gap-2 text-red-400">
                                                <span className="material-symbols-outlined">warning</span>
                                                <h3 className="text-sm font-bold uppercase tracking-wider">Atenção Necessária</h3>
                                            </div>
                                            {urgentTasks.map(task => (
                                                <div
                                                    key={task.id}
                                                    className="bg-[#2a1a1a] border border-red-900/50 rounded-xl p-4 flex items-center justify-between gap-4 group hover:border-red-500/50 transition-all cursor-pointer"
                                                    onClick={() => router.push(`/turno/tarefa/${task.id}?c=${task.checklist_id}`)}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div
                                                            className="size-6 rounded border-2 border-red-500/50 flex items-center justify-center group-hover:bg-red-500/10 shrink-0"
                                                            onClick={(e) => handleCheckbox(task, e)}
                                                        />
                                                        <div>
                                                            <p className="text-white font-medium line-clamp-1">{task.title}</p>
                                                            <p className="text-red-400 text-sm">Tarefa crítica — não concluída</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); router.push(`/turno/tarefa/${task.id}?c=${task.checklist_id}`); }}
                                                        className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500 hover:text-white transition-colors shrink-0"
                                                    >
                                                        Agir Agora
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Tasks grouped by shift */}
                                    {Object.keys(tasksByShift).length > 0 && (
                                        <div className="flex flex-col gap-6">
                                            {(Object.entries(tasksByShift) as Array<['morning' | 'afternoon' | 'evening', TaskWithMeta[]]>).map(([shift, tasks]) => (
                                                <div key={shift} className="flex flex-col gap-4">
                                                    {/* Section header */}
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-[#13b6ec]">schedule</span>
                                                        <h3 className="text-sm font-bold uppercase tracking-wider text-[#13b6ec] whitespace-nowrap">
                                                            Tarefas {getShiftLabel(shift)}
                                                        </h3>
                                                        <div className="h-px bg-[#233f48] flex-1 ml-2" />
                                                    </div>

                                                    {/* Non-urgent pending for this shift */}
                                                    {tasks.filter(t => !t.is_critical).map(task => (
                                                        <TaskCard key={task.id} task={task} />
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Completed tasks section */}
                                    {completedTasks.length > 0 && (
                                        <div className="flex flex-col gap-4">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-green-500">check_circle</span>
                                                <h3 className="text-sm font-bold uppercase tracking-wider text-green-500 whitespace-nowrap">
                                                    Concluídas ({completedTasks.length})
                                                </h3>
                                                <div className="h-px bg-[#233f48] flex-1 ml-2" />
                                            </div>
                                            {completedTasks.map(task => (
                                                <CompletedTaskCard key={task.id} task={task} />
                                            ))}
                                        </div>
                                    )}

                                    {/* Empty state */}
                                    {allTasks.length === 0 && !isLoading && (
                                        <div className="p-12 text-center bg-[#1a2c32] rounded-xl border border-dashed border-[#233f48]">
                                            <span className="material-symbols-outlined text-5xl text-[#92bbc9] mb-3 block">task_alt</span>
                                            <p className="text-[#92bbc9] font-medium">Nenhuma tarefa pendente para este turno. 🎉</p>
                                        </div>
                                    )}

                                    {/* All done state */}
                                    {allTasks.length > 0 && pendingTasks.length === 0 && !isLoading && (
                                        <div className="p-12 text-center bg-[#1a2c32] rounded-xl border border-dashed border-green-900/50">
                                            <span className="material-symbols-outlined text-5xl text-green-400 mb-3 block">celebration</span>
                                            <p className="text-white font-bold text-lg">Todas as tarefas concluídas!</p>
                                            <p className="text-[#92bbc9] text-sm mt-1">Excelente trabalho neste turno.</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* ── Right column ── */}
                        <div className="lg:col-span-4 flex flex-col gap-6">

                            {/* Countdown card */}
                            <div className="bg-[#1a2c32] rounded-xl p-5 flex flex-col gap-5 shadow-lg shadow-black/20">
                                <div className="flex items-center justify-between pb-4 border-b border-[#233f48]">
                                    <span className="text-sm text-[#92bbc9] font-medium uppercase tracking-wider">Turno Encerra Em</span>
                                    <span className="material-symbols-outlined text-[#92bbc9]">timer</span>
                                </div>

                                {/* HH:MM:SS */}
                                <div className="flex gap-2">
                                    {[{ value: ctH, label: 'Hrs' }, { value: ctM, label: 'Min' }, { value: ctS, label: 'Seg' }].map((item, i, arr) => (
                                        <React.Fragment key={item.label}>
                                            <div className="flex grow basis-0 flex-col items-center gap-1">
                                                <div className="flex h-12 w-full items-center justify-center rounded bg-[#233f48] border border-[#2f4d57]">
                                                    <p className={`text-xl font-bold font-mono tracking-tight ${i === 2 ? 'text-[#13b6ec]' : 'text-white'}`}>
                                                        {item.value}
                                                    </p>
                                                </div>
                                                <p className="text-[#92bbc9] text-[10px] font-medium uppercase">{item.label}</p>
                                            </div>
                                            {i < arr.length - 1 && (
                                                <div className="flex items-center pb-4 text-[#92bbc9] font-bold">:</div>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>

                                {/* Progress bar */}
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between items-end">
                                        <span className="text-white text-sm font-medium">Progresso</span>
                                        <span className="text-[#13b6ec] text-lg font-bold">{progress}%</span>
                                    </div>
                                    <div className="h-2.5 w-full rounded-full bg-[#111e22]">
                                        <div
                                            className="h-full rounded-full bg-[#13b6ec] shadow-[0_0_10px_rgba(19,182,236,0.5)] transition-all duration-500"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                    <p className="text-[#92bbc9] text-xs mt-1 text-right">
                                        {completedTasks.length}/{allTasks.length} Tarefas Feitas
                                    </p>
                                </div>
                            </div>

                            {/* Quick actions */}
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => addToast('Funcionalidade em breve: Relatar Incidente', 'info')}
                                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-[#233f48] hover:bg-[#2c4e5a] transition-all border border-transparent hover:border-[#13b6ec]/30 group"
                                >
                                    <span className="material-symbols-outlined text-3xl text-white group-hover:text-[#13b6ec] transition-colors">assignment_add</span>
                                    <span className="text-sm font-medium text-center text-white">Relatar<br />Incidente</span>
                                </button>

                                <button
                                    onClick={() => addToast('Gerente notificado.', 'info')}
                                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-[#233f48] hover:bg-[#2c4e5a] transition-all border border-transparent hover:border-[#13b6ec]/30 group"
                                >
                                    <span className="material-symbols-outlined text-3xl text-white group-hover:text-[#13b6ec] transition-colors">person_alert</span>
                                    <span className="text-sm font-medium text-center text-white">Chamar<br />Gerente</span>
                                </button>

                                <button
                                    onClick={() => setShowEndModal(true)}
                                    className="col-span-2 flex items-center justify-center gap-3 p-4 rounded-xl bg-[#2a1a1a] hover:bg-[#3d1f1f] text-red-400 hover:text-red-300 transition-colors border border-transparent hover:border-red-500/30"
                                >
                                    <span className="material-symbols-outlined">logout</span>
                                    <span className="text-base font-bold">Encerrar Turno</span>
                                </button>
                            </div>

                            {/* No Turno Agora */}
                            {colleagues.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    <h3 className="text-[#92bbc9] text-xs font-bold uppercase tracking-wider">
                                        No Turno Agora ({colleagues.length})
                                    </h3>
                                    <div className="flex -space-x-3 overflow-hidden">
                                        {colleagues.slice(0, 3).map(c => (
                                            <Avatar key={c.id} name={c.name} url={c.avatar_url} />
                                        ))}
                                        {colleagues.length > 3 && (
                                            <div className="flex items-center justify-center size-10 rounded-full ring-2 ring-[#111e22] bg-[#233f48] text-xs font-bold text-white cursor-pointer hover:bg-[#13b6ec] transition-colors">
                                                +{colleagues.length - 3}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <footer className="text-center mt-6">
                        <p className="text-[#233f48] text-xs">RestaurantOS v2.4.0 © 2026</p>
                    </footer>
                </main>
            </div>

            {/* ── End Shift Modal ── */}
            {showEndModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        onClick={() => setShowEndModal(false)}
                    />
                    <div className="relative bg-[#1a2c32] border border-[#233f48] rounded-2xl p-6 max-w-sm w-full flex flex-col gap-5 shadow-2xl">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-red-400">logout</span>
                                </div>
                                <h3 className="text-white font-bold text-lg">Encerrar Turno</h3>
                            </div>
                            <p className="text-[#92bbc9] text-sm">
                                Tem certeza que deseja encerrar o turno? Esta ação registrará sua saída.
                                {pendingTasks.length > 0 && (
                                    <span className="block mt-2 text-amber-400 font-medium">
                                        ⚠️ Você ainda tem {pendingTasks.length} tarefa{pendingTasks.length > 1 ? 's' : ''} pendente{pendingTasks.length > 1 ? 's' : ''}.
                                    </span>
                                )}
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowEndModal(false)}
                                className="flex-1 px-4 py-3 rounded-xl bg-[#233f48] hover:bg-[#2c4e5a] text-white font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    setShowEndModal(false);
                                    addToast('Turno encerrado com sucesso!', 'success');
                                }}
                                className="flex-1 px-4 py-3 rounded-xl bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white font-bold transition-colors border border-red-500/30"
                            >
                                Encerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
