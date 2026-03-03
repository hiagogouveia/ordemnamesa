"use client";

import { useState, useEffect, Suspense } from "react";
import { ChecklistList } from "@/components/checklists/checklist-list";
import { ChecklistForm } from "@/components/checklists/checklist-form";
import { ExtendedChecklist } from "@/components/checklists/checklist-card";
import { useSearchParams, useRouter } from "next/navigation";
import { useRestaurantStore } from "@/lib/store/restaurant-store";

function ChecklistsContent() {
    const [selectedChecklist, setSelectedChecklist] = useState<ExtendedChecklist | null>(null);

    const searchParams = useSearchParams();
    const router = useRouter();
    const role = useRestaurantStore((state) => state.userRole);
    const isNew = searchParams.get('new') === 'true';

    useEffect(() => {
        if (isNew) {
            setSelectedChecklist(null);
        }
    }, [isNew]);

    if (role === 'staff') {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-72px)] bg-[#0a1215] text-[#92bbc9] p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-4xl text-red-500">lock</span>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Acesso Negado</h2>
                <p className="max-w-md">Sua função de Colaborador (Staff) não tem permissão para gerenciar as rotinas e checklists do restaurante. Entre em contato com seu gestor.</p>
            </div>
        );
    }

    const handleSelect = (checklist: ExtendedChecklist) => {
        setSelectedChecklist(checklist);
        if (isNew) {
            router.push('/checklists');
        }
    };

    const handleCancel = () => {
        if (isNew) {
            router.push('/checklists');
        } else {
            setSelectedChecklist(null);
        }
    };

    const handleSaved = () => {
        if (isNew) {
            router.push('/checklists');
        }
        setSelectedChecklist(null);
    };

    return (
        <div className="flex h-[calc(100vh-72px)] overflow-hidden">
            {/* Coluna Esquerda: Lista de Checklists */}
            <div className={`w-full md:w-[420px] shrink-0 h-full ${selectedChecklist || isNew ? 'hidden md:block' : 'block'}`}>
                <ChecklistList
                    selectedId={selectedChecklist?.id || null}
                    onSelect={handleSelect}
                />
            </div>

            {/* Coluna Direita: Formulário de Edição */}
            <div className={`flex-1 h-full overflow-hidden ${selectedChecklist || isNew ? 'block' : 'hidden md:block'}`}>
                {selectedChecklist || isNew ? (
                    <ChecklistForm
                        checklist={selectedChecklist}
                        onSaved={handleSaved}
                        onCancel={handleCancel}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-[#92bbc9] p-6 text-center h-full bg-[#0a1215]">
                        <div className="w-16 h-16 rounded-full bg-[#16262c] border border-[#233f48] flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-3xl text-[#325a67]">checklist</span>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">Nenhuma lista selecionada</h3>
                        <p className="max-w-xs text-sm">Selecione uma lista ao lado para ver os detalhes ou clique em &apos;Nova Lista&apos; no topo.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ChecklistsPage() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-[#92bbc9]">Carregando interface...</div>}>
            <ChecklistsContent />
        </Suspense>
    );
}
