"use client";

import { useMemo, useState } from "react";
import { useAccountSessionStore } from "@/lib/store/account-session-store";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import {
    useUnits,
    useCreateUnit,
    useUpdateUnit,
    useSetPrimaryUnit,
    useDeleteUnit,
    type Unit,
} from "@/lib/hooks/use-units";

type ModalMode = "create" | "edit";

function formatCnpj(digits: string | null): string {
    if (!digits) return "";
    const d = digits.replace(/\D/g, "");
    if (d.length !== 14) return digits;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function UnidadesTab() {
    const accountId = useAccountSessionStore((s) => s.accountId);
    const userRole = useRestaurantStore((s) => s.userRole);
    const isOwner = userRole === "owner";

    const { data: units = [], isLoading, error } = useUnits(accountId);
    const createUnit = useCreateUnit();
    const updateUnit = useUpdateUnit();
    const setPrimary = useSetPrimaryUnit();
    const deleteUnit = useDeleteUnit();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [mode, setMode] = useState<ModalMode>("create");
    const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
    const [formName, setFormName] = useState("");
    const [formCnpj, setFormCnpj] = useState("");
    const [formError, setFormError] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<Unit | null>(null);
    const [deleteConfirmName, setDeleteConfirmName] = useState("");
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const activeCount = useMemo(() => units.filter((u) => u.active).length, [units]);

    const openCreate = () => {
        setMode("create");
        setEditingUnit(null);
        setFormName("");
        setFormCnpj("");
        setFormError(null);
        setIsModalOpen(true);
    };

    const openEdit = (unit: Unit) => {
        setMode("edit");
        setEditingUnit(unit);
        setFormName(unit.name);
        setFormCnpj(unit.cnpj ?? "");
        setFormError(null);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setFormError(null);
    };

    const handleSubmit = async () => {
        if (!accountId) return;
        if (!formName.trim()) {
            setFormError("Informe um nome para a unidade.");
            return;
        }
        setFormError(null);

        try {
            if (mode === "create") {
                await createUnit.mutateAsync({
                    account_id: accountId,
                    name: formName.trim(),
                    cnpj: formCnpj.trim() || null,
                });
            } else if (editingUnit) {
                await updateUnit.mutateAsync({
                    id: editingUnit.id,
                    account_id: accountId,
                    name: formName.trim(),
                });
            }
            setIsModalOpen(false);
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Falha ao salvar.");
        }
    };

    const handleSetPrimary = async (unit: Unit) => {
        if (!accountId || unit.is_primary) return;
        try {
            await setPrimary.mutateAsync({ id: unit.id, account_id: accountId });
        } catch (e) {
            alert(e instanceof Error ? e.message : "Falha ao definir principal.");
        }
    };

    const openDelete = (unit: Unit) => {
        setDeleteTarget(unit);
        setDeleteConfirmName("");
        setDeleteError(null);
    };

    const closeDelete = () => {
        setDeleteTarget(null);
        setDeleteConfirmName("");
        setDeleteError(null);
    };

    const handleConfirmDelete = async () => {
        if (!accountId || !deleteTarget) return;
        if (deleteConfirmName.trim() !== deleteTarget.name) {
            setDeleteError("Digite exatamente o nome da unidade para confirmar.");
            return;
        }
        setDeleteError(null);
        try {
            await deleteUnit.mutateAsync({ id: deleteTarget.id, account_id: accountId });
            closeDelete();
        } catch (e) {
            setDeleteError(e instanceof Error ? e.message : "Falha ao excluir.");
        }
    };

    if (!accountId) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-sm text-[#92bbc9]">Nenhuma conta ativa.</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#13b6ec]"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
                <p className="text-white font-semibold mb-1">Erro ao carregar unidades</p>
                <p className="text-[#92bbc9] text-sm">
                    {error instanceof Error ? error.message : "Tente novamente."}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white mb-1">Unidades</h2>
                    <p className="text-sm text-[#92bbc9]">
                        Gerencie as unidades (restaurantes) vinculadas à sua conta.
                    </p>
                </div>
                {isOwner && (
                    <button
                        onClick={openCreate}
                        className="flex items-center justify-center gap-2 bg-[#13b6ec] text-[#101d22] px-4 py-2.5 rounded-lg font-semibold hover:bg-white hover:text-[#101d22] transition-colors whitespace-nowrap"
                    >
                        <span className="material-symbols-outlined text-xl">add</span>
                        Nova Unidade
                    </button>
                )}
            </div>

            {!isOwner && (
                <div className="rounded-lg border border-[#233f48] bg-[#1a2c32] px-4 py-3">
                    <p className="text-xs text-[#92bbc9]">
                        Apenas proprietários podem criar, editar ou excluir unidades.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {units.length === 0 ? (
                    <div className="col-span-full bg-[#16262c] border border-[#233f48] rounded-xl p-8 text-center flex flex-col items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-[#1a2c32] flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-[#325a67]">domain</span>
                        </div>
                        <h3 className="text-white font-medium mb-1">Nenhuma unidade ativa</h3>
                        <p className="text-sm text-[#92bbc9]">Crie uma unidade para começar.</p>
                    </div>
                ) : (
                    units.map((unit) => (
                        <div
                            key={unit.id}
                            className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-5 flex flex-col gap-3 hover:border-[#325a67] transition-colors"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-white font-bold text-lg truncate">{unit.name}</h3>
                                        {unit.is_primary && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#13b6ec]/15 text-[#13b6ec] border border-[#13b6ec]/25 shrink-0">
                                                <span className="material-symbols-outlined text-[12px]">star</span>
                                                Principal
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-[#92bbc9]">/{unit.slug}</p>
                                    {unit.cnpj && (
                                        <p className="text-xs text-[#325a67] mt-1">CNPJ: {formatCnpj(unit.cnpj)}</p>
                                    )}
                                </div>
                            </div>

                            {isOwner && (
                                <div className="flex flex-wrap gap-2 mt-auto pt-3 border-t border-[#233f48]">
                                    <button
                                        onClick={() => openEdit(unit)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[#92bbc9] hover:text-white hover:bg-[#16262c] transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">edit</span>
                                        Editar
                                    </button>
                                    {!unit.is_primary && (
                                        <button
                                            onClick={() => handleSetPrimary(unit)}
                                            disabled={setPrimary.isPending}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[#92bbc9] hover:text-[#13b6ec] hover:bg-[#16262c] transition-colors disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">star</span>
                                            Definir principal
                                        </button>
                                    )}
                                    {!unit.is_primary && activeCount > 1 && (
                                        <button
                                            onClick={() => openDelete(unit)}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[#92bbc9] hover:text-red-400 hover:bg-[#16262c] transition-colors ml-auto"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">delete</span>
                                            Excluir
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Modal criar/editar */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#16262c] rounded-2xl w-full max-w-md border border-[#233f48] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-5 border-b border-[#233f48] flex justify-between items-center shrink-0">
                            <h2 className="text-xl font-bold text-white">
                                {mode === "create" ? "Nova Unidade" : "Editar Unidade"}
                            </h2>
                            <button
                                onClick={closeModal}
                                className="text-[#92bbc9] hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-[#92bbc9]">Nome da unidade</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="Ex: Filial Centro"
                                    className="bg-[#101d22] border border-[#233f48] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#13b6ec] transition-colors"
                                />
                            </div>

                            {mode === "create" && (
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-[#92bbc9]">
                                        CNPJ <span className="text-[#325a67]">(opcional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formCnpj}
                                        onChange={(e) => setFormCnpj(e.target.value)}
                                        placeholder="00.000.000/0000-00"
                                        inputMode="numeric"
                                        className="bg-[#101d22] border border-[#233f48] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#13b6ec] transition-colors"
                                    />
                                    <p className="text-[10px] text-[#325a67]">
                                        A unidade começa vazia — nenhuma configuração é copiada automaticamente.
                                    </p>
                                </div>
                            )}

                            {formError && <p className="text-red-400 text-sm">{formError}</p>}
                        </div>

                        <div className="p-6 border-t border-[#233f48] flex gap-3 shrink-0 bg-[#111e22]">
                            <button
                                onClick={closeModal}
                                className="flex-1 px-4 py-3 rounded-lg font-medium text-[#92bbc9] hover:text-white hover:bg-[#1a2c32] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={
                                    !formName.trim() || createUnit.isPending || updateUnit.isPending
                                }
                                className="flex-1 bg-[#13b6ec] text-[#101d22] px-4 py-3 rounded-lg font-bold hover:bg-white transition-colors disabled:opacity-50 flex justify-center items-center"
                            >
                                {createUnit.isPending || updateUnit.isPending ? (
                                    <div className="w-5 h-5 border-2 border-[#101d22] border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    "Salvar"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal excluir com confirmação por nome */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#16262c] rounded-2xl w-full max-w-md border border-red-500/30 shadow-2xl overflow-hidden flex flex-col">
                        <div className="px-6 py-5 border-b border-[#233f48] flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">Excluir unidade</h2>
                            <button
                                onClick={closeDelete}
                                className="text-[#92bbc9] hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-4">
                            <p className="text-sm text-[#92bbc9]">
                                Esta ação marcará{" "}
                                <span className="font-bold text-white">{deleteTarget.name}</span>{" "}
                                como inativa. Não poderá ser desfeita por aqui.
                            </p>
                            <p className="text-sm text-[#92bbc9]">
                                Para confirmar, digite o nome da unidade:
                            </p>
                            <input
                                type="text"
                                value={deleteConfirmName}
                                onChange={(e) => setDeleteConfirmName(e.target.value)}
                                placeholder={deleteTarget.name}
                                className="bg-[#101d22] border border-[#233f48] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-red-400 transition-colors"
                            />
                            {deleteError && <p className="text-red-400 text-sm">{deleteError}</p>}
                        </div>

                        <div className="p-6 border-t border-[#233f48] flex gap-3 bg-[#111e22]">
                            <button
                                onClick={closeDelete}
                                className="flex-1 px-4 py-3 rounded-lg font-medium text-[#92bbc9] hover:text-white hover:bg-[#1a2c32] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={
                                    deleteUnit.isPending ||
                                    deleteConfirmName.trim() !== deleteTarget.name
                                }
                                className="flex-1 bg-red-500 text-white px-4 py-3 rounded-lg font-bold hover:bg-red-600 transition-colors disabled:opacity-50 flex justify-center items-center"
                            >
                                {deleteUnit.isPending ? (
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    "Excluir"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
