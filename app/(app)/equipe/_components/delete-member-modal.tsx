"use client";

import { useState, useEffect } from 'react';
import { useMemberDeletionPreview, useDeleteEquipeMember } from '@/lib/hooks/use-equipe';
import { BLOCKER_LABELS, formatBlockerCount } from '@/lib/types/equipe-deletion';
import type { DeleteMemberResponse } from '@/lib/types/equipe-deletion';

interface DeleteMemberModalProps {
    isOpen: boolean;
    onClose: () => void;
    member: { user_id: string; name: string; email: string } | null;
    restaurantId: string | null;
    accountId?: string | null;
    /** Fallback quando a exclusão está bloqueada: o caminho correto passa a ser Inativar. */
    onDeactivate: () => void;
    onDeleted: (result: DeleteMemberResponse) => void;
}

const plural = (n: number, singular: string, pluralWord: string) =>
    `${n} ${n === 1 ? singular : pluralWord}`;

export function DeleteMemberModal({
    isOpen,
    onClose,
    member,
    restaurantId,
    accountId,
    onDeactivate,
    onDeleted,
}: DeleteMemberModalProps) {
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState('');

    const preview = useMemberDeletionPreview(restaurantId, member?.user_id ?? null, isOpen);
    const deleteMember = useDeleteEquipeMember(restaurantId, accountId);

    useEffect(() => {
        if (isOpen) {
            setConfirmed(false);
            setError('');
        }
    }, [isOpen]);

    // Escape cancela — abortar um diálogo destrutivo pelo teclado é o esperado.
    // Não fecha durante a exclusão, para não sumir com o feedback no meio da operação.
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !deleteMember.isPending) onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose, deleteMember.isPending]);

    if (!isOpen || !member) return null;

    const handleDelete = async () => {
        setError('');
        try {
            const result = await deleteMember.mutateAsync({ userId: member.user_id });
            onDeleted(result);
            onClose();
        } catch (err: unknown) {
            setError((err as Error).message || 'Erro ao excluir colaborador.');
        }
    };

    const data = preview.data;
    const isBlocked = !!data && !data.can_delete;
    const unlinkedTotal = data
        ? data.unlinked.checklists + data.unlinked.receiving_templates
        : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-member-title"
                className="bg-[#1a2c32] border border-[#233f48] rounded-2xl w-full max-w-md shadow-2xl"
            >
                {/* Header */}
                <div className="flex justify-between items-start p-5 border-b border-[#233f48]">
                    <div className="flex items-start gap-3">
                        <span
                            className={`material-symbols-outlined text-[24px] mt-0.5 ${isBlocked ? 'text-amber-400' : 'text-red-500'}`}
                            aria-hidden
                        >
                            {isBlocked ? 'shield_person' : 'warning'}
                        </span>
                        <div>
                            <h3 id="delete-member-title" className="text-white text-xl font-bold">
                                Excluir colaborador
                            </h3>
                            <p className="text-[#92bbc9] text-sm mt-0.5">{member.name}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-[#92bbc9] hover:text-white transition-colors"
                        type="button"
                        aria-label="Fechar"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* ── Estado 1: carregando a pré-checagem ── */}
                    {preview.isLoading && (
                        <div className="space-y-2.5 animate-pulse" aria-label="Verificando colaborador">
                            <div className="h-3 w-full rounded bg-[#233f48]" />
                            <div className="h-3 w-4/5 rounded bg-[#233f48]" />
                            <div className="h-3 w-2/3 rounded bg-[#233f48]" />
                        </div>
                    )}

                    {preview.isError && (
                        <p className="text-red-400 text-sm flex items-start gap-1.5">
                            <span className="material-symbols-outlined text-[16px] mt-0.5">error</span>
                            {(preview.error as Error).message}
                        </p>
                    )}

                    {/* ── Estado 2: bloqueado por histórico ── */}
                    {isBlocked && data && (
                        <>
                            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3.5">
                                <p className="text-amber-200 text-sm leading-relaxed">
                                    Este colaborador já possui histórico operacional e não pode ser
                                    excluído. Utilize a opção <strong>Inativar</strong> para preservar
                                    a auditoria do sistema.
                                </p>
                            </div>

                            <div>
                                <p className="text-[#92bbc9] text-xs font-medium uppercase tracking-wide mb-2">
                                    Registros encontrados
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {data.blockers.map((b) => (
                                        <span
                                            key={b.key}
                                            className="inline-flex items-center gap-1.5 rounded-full bg-[#101d22] border border-[#233f48] px-2.5 py-1 text-xs text-[#c5dbe3]"
                                        >
                                            {BLOCKER_LABELS[b.key] ?? b.key}
                                            <span className="text-[#92bbc9] font-semibold">
                                                {formatBlockerCount(b.count)}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 px-4 py-2.5 rounded-lg border border-[#233f48] text-[#92bbc9] hover:text-white hover:border-[#92bbc9] transition-colors text-sm font-medium"
                                >
                                    Fechar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { onClose(); onDeactivate(); }}
                                    className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 text-[#221a04] hover:bg-amber-400 transition-colors text-sm font-semibold"
                                >
                                    Inativar acesso
                                </button>
                            </div>
                        </>
                    )}

                    {/* ── Estado 3: exclusão permitida ── */}
                    {data?.can_delete && (
                        <>
                            <p className="text-[#c5dbe3] text-sm leading-relaxed">
                                Esta ação removerá permanentemente este colaborador do restaurante.
                                Esta operação não poderá ser desfeita.
                            </p>

                            {data.identity_deleted ? (
                                <p className="text-[#92bbc9] text-sm leading-relaxed">
                                    O cadastro de <strong className="text-white">{member.name}</strong> será
                                    apagado e o e-mail <strong className="text-white">{member.email}</strong> ficará
                                    livre para um novo cadastro.
                                </p>
                            ) : (
                                <p className="text-[#92bbc9] text-sm leading-relaxed">
                                    O vínculo com esta unidade será removido, mas o cadastro será{' '}
                                    <strong className="text-white">mantido</strong>
                                    {data.identity_kept_reason === 'other_units'
                                        ? ` porque ${member.name} também atua em ${plural(data.remaining_units, 'outra unidade', 'outras unidades')}.`
                                        : ' porque há registros do sistema associados a ele.'}
                                </p>
                            )}

                            {unlinkedTotal > 0 && (
                                <div className="rounded-lg bg-[#101d22] border border-[#233f48] p-3 flex items-start gap-2.5">
                                    <span className="material-symbols-outlined text-[18px] text-[#92bbc9] mt-0.5" aria-hidden>
                                        info
                                    </span>
                                    <p className="text-[#92bbc9] text-sm leading-relaxed">
                                        {[
                                            data.unlinked.checklists > 0
                                                ? plural(data.unlinked.checklists, 'rotina', 'rotinas')
                                                : null,
                                            data.unlinked.receiving_templates > 0
                                                ? plural(data.unlinked.receiving_templates, 'modelo de recebimento', 'modelos de recebimento')
                                                : null,
                                        ].filter(Boolean).join(' e ')}{' '}
                                        {unlinkedTotal === 1 ? 'ficará' : 'ficarão'} sem responsável.
                                    </p>
                                </div>
                            )}

                            <label className="flex items-start gap-2.5 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={confirmed}
                                    onChange={(e) => setConfirmed(e.target.checked)}
                                    className="mt-0.5 size-4 shrink-0 rounded border-[#233f48] bg-[#101d22] accent-red-600"
                                />
                                <span className="text-[#c5dbe3] text-sm leading-relaxed">
                                    Entendo que esta ação é permanente e não pode ser desfeita.
                                </span>
                            </label>

                            {error && (
                                <p className="text-red-400 text-sm flex items-start gap-1.5">
                                    <span className="material-symbols-outlined text-[16px] mt-0.5">error</span>
                                    {error}
                                </p>
                            )}

                            <div className="flex gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 px-4 py-2.5 rounded-lg border border-[#233f48] text-[#92bbc9] hover:text-white hover:border-[#92bbc9] transition-colors text-sm font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={!confirmed || deleteMember.isPending}
                                    className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {deleteMember.isPending ? (
                                        <>
                                            <span className="material-symbols-outlined text-[18px] animate-spin">
                                                progress_activity
                                            </span>
                                            Excluindo...
                                        </>
                                    ) : (
                                        'Excluir colaborador'
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
