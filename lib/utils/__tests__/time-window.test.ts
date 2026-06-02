import { describe, it, expect } from "vitest";
import { parseTimeToMinutes, durationMinutes, addDuration, formatDuration, getTimeWindowStatus } from "@/lib/utils/time-window";

describe("time-window utils", () => {
    describe("parseTimeToMinutes", () => {
        it("converte HH:MM em minutos", () => {
            expect(parseTimeToMinutes("00:00")).toBe(0);
            expect(parseTimeToMinutes("10:00")).toBe(600);
            expect(parseTimeToMinutes("23:59")).toBe(1439);
        });
        it("retorna null para entradas inválidas", () => {
            expect(parseTimeToMinutes("")).toBeNull();
            expect(parseTimeToMinutes(null)).toBeNull();
            expect(parseTimeToMinutes(undefined)).toBeNull();
            expect(parseTimeToMinutes("25:00")).toBeNull();
            expect(parseTimeToMinutes("10:99")).toBeNull();
            expect(parseTimeToMinutes("abc")).toBeNull();
        });
    });

    describe("durationMinutes", () => {
        it("calcula a diferença em minutos", () => {
            expect(durationMinutes("10:00", "11:05")).toBe(65);
            expect(durationMinutes("10:00", "11:32")).toBe(92);
        });
        it("retorna null quando fim <= início ou horário inválido", () => {
            expect(durationMinutes("11:00", "10:00")).toBeNull();
            expect(durationMinutes("10:00", "10:00")).toBeNull();
            expect(durationMinutes("", "11:00")).toBeNull();
            expect(durationMinutes("10:00", "")).toBeNull();
        });
    });

    describe("addDuration", () => {
        it("soma a duração ao início (Ajuste 1.1)", () => {
            expect(addDuration("10:00", 92)).toBe("11:32");
            expect(addDuration("10:00", 65)).toBe("11:05");
        });
        it("faz clamp em 23:59 sem cruzar a meia-noite", () => {
            expect(addDuration("23:00", 120)).toBe("23:59");
        });
        it("retorna null para início inválido ou duração não positiva", () => {
            expect(addDuration("", 60)).toBeNull();
            expect(addDuration("10:00", 0)).toBeNull();
            expect(addDuration("10:00", -10)).toBeNull();
        });
    });

    describe("formatDuration", () => {
        it("formata de forma amigável", () => {
            expect(formatDuration(65)).toBe("1h 05min");
            expect(formatDuration(90)).toBe("1h 30min");
            expect(formatDuration(45)).toBe("45min");
            expect(formatDuration(60)).toBe("1h");
            expect(formatDuration(125)).toBe("2h 05min");
        });
        it("retorna string vazia para valores não positivos", () => {
            expect(formatDuration(0)).toBe("");
            expect(formatDuration(-5)).toBe("");
        });
    });

    describe("getTimeWindowStatus (Sprint 76 — allow_early_start)", () => {
        it("sem janela → always", () => {
            expect(getTimeWindowStatus(undefined, undefined, "10:00")).toBe("always");
            expect(getTimeWindowStatus(null, null, "10:00", true)).toBe("always");
        });
        it("allow_early_start = false: antes do início → before (bloqueado)", () => {
            expect(getTimeWindowStatus("16:00", "19:55", "15:30")).toBe("before");
            expect(getTimeWindowStatus("16:00", "19:55", "15:59")).toBe("before");
        });
        it("allow_early_start = true: antes do início → active (liberado)", () => {
            expect(getTimeWindowStatus("16:00", "19:55", "15:30", true)).toBe("active");
            expect(getTimeWindowStatus("16:00", "19:55", "12:00", true)).toBe("active");
        });
        it("dentro da janela → active (independente de allow_early_start)", () => {
            expect(getTimeWindowStatus("16:00", "19:55", "17:00")).toBe("active");
            expect(getTimeWindowStatus("16:00", "19:55", "17:00", true)).toBe("active");
        });
        it("após o fim → after, mesmo com allow_early_start = true (atraso preservado)", () => {
            expect(getTimeWindowStatus("16:00", "19:55", "20:30")).toBe("after");
            expect(getTimeWindowStatus("16:00", "19:55", "20:30", true)).toBe("after");
        });
    });
});
