import React, { useState } from 'react';
import { KanbanTask, KanbanExecution } from '@/lib/hooks/use-tasks';
import { PhotoUpload } from '@/components/tasks/photo-upload';
import { useSignedUrl } from '@/lib/hooks/use-signed-url';

interface ExecutionItemProps {
    task: KanbanTask;
    execution?: KanbanExecution;
    onToggle: (taskId: string, executionId: string | undefined, isDone: boolean, photoUrl?: string) => void;
    locked?: boolean;
    isBlockedSequential?: boolean;
    restaurantId: string;
}

export function ExecutionItem({ task, execution, onToggle, locked = false, isBlockedSequential = false, restaurantId }: ExecutionItemProps) {
    const isDone = Boolean(execution && execution.status === 'done');
    const [isAnimating, setIsAnimating] = useState(false);
    const [pendingPhotoPath, setPendingPhotoPath] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);

    // Para tasks com foto já executadas, exibir preview da foto salva
    const existingPhotoPath = execution?.photo_url ?? undefined;

    const requiresPhoto = Boolean(task.requires_photo);

    // Task simples (sem exigência de foto): comportamento original — o card inteiro é clicável
    const handleSimpleToggle = () => {
        if (locked) return;
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 300);
        onToggle(task.id, execution?.id, !isDone);
    };

    // Task com exigência de foto: botão "Concluir" separado
    const handleConcludeWithPhoto = () => {
        if (!pendingPhotoPath) {
            setPhotoError('Adicione uma foto antes de concluir.');
            return;
        }
        setPhotoError(null);
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 300);
        onToggle(task.id, execution?.id, true, pendingPhotoPath);
    };

    // Desfazer conclusão (desmarcar)
    const handleUndo = () => {
        if (locked) return;
        onToggle(task.id, execution?.id, false);
        setPendingPhotoPath(null);
        setPhotoError(null);
    };

    const donePhotoUrl = useSignedUrl(isDone ? existingPhotoPath : undefined);

    // ── RENDER: task concluída ────────────────────────────────
    if (isDone) {
        return (
            <div className={`
                w-full flex flex-col gap-0 rounded-2xl border text-left
                bg-[#1a2c32]/40 border-[#13b6ec]/30 shadow-[0_4px_12px_rgba(19,182,236,0.05)]
                overflow-hidden relative
            `}>
                {/* Gradiente de fundo */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#13b6ec]/10 to-transparent pointer-events-none" />

                <div className="relative flex items-center gap-4 p-4 min-h-[64px]">
                    <div className="shrink-0 flex items-center justify-center">
                        <div className={`
                            w-7 h-7 rounded-full border-[2px] flex items-center justify-center
                            bg-[#13b6ec] border-[#13b6ec] text-[#0a1215]
                            ${isAnimating ? 'scale-110' : 'scale-100'} transition-transform duration-200
                        `}>
                            <span className="material-symbols-outlined text-[16px] font-bold">check</span>
                        </div>
                    </div>

                    <div className="flex-1 py-1">
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-base font-semibold leading-snug text-white">
                                {task.title}
                            </span>
                        </div>
                        {task.description && (
                            <p className="text-sm mt-1 text-[#92bbc9]/70">{task.description}</p>
                        )}
                        {donePhotoUrl && (
                            <div className="flex items-center gap-1 mt-2 text-[#13b6ec] text-xs font-semibold">
                                <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                                Foto registrada
                            </div>
                        )}
                    </div>

                    {/* Botão desfazer — só exibe se não estiver locked */}
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

                {/* Preview da foto (colapsado, pequeno) */}
                {donePhotoUrl && (
                    <div className="relative mx-4 mb-3 rounded-xl overflow-hidden border border-[#13b6ec]/20 max-h-32">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={donePhotoUrl} alt="Evidência" className="w-full object-cover max-h-32" />
                    </div>
                )}
            </div>
        );
    }

    // ── RENDER: task com exigência de foto (não concluída, não locked) ──
    if (requiresPhoto && !locked) {
        return (
            <div className="w-full flex flex-col rounded-2xl border text-left bg-[#16262c] border-[#233f48] shadow-sm overflow-hidden">
                {/* Header da task — informativo, não clicável para concluir */}
                <div className="flex items-start gap-4 p-4 min-h-[64px]">
                    <div className="shrink-0 flex items-center justify-center pt-0.5">
                        <div className="w-7 h-7 rounded-full border-[2px] border-[#325a67] bg-transparent flex items-center justify-center">
                            <span className="material-symbols-outlined text-[14px] text-amber-400">photo_camera</span>
                        </div>
                    </div>

                    <div className="flex-1 py-1">
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-base font-semibold leading-snug text-[#e0e0e0]">
                                {task.title}
                            </span>
                            {task.is_critical && (
                                <span className="shrink-0 bg-red-500/10 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    Crítica
                                </span>
                            )}
                        </div>
                        {task.description && (
                            <p className="text-sm mt-1 text-[#92bbc9]">{task.description}</p>
                        )}
                        <div className="flex items-center gap-1 mt-2 text-amber-400 text-xs font-semibold">
                            <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                            Exige foto para concluir
                        </div>
                    </div>
                </div>

                {/* Seção de upload de foto */}
                <div className="px-4 pb-4 flex flex-col gap-3">
                    <PhotoUpload
                        restaurantId={restaurantId}
                        onUpload={(filePath) => {
                            setPendingPhotoPath(filePath);
                            setPhotoError(null);
                        }}
                        disabled={false}
                    />

                    {/* Erro de validação */}
                    {photoError && (
                        <p className="text-red-400 text-xs font-semibold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">error</span>
                            {photoError}
                        </p>
                    )}

                    {/* Botão Concluir task */}
                    <button
                        onClick={handleConcludeWithPhoto}
                        disabled={!pendingPhotoPath}
                        className={`
                            w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                            text-sm font-bold transition-all duration-200 active:scale-[0.98]
                            ${pendingPhotoPath
                                ? 'bg-[#13b6ec] text-[#0a1215] shadow-[0_4px_12px_rgba(19,182,236,0.25)]'
                                : 'bg-[#1a2c32] text-[#325a67] border border-[#233f48] cursor-not-allowed'
                            }
                        `}
                    >
                        <span className="material-symbols-outlined text-[18px]">
                            {pendingPhotoPath ? 'check_circle' : 'lock'}
                        </span>
                        {pendingPhotoPath ? 'Concluir tarefa' : 'Adicione a foto para concluir'}
                    </button>
                </div>
            </div>
        );
    }

    // ── RENDER: task sem exigência de foto (comportamento original) ──
    return (
        <button
            onClick={handleSimpleToggle}
            disabled={locked}
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
                    {task.is_critical && !locked && (
                        <span className="shrink-0 bg-red-500/10 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Crítica
                        </span>
                    )}
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
    );
}
