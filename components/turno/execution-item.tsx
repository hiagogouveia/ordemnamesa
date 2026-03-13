import React, { useState } from 'react';
import { KanbanTask, KanbanExecution } from '@/lib/hooks/use-tasks';

interface ExecutionItemProps {
    task: KanbanTask;
    execution?: KanbanExecution;
    onToggle: (taskId: string, executionId: string | undefined, isDone: boolean) => void;
    locked?: boolean;
}

export function ExecutionItem({ task, execution, onToggle, locked = false }: ExecutionItemProps) {
    const isDone = Boolean(execution && execution.status === 'done');

    // Manage local animation state separate from the data status
    const [isAnimating, setIsAnimating] = useState(false);

    const handleToggle = () => {
        if (locked) return;
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 300);

        const newIsDone = !isDone;
        onToggle(task.id, execution?.id, newIsDone);
    };

    return (
        <button
            onClick={handleToggle}
            disabled={locked}
            className={`
                w-full flex items-center gap-4 p-4 min-h-[64px] rounded-2xl border text-left
                transition-all duration-200 ease-out relative overflow-hidden group
                ${locked ? 'cursor-default opacity-75' : 'active:scale-[0.98]'}
                ${isDone
                    ? 'bg-[#1a2c32]/40 border-[#13b6ec]/30 shadow-[0_4px_12px_rgba(19,182,236,0.05)]'
                    : locked
                        ? 'bg-[#16262c] border-[#233f48]'
                        : 'bg-[#16262c] border-[#233f48] shadow-sm hover:border-[#325a67]'
                }
            `}
        >
            {/* Background progress fill effect when done */}
            <div
                className={`absolute inset-0 bg-gradient-to-r from-[#13b6ec]/10 to-transparent transition-transform duration-500 ease-out origin-left ${isDone ? 'scale-x-100' : 'scale-x-0'}`}
            />

            <div className="relative shrink-0 flex items-center justify-center">
                <div
                    className={`
                        w-7 h-7 rounded-full border-[2px] flex items-center justify-center
                        transition-colors duration-200
                        ${isDone
                            ? 'bg-[#13b6ec] border-[#13b6ec] text-[#0a1215]'
                            : 'bg-transparent border-[#325a67] text-transparent'
                        }
                        ${isAnimating ? 'scale-110' : 'scale-100'}
                    `}
                >
                    <span
                        className={`material-symbols-outlined text-[16px] font-bold transition-all duration-300 ${isDone ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
                    >
                        check
                    </span>
                </div>
            </div>

            <div className="relative flex-1 py-1">
                <div className="flex items-start justify-between gap-3">
                    <span
                        className={`text-base font-semibold leading-snug transition-colors duration-200 ${isDone ? 'text-white' : 'text-[#e0e0e0]'}`}
                    >
                        {task.title}
                    </span>

                    {task.is_critical && !isDone && (
                        <span className="shrink-0 bg-red-500/10 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Crítica
                        </span>
                    )}
                </div>

                {task.description && (
                    <p className={`text-sm mt-1 transition-colors duration-200 ${isDone ? 'text-[#92bbc9]/70' : 'text-[#92bbc9]'}`}>
                        {task.description}
                    </p>
                )}

                {task.requires_photo && !isDone && !locked && (
                    <div className="flex items-center gap-1 mt-2 text-amber-400 text-xs font-semibold">
                        <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                        Exige foto (Em breve via câmera modal)
                    </div>
                )}
            </div>
        </button>
    );
}
