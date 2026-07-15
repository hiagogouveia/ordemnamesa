import { describe, expect, it } from "vitest";
import { JOB_REGISTRY, JOB_NAMES, isJobName, effectiveIntervalMs } from "../registry";

describe("job registry — a fonte única de verdade", () => {
    it("todo job tem lockTtlMs > timeoutMs (o invariante que evita execução concorrente)", () => {
        // O registry já roda esse assert no import; aqui explicitamos como teste para que
        // a intenção fique documentada e a regressão dê erro nomeado.
        for (const name of JOB_NAMES) {
            const d = JOB_REGISTRY[name];
            expect(d.lockTtlMs, `${name}: lockTtlMs deve superar timeoutMs`).toBeGreaterThan(d.timeoutMs);
        }
    });

    it("só o history-retention é destrutivo (deleção irreversível)", () => {
        const destructive = JOB_NAMES.filter((n) => JOB_REGISTRY[n].destructive);
        expect(destructive).toEqual(["history-retention"]);
    });

    it("todo job tem intervalo e descrição", () => {
        for (const name of JOB_NAMES) {
            expect(JOB_REGISTRY[name].everySeconds).toBeGreaterThan(0);
            expect(JOB_REGISTRY[name].description).toBeTruthy();
        }
    });

    it("isJobName distingue nomes válidos de inválidos", () => {
        expect(isJobName("routines-delayed")).toBe(true);
        expect(isJobName("inventado")).toBe(false);
    });
});

describe("backoff exponencial", () => {
    // routines-delayed: 15min normal, teto 60min.
    const every = 15 * 60;
    const max = 60 * 60;

    it("sem falhas → intervalo normal", () => {
        expect(effectiveIntervalMs(every, max, 0)).toBe(every * 1000);
    });

    it("dobra a cada falha consecutiva", () => {
        expect(effectiveIntervalMs(every, max, 1)).toBe(every * 2 * 1000);
        expect(effectiveIntervalMs(every, max, 2)).toBe(every * 4 * 1000);
    });

    it("respeita o teto (não espaça além de maxBackoff)", () => {
        // 15min * 2^10 seria horas; o teto de 60min corta.
        expect(effectiveIntervalMs(every, max, 10)).toBe(max * 1000);
    });

    it("um job quebrado acalma, mas nunca fica MENOS frequente que o teto", () => {
        // A garantia: o backoff espaça, mas o dead-man's-switch (baseado em
        // last_success_at, não em intervalo) continua reportando o job como vencido.
        expect(effectiveIntervalMs(every, max, 100)).toBe(max * 1000);
    });
});
