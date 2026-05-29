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
