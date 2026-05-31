export type ShiftValue = "any" | "morning" | "afternoon" | "evening";

export const SHIFT_OPTIONS: Array<{ value: ShiftValue; label: string }> = [
    { value: "any", label: "Qualquer turno" },
    { value: "morning", label: "Manhã" },
    { value: "afternoon", label: "Tarde" },
    { value: "evening", label: "Noite" },
];

export function shiftLabel(value: string | null | undefined): string {
    if (!value || value === "any") return "Qualquer turno";
    return SHIFT_OPTIONS.find((s) => s.value === value)?.label ?? value;
}

/**
 * Sprint 66 — Rótulo dos turnos (N:N) de uma rotina/modelo para exibição.
 * Conjunto vazio/ausente = "Todos os turnos"; senão lista os nomes.
 */
export function formatShiftNames(shifts: { id: string; name: string }[] | null | undefined): string {
    if (!shifts || shifts.length === 0) return "Todos os turnos";
    return shifts.map((s) => s.name).join(", ");
}
