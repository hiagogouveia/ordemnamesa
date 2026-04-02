"use client";

import { useShifts, useCreateShift, useUpdateShift } from "@/lib/hooks/use-shifts";
import { useRestaurantStore } from "@/lib/store/restaurant-store";
import { Shift } from "@/lib/types";
import { useState } from "react";

const DAYS_OF_WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const SHIFT_TYPES = [
    { value: 'morning', label: 'Manhã' },
    { value: 'afternoon', label: 'Tarde' },
    { value: 'evening', label: 'Noite' },
];
const SHIFT_TYPE_LABELS: Record<string, string> = { morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite' };

export function ShiftsTab() {
    const restaurantId = useRestaurantStore((state) => state.restaurantId);
    const { data: shifts = [], isLoading } = useShifts(restaurantId || undefined);
    const createShift = useCreateShift();
    const updateShift = useUpdateShift();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingShift, setEditingShift] = useState<Shift | null>(null);

    const [formName, setFormName] = useState("");
    const [formStart, setFormStart] = useState("");
    const [formEnd, setFormEnd] = useState("");
    const [formDays, setFormDays] = useState<number[]>([]);
    const [formShiftType, setFormShiftType] = useState<string>("");

    const activeShifts = shifts.filter(s => s.active);

    const openModal = (shift?: Shift) => {
        if (shift) {
            setEditingShift(shift);
            setFormName(shift.name);
            setFormStart(shift.start_time);
            setFormEnd(shift.end_time);
            setFormDays(shift.days_of_week);
            setFormShiftType(shift.shift_type || "");
        } else {
            setEditingShift(null);
            setFormName("");
            setFormStart("");
            setFormEnd("");
            setFormDays([1, 2, 3, 4, 5]); // Default: Segunda a Sexta
            setFormShiftType("");
        }
        setIsModalOpen(true);
    };

    const toggleDay = (dayIndex: number) => {
        setFormDays(prev =>
            prev.includes(dayIndex)
                ? prev.filter(d => d !== dayIndex)
                : [...prev, dayIndex].sort()
        );
    };

    const handleSave = async () => {
        if (!restaurantId || !formName || !formStart || !formEnd || formDays.length === 0) return;

        try {
            if (editingShift) {
                await updateShift.mutateAsync({
                    restaurant_id: restaurantId,
                    id: editingShift.id,
                    name: formName,
                    start_time: formStart,
                    end_time: formEnd,
                    days_of_week: formDays,
                    shift_type: formShiftType || null,
                });
            } else {
                await createShift.mutateAsync({
                    restaurant_id: restaurantId,
                    name: formName,
                    start_time: formStart,
                    end_time: formEnd,
                    days_of_week: formDays,
                    shift_type: formShiftType || null,
                    active: true,
                });
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error("Erro ao salvar turno", error);
            alert("Erro ao salvar turno. Tente novamente.");
        }
    };

    const handleDeactivate = async (shift: Shift) => {
        if (!restaurantId || !confirm("Tem certeza que deseja desativar este turno?")) return;
        try {
            await updateShift.mutateAsync({
                restaurant_id: restaurantId,
                id: shift.id,
                active: false
            });
        } catch (error) {
            console.error("Erro ao desativar turno", error);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#13b6ec]"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white mb-1">Turnos de Trabalho</h2>
                    <p className="text-sm text-[#92bbc9]">
                        Cadastre os turnos em que a equipe opera para exibir tarefas no momento correto.
                    </p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="flex items-center justify-center gap-2 bg-[#13b6ec] text-[#101d22] px-4 py-2.5 rounded-lg font-semibold hover:bg-white hover:text-[#101d22] transition-colors whitespace-nowrap"
                >
                    <span className="material-symbols-outlined text-xl">add</span>
                    Novo Turno
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeShifts.length === 0 && (
                    <div className="col-span-full bg-[#16262c] border border-[#233f48] rounded-xl p-8 text-center flex flex-col items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-[#1a2c32] flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-[#325a67]">schedule</span>
                        </div>
                        <h3 className="text-white font-medium mb-1">Nenhum turno cadastrado</h3>
                        <p className="text-sm text-[#92bbc9]">Crie um turno para começar a organizar sua equipe.</p>
                    </div>
                )}
                {activeShifts.map((shift) => (
                    <div key={shift.id} className="bg-[#1a2c32] border border-[#233f48] rounded-xl p-5 hover:border-[#325a67] transition-colors group flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-white font-bold text-lg mb-1">{shift.name}</h3>
                                <div className="flex items-center gap-1.5 text-[#13b6ec] text-sm font-medium">
                                    <span className="material-symbols-outlined text-[18px]">schedule</span>
                                    {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                                </div>
                                {shift.shift_type && (
                                    <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#13b6ec]/15 text-[#13b6ec] border border-[#13b6ec]/25">
                                        {SHIFT_TYPE_LABELS[shift.shift_type]}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => openModal(shift)}
                                    className="p-1.5 text-[#92bbc9] hover:text-[#13b6ec] hover:bg-[#16262c] rounded-lg transition-colors"
                                    title="Editar"
                                >
                                    <span className="material-symbols-outlined text-[20px]">edit</span>
                                </button>
                                <button
                                    onClick={() => handleDeactivate(shift)}
                                    className="p-1.5 text-[#92bbc9] hover:text-red-400 hover:bg-[#16262c] rounded-lg transition-colors"
                                    title="Desativar"
                                >
                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                </button>
                            </div>
                        </div>

                        <div className="mt-auto pt-4 border-t border-[#233f48]">
                            <div className="flex gap-1.5 flex-wrap">
                                {DAYS_OF_WEEK.map((day, ix) => {
                                    const isActive = shift.days_of_week.includes(ix);
                                    return (
                                        <div
                                            key={ix}
                                            className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md transition-colors ${isActive ? 'bg-[#13b6ec] text-[#101d22]' : 'bg-[#16262c] border border-[#233f48] text-[#325a67]'}`}
                                        >
                                            {day}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal de Turno */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#16262c] rounded-2xl w-full max-w-md border border-[#233f48] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-5 border-b border-[#233f48] flex justify-between items-center shrink-0">
                            <h2 className="text-xl font-bold text-white">
                                {editingShift ? "Editar Turno" : "Novo Turno"}
                            </h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-[#92bbc9] hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-[#92bbc9]">Nome do Turno</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="Ex: Almoço, Jantar..."
                                    className="bg-[#101d22] border border-[#233f48] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#13b6ec] transition-colors"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-[#92bbc9]">Período do Dia</label>
                                <div className="flex gap-2">
                                    {SHIFT_TYPES.map(st => (
                                        <button
                                            key={st.value}
                                            type="button"
                                            onClick={() => setFormShiftType(formShiftType === st.value ? "" : st.value)}
                                            className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-bold transition-all ${formShiftType === st.value
                                                ? 'bg-[#13b6ec] text-[#101d22] ring-2 ring-[#13b6ec]/30'
                                                : 'bg-[#1a2c32] border border-[#233f48] text-[#92bbc9] hover:border-[#325a67] hover:text-white'
                                            }`}
                                        >
                                            {st.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-[#325a67]">Vincula este turno às rotinas do período correspondente</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-[#92bbc9]">Início</label>
                                    <div className="relative">
                                        <input
                                            type="time"
                                            value={formStart}
                                            onChange={(e) => setFormStart(e.target.value)}
                                            className="w-full bg-[#101d22] border border-[#233f48] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#13b6ec] transition-colors [color-scheme:dark]"
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium text-[#92bbc9]">Fim</label>
                                    <div className="relative">
                                        <input
                                            type="time"
                                            value={formEnd}
                                            onChange={(e) => setFormEnd(e.target.value)}
                                            className="w-full bg-[#101d22] border border-[#233f48] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#13b6ec] transition-colors [color-scheme:dark]"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <label className="text-sm font-medium text-[#92bbc9]">Dias de Operação</label>
                                <div className="flex flex-wrap gap-2">
                                    {DAYS_OF_WEEK.map((day, ix) => {
                                        const selected = formDays.includes(ix);
                                        return (
                                            <button
                                                key={ix}
                                                onClick={() => toggleDay(ix)}
                                                className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all flex-1 min-w-[3rem] ${selected
                                                    ? 'bg-[#13b6ec] text-[#101d22] ring-2 ring-[#13b6ec]/30'
                                                    : 'bg-[#1a2c32] border border-[#233f48] text-[#92bbc9] hover:border-[#325a67] hover:text-white'
                                                    }`}
                                            >
                                                {day}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-[#233f48] flex gap-3 shrink-0 bg-[#111e22]">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="flex-1 px-4 py-3 rounded-lg font-medium text-[#92bbc9] hover:text-white hover:bg-[#1a2c32] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!formName || !formStart || !formEnd || formDays.length === 0 || createShift.isPending || updateShift.isPending}
                                className="flex-1 bg-[#13b6ec] text-[#101d22] px-4 py-3 rounded-lg font-bold hover:bg-white transition-colors disabled:opacity-50 flex justify-center items-center"
                            >
                                {(createShift.isPending || updateShift.isPending) ? (
                                    <div className="w-5 h-5 border-2 border-[#101d22] border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    "Salvar Turno"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
