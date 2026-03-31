"use client";

import { useState, useEffect } from 'react';
import { useChangeCollaboratorPassword } from '@/lib/hooks/use-equipe';

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    member: { user_id: string; name: string } | null;
    restaurantId: string;
}

export function ChangePasswordModal({ isOpen, onClose, member, restaurantId }: ChangePasswordModalProps) {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [clientError, setClientError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const changePassword = useChangeCollaboratorPassword(restaurantId);

    useEffect(() => {
        if (isOpen) {
            setNewPassword('');
            setConfirmPassword('');
            setShowNew(false);
            setShowConfirm(false);
            setClientError('');
            setSuccessMsg('');
        }
    }, [isOpen]);

    if (!isOpen || !member) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setClientError('');
        setSuccessMsg('');

        if (newPassword.length < 6) {
            setClientError('A senha deve ter no mínimo 6 caracteres.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setClientError('As senhas não coincidem.');
            return;
        }

        try {
            await changePassword.mutateAsync({
                targetUserId: member.user_id,
                newPassword,
                confirmPassword,
            });
            setSuccessMsg('Senha alterada com sucesso!');
            setNewPassword('');
            setConfirmPassword('');
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (err: unknown) {
            setClientError((err as Error).message || 'Erro ao alterar senha.');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="bg-[#1a2c32] border border-[#233f48] rounded-2xl w-full max-w-md shadow-2xl">
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-[#233f48]">
                    <div>
                        <h3 className="text-white text-xl font-bold">Alterar Senha</h3>
                        <p className="text-[#92bbc9] text-sm mt-0.5">{member.name}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-[#92bbc9] hover:text-white transition-colors"
                        type="button"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-[#92bbc9] mb-1.5">
                            Nova senha * (mín. 6 caracteres)
                        </label>
                        <div className="relative">
                            <input
                                required
                                type={showNew ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                minLength={6}
                                placeholder="••••••"
                                className="w-full bg-[#101d22] border border-[#233f48] text-white rounded-lg p-2.5 pr-10 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNew(p => !p)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#92bbc9] hover:text-white"
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    {showNew ? 'visibility_off' : 'visibility'}
                                </span>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-[#92bbc9] mb-1.5">
                            Confirmar nova senha *
                        </label>
                        <div className="relative">
                            <input
                                required
                                type={showConfirm ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                minLength={6}
                                placeholder="••••••"
                                className="w-full bg-[#101d22] border border-[#233f48] text-white rounded-lg p-2.5 pr-10 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm(p => !p)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#92bbc9] hover:text-white"
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    {showConfirm ? 'visibility_off' : 'visibility'}
                                </span>
                            </button>
                        </div>
                    </div>

                    {clientError && (
                        <p className="text-red-400 text-sm flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px]">error</span>
                            {clientError}
                        </p>
                    )}

                    {successMsg && (
                        <p className="text-[#0bda57] text-sm flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                            {successMsg}
                        </p>
                    )}

                    {/* Footer */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-lg border border-[#233f48] text-[#92bbc9] hover:text-white hover:border-[#92bbc9] transition-colors text-sm font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={changePassword.isPending}
                            className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {changePassword.isPending ? (
                                <>
                                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                                    Salvando...
                                </>
                            ) : (
                                'Salvar senha'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
