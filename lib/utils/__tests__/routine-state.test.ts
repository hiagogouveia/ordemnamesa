import { describe, it, expect } from "vitest";
import { getRoutineState } from "@/lib/utils/routine-state";

const min = (h: number, m: number) => h * 60 + m;

describe("getRoutineState — allow_early_start (Sprint 76)", () => {
    const window = { start_time: "15:00", end_time: "16:00" };

    describe("Caso 1: allow_early_start = false (padrão)", () => {
        it("antes do início → future (bloqueado)", () => {
            expect(getRoutineState({ ...window, currentMinutes: min(14, 30), allow_early_start: false }).kind).toBe("future");
            expect(getRoutineState({ ...window, currentMinutes: min(14, 59), allow_early_start: false }).kind).toBe("future");
        });
        it("no início → available", () => {
            expect(getRoutineState({ ...window, currentMinutes: min(15, 0), allow_early_start: false }).kind).toBe("available");
        });
    });

    describe("Caso 2: allow_early_start = true", () => {
        it("antes do início → available (pode iniciar)", () => {
            for (const t of [min(14, 30), min(14, 45), min(14, 59), min(15, 0)]) {
                expect(getRoutineState({ ...window, currentMinutes: t, allow_early_start: true }).kind).toBe("available");
            }
        });
    });

    describe("Caso 3: sem horário configurado", () => {
        it("allow_early_start não altera comportamento (available)", () => {
            expect(getRoutineState({ start_time: null, end_time: null, currentMinutes: min(10, 0), allow_early_start: true }).kind).toBe("available");
            expect(getRoutineState({ start_time: null, end_time: null, currentMinutes: min(10, 0), allow_early_start: false }).kind).toBe("available");
        });
    });

    describe("Caso 4: rotinas antigas (allow_early_start ausente)", () => {
        it("antes do início → future, idêntico ao comportamento atual", () => {
            expect(getRoutineState({ ...window, currentMinutes: min(14, 30) }).kind).toBe("future");
        });
    });

    describe("Atraso preservado", () => {
        it("após o fim → late mesmo com allow_early_start = true", () => {
            expect(getRoutineState({ ...window, currentMinutes: min(16, 30), allow_early_start: true }).kind).toBe("late");
        });
        it("durante a janela → available", () => {
            expect(getRoutineState({ ...window, currentMinutes: min(15, 30), allow_early_start: true }).kind).toBe("available");
        });
    });

    describe("Precedência preservada", () => {
        it("impedimento vence allow_early_start", () => {
            expect(getRoutineState({ ...window, currentMinutes: min(14, 30), allow_early_start: true, hasBlockedTask: true }).kind).toBe("blocked");
        });
        it("execução em andamento vira doing", () => {
            expect(getRoutineState({ ...window, currentMinutes: min(14, 30), allow_early_start: true, hasInProgressExecution: true }).kind).toBe("doing");
        });
    });
});
