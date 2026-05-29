"use client";

import { useMemo, useState } from "react";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import {
    useAllSuppliers,
    useCreateSupplier,
    useUpdateSupplier,
    useArchiveSupplier,
} from "@/lib/hooks/use-suppliers";
import type { Supplier } from "@/lib/types";

function formatCnpj(raw: string | null | undefined): string {
    if (!raw) return "";
    const d = raw.replace(/\D/g, "");
    if (d.length !== 14) return raw;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function FornecedoresTab({ overrideRestaurantId }: { overrideRestaurantId?: string } = {}) {
    const storeRestaurantId = useRestaurantStore((s) => s.restaurantId);
    const restaurantId = overrideRestaurantId || storeRestaurantId;

    const { data: suppliers = [], isLoading } = useAllSuppliers(restaurantId || undefined);
    const createSupplier = useCreateSupplier();
    const updateSupplier = useUpdateSupplier();
    const archiveSupplier = useArchiveSupplier();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<Supplier | null>(null);
    const [formName, setFormName] = useState("");
    const [formCnpj, setFormCnpj] = useState("");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showInactive, setShowInactive] = useState(false);

    const visible = useMemo(
        () => suppliers.filter((s) => (showInactive ? true : s.active)),
        [suppliers, showInactive],
    );

    const openCreate = () => {
        setEditing(null);
        setFormName("");
        setFormCnpj("");
        setErrorMsg(null);
        setIsModalOpen(true);
    };

    const openEdit = (s: Supplier) => {
        setEditing(s);
        setFormName(s.name);
        setFormCnpj(s.cnpj ?? "");
        setErrorMsg(null);
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!restaurantId) return;
        const name = formName.trim();
        if (!name) {
            setErrorMsg("Nome é obrigatório.");
            return;
        }
        const cnpjDigits = formCnpj.replace(/\D/g, "");
        if (cnpjDigits && cnpjDigits.length !== 14) {
            setErrorMsg("CNPJ deve ter 14 dígitos.");
            return;
        }
        setErrorMsg(null);

        try {
            if (editing) {
                await updateSupplier.mutateAsync({
                    id: editing.id,
                    restaurant_id: restaurantId,
                    name,
                    cnpj: cnpjDigits || null,
                });
            } else {
                await createSupplier.mutateAsync({
                    restaurant_id: restaurantId,
                    name,
                    cnpj: cnpjDigits || null,
                });
            }
            setIsModalOpen(false);
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : "Erro ao salvar.");
        }
    };

    const handleToggleActive = async (s: Supplier) => {
        if (!restaurantId) return;
        if (s.active) {
            await archiveSupplier.mutateAsync({ id: s.id, restaurant_id: restaurantId });
        } else {
            await updateSupplier.mutateAsync({
                id: s.id,
                restaurant_id: restaurantId,
                active: true,
            });
        }
    };

    if (!restaurantId) {
        return (
            <div className="flex items-center justify-center min-h-[200px] text-[#92bbc9] text-sm">
                Carregando restaurante…
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-white mb-1">Fornecedores</h2>
                    <p className="text-sm text-[#92bbc9]">
                        Cadastre os fornecedores. O colaborador escolhe um ao registrar um novo recebimento.
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="px-4 py-2 rounded-lg bg-[#13b6ec] text-white text-sm font-semibold hover:bg-[#0fa3d4] transition-colors flex items-center gap-2 self-start sm:self-auto"
                >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    Novo fornecedor
                </button>
            </div>

            <label className="flex items-center gap-2 text-sm text-[#92bbc9] mb-4 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="accent-[#13b6ec]"
                />
                Mostrar arquivados
            </label>

            {isLoading ? (
                <div className="text-[#92bbc9] text-sm">Carregando fornecedores…</div>
            ) : visible.length === 0 ? (
                <div className="bg-[#16262c] border border-dashed border-[#233f48] rounded-xl p-8 text-center">
                    <p className="text-[#92bbc9] text-sm mb-3">
                        {showInactive ? "Nenhum fornecedor cadastrado." : "Nenhum fornecedor ativo."}
                    </p>
                    <button
                        onClick={openCreate}
                        className="text-[#13b6ec] text-sm font-medium hover:underline"
                    >
                        Cadastrar primeiro fornecedor
                    </button>
                </div>
            ) : (
                <div className="bg-[#16262c] border border-[#233f48] rounded-xl overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-[#1a2c32] text-xs uppercase tracking-wider text-[#92bbc9]">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium">Nome</th>
                                <th className="text-left px-4 py-3 font-medium">CNPJ</th>
                                <th className="text-left px-4 py-3 font-medium">Status</th>
                                <th className="text-right px-4 py-3 font-medium">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#233f48]">
                            {visible.map((s) => (
                                <tr key={s.id} className="text-sm">
                                    <td className="px-4 py-3 text-white font-medium">{s.name}</td>
                                    <td className="px-4 py-3 text-[#92bbc9]">
                                        {formatCnpj(s.cnpj) || <span className="text-[#557682]">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {s.active ? (
                                            <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                Ativo
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[#92bbc9] text-xs font-medium">
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#557682]" />
                                                Arquivado
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                onClick={() => openEdit(s)}
                                                className="px-2.5 py-1.5 rounded-md text-[#92bbc9] hover:bg-[#1a2c32] hover:text-white transition-colors text-xs font-medium"
                                            >
                                                Editar
                                            </button>
                                            <button
                                                onClick={() => handleToggleActive(s)}
                                                className={`px-2.5 py-1.5 rounded-md transition-colors text-xs font-medium ${s.active
                                                        ? "text-red-400 hover:bg-red-500/10"
                                                        : "text-emerald-400 hover:bg-emerald-500/10"
                                                    }`}
                                            >
                                                {s.active ? "Arquivar" : "Reativar"}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal de criação/edição */}
            {isModalOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setIsModalOpen(false)}
                >
                    <div
                        className="bg-[#16262c] border border-[#233f48] rounded-xl p-6 w-full max-w-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-white mb-5">
                            {editing ? "Editar fornecedor" : "Novo fornecedor"}
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-[#92bbc9] mb-1.5">
                                    Nome <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="Ex: Hortifruti CEASA"
                                    className="w-full bg-[#1a2c32] border border-[#233f48] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[#557682] focus:outline-none focus:border-[#13b6ec]"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-[#92bbc9] mb-1.5">
                                    CNPJ <span className="text-[#557682]">(opcional)</span>
                                </label>
                                <input
                                    type="text"
                                    value={formCnpj}
                                    onChange={(e) => setFormCnpj(e.target.value)}
                                    placeholder="00.000.000/0000-00"
                                    inputMode="numeric"
                                    className="w-full bg-[#1a2c32] border border-[#233f48] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[#557682] focus:outline-none focus:border-[#13b6ec]"
                                />
                            </div>

                            {errorMsg && (
                                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                                    {errorMsg}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 mt-6 justify-end">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 rounded-lg text-[#92bbc9] hover:bg-[#1a2c32] hover:text-white transition-colors text-sm font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={createSupplier.isPending || updateSupplier.isPending}
                                className="px-4 py-2 rounded-lg bg-[#13b6ec] text-white text-sm font-semibold hover:bg-[#0fa3d4] transition-colors disabled:opacity-50"
                            >
                                {createSupplier.isPending || updateSupplier.isPending ? "Salvando…" : "Salvar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
