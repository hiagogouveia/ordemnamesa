import { describe, it, expect } from "vitest";
import {
    shouldChecklistAppearToday,
    filterChecklistsByRecurrence,
} from "../should-checklist-appear-today";
import type { RecurrenceConfig } from "@/lib/types";

// ─── Constantes de dias da semana (Brasil: 0=Dom, 1=Seg, ..., 6=Sab) ──────────
const SUN = 0;
const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;
const SAT = 6;

// Data arbitrária — testes v1 não dependem de data específica para a maioria dos casos.
const ANY_DATE_KEY = "2026-04-27";

// ─── Snapshot de comportamento v1 ─────────────────────────────────────────────
// IMPORTANTE: estes testes congelam o comportamento ATUAL (incluindo bugs
// conhecidos em weekly/monthly/yearly). Qualquer falha aqui significa que uma
// regressão silenciosa foi introduzida e deve bloquear o merge.

describe("shouldChecklistAppearToday — v1 snapshot", () => {
    // ─── daily ────────────────────────────────────────────────────────────────
    describe("recurrence='daily'", () => {
        it("retorna true em qualquer dia da semana", () => {
            for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
                expect(
                    shouldChecklistAppearToday({ recurrence: "daily" }, day, ANY_DATE_KEY)
                ).toBe(true);
            }
        });
    });

    // ─── weekdays ─────────────────────────────────────────────────────────────
    describe("recurrence='weekdays'", () => {
        it("retorna true de segunda a sexta", () => {
            for (const day of [MON, TUE, WED, THU, FRI]) {
                expect(
                    shouldChecklistAppearToday({ recurrence: "weekdays" }, day, ANY_DATE_KEY)
                ).toBe(true);
            }
        });

        it("retorna false em sábado e domingo", () => {
            for (const day of [SAT, SUN]) {
                expect(
                    shouldChecklistAppearToday({ recurrence: "weekdays" }, day, ANY_DATE_KEY)
                ).toBe(false);
            }
        });
    });

    // ─── weekly (BUG PRESERVADO) ──────────────────────────────────────────────
    describe("recurrence='weekly' (BUG PRESERVADO — sempre true)", () => {
        it("retorna true em qualquer dia (comportamento atual mantido intencionalmente)", () => {
            for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
                expect(
                    shouldChecklistAppearToday({ recurrence: "weekly" }, day, ANY_DATE_KEY)
                ).toBe(true);
            }
        });
    });

    // ─── monthly (BUG PRESERVADO) ─────────────────────────────────────────────
    describe("recurrence='monthly' (BUG PRESERVADO — sempre true)", () => {
        it("retorna true em qualquer dia (comportamento atual mantido intencionalmente)", () => {
            for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
                expect(
                    shouldChecklistAppearToday({ recurrence: "monthly" }, day, ANY_DATE_KEY)
                ).toBe(true);
            }
        });
    });

    // ─── yearly (BUG PRESERVADO) ──────────────────────────────────────────────
    describe("recurrence='yearly' (BUG PRESERVADO — sempre true)", () => {
        it("retorna true em qualquer dia (comportamento atual mantido intencionalmente)", () => {
            for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
                expect(
                    shouldChecklistAppearToday({ recurrence: "yearly" }, day, ANY_DATE_KEY)
                ).toBe(true);
            }
        });
    });

    // ─── shift_days ───────────────────────────────────────────────────────────
    describe("recurrence='shift_days'", () => {
        it("retorna true se shift='any' (independente dos shifts)", () => {
            const shifts = [{ shift_type: "morning", days_of_week: [MON] }];
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "shift_days", shift: "any" },
                    TUE,
                    ANY_DATE_KEY,
                    shifts
                )
            ).toBe(true);
        });

        it("retorna true se checklist sem shift definido (fallback defensivo)", () => {
            const shifts = [{ shift_type: "morning", days_of_week: [MON] }];
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "shift_days" },
                    SAT,
                    ANY_DATE_KEY,
                    shifts
                )
            ).toBe(true);
        });

        it("retorna true se shifts não fornecidos (fallback)", () => {
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "shift_days", shift: "morning" },
                    MON,
                    ANY_DATE_KEY,
                    undefined
                )
            ).toBe(true);
        });

        it("retorna true se array de shifts vazio (fallback)", () => {
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "shift_days", shift: "morning" },
                    MON,
                    ANY_DATE_KEY,
                    []
                )
            ).toBe(true);
        });

        it("retorna true se nenhum shift tem shift_type correspondente (fallback)", () => {
            const shifts = [{ shift_type: "evening", days_of_week: [MON] }];
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "shift_days", shift: "morning" },
                    MON,
                    ANY_DATE_KEY,
                    shifts
                )
            ).toBe(true);
        });

        it("retorna true quando dia atual está nos days_of_week do shift correspondente", () => {
            const shifts = [{ shift_type: "morning", days_of_week: [MON, WED, FRI] }];
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "shift_days", shift: "morning" },
                    WED,
                    ANY_DATE_KEY,
                    shifts
                )
            ).toBe(true);
        });

        it("retorna false quando dia atual NÃO está nos days_of_week do shift correspondente", () => {
            const shifts = [{ shift_type: "morning", days_of_week: [MON, WED, FRI] }];
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "shift_days", shift: "morning" },
                    TUE,
                    ANY_DATE_KEY,
                    shifts
                )
            ).toBe(false);
        });

        it("agrega days_of_week de múltiplos shifts com mesmo shift_type", () => {
            const shifts = [
                { shift_type: "morning", days_of_week: [MON] },
                { shift_type: "morning", days_of_week: [WED] },
            ];
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "shift_days", shift: "morning" },
                    MON,
                    ANY_DATE_KEY,
                    shifts
                )
            ).toBe(true);
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "shift_days", shift: "morning" },
                    WED,
                    ANY_DATE_KEY,
                    shifts
                )
            ).toBe(true);
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "shift_days", shift: "morning" },
                    TUE,
                    ANY_DATE_KEY,
                    shifts
                )
            ).toBe(false);
        });
    });

    // ─── custom ───────────────────────────────────────────────────────────────
    describe("recurrence='custom'", () => {
        it("retorna true se recurrence_config ausente (fallback defensivo)", () => {
            expect(
                shouldChecklistAppearToday({ recurrence: "custom" }, MON, ANY_DATE_KEY)
            ).toBe(true);
        });

        it("retorna true se recurrence_config null (fallback defensivo)", () => {
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "custom", recurrence_config: null },
                    MON,
                    ANY_DATE_KEY
                )
            ).toBe(true);
        });

        it("frequency='daily' retorna true em qualquer dia", () => {
            const config: RecurrenceConfig = {
                frequency: "daily",
                interval: 1,
                end_type: "never",
            };
            for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
                expect(
                    shouldChecklistAppearToday(
                        { recurrence: "custom", recurrence_config: config },
                        day,
                        ANY_DATE_KEY
                    )
                ).toBe(true);
            }
        });

        it("frequency='monthly' retorna true em qualquer dia", () => {
            const config: RecurrenceConfig = {
                frequency: "monthly",
                interval: 1,
                end_type: "never",
            };
            for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
                expect(
                    shouldChecklistAppearToday(
                        { recurrence: "custom", recurrence_config: config },
                        day,
                        ANY_DATE_KEY
                    )
                ).toBe(true);
            }
        });

        it("frequency='weekly' com days_of_week=[1,3,5] aparece apenas seg/qua/sex", () => {
            const config: RecurrenceConfig = {
                frequency: "weekly",
                interval: 1,
                days_of_week: [MON, WED, FRI],
                end_type: "never",
            };
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "custom", recurrence_config: config },
                    MON,
                    ANY_DATE_KEY
                )
            ).toBe(true);
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "custom", recurrence_config: config },
                    WED,
                    ANY_DATE_KEY
                )
            ).toBe(true);
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "custom", recurrence_config: config },
                    FRI,
                    ANY_DATE_KEY
                )
            ).toBe(true);
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "custom", recurrence_config: config },
                    TUE,
                    ANY_DATE_KEY
                )
            ).toBe(false);
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "custom", recurrence_config: config },
                    SUN,
                    ANY_DATE_KEY
                )
            ).toBe(false);
        });

        it("frequency='weekly' com days_of_week vazio retorna true (fallback defensivo)", () => {
            const config: RecurrenceConfig = {
                frequency: "weekly",
                interval: 1,
                days_of_week: [],
                end_type: "never",
            };
            for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
                expect(
                    shouldChecklistAppearToday(
                        { recurrence: "custom", recurrence_config: config },
                        day,
                        ANY_DATE_KEY
                    )
                ).toBe(true);
            }
        });

        it("frequency='weekly' sem days_of_week retorna true (fallback defensivo)", () => {
            const config: RecurrenceConfig = {
                frequency: "weekly",
                interval: 1,
                end_type: "never",
            };
            for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
                expect(
                    shouldChecklistAppearToday(
                        { recurrence: "custom", recurrence_config: config },
                        day,
                        ANY_DATE_KEY
                    )
                ).toBe(true);
            }
        });

        it("end_type='date' com end_date no passado retorna false", () => {
            const config: RecurrenceConfig = {
                frequency: "daily",
                interval: 1,
                end_type: "date",
                end_date: "2026-04-26", // ontem
            };
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "custom", recurrence_config: config },
                    MON,
                    "2026-04-27"
                )
            ).toBe(false);
        });

        it("end_type='date' com end_date hoje retorna true (não está estritamente no passado)", () => {
            const config: RecurrenceConfig = {
                frequency: "daily",
                interval: 1,
                end_type: "date",
                end_date: "2026-04-27",
            };
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "custom", recurrence_config: config },
                    MON,
                    "2026-04-27"
                )
            ).toBe(true);
        });

        it("end_type='date' com end_date no futuro retorna true", () => {
            const config: RecurrenceConfig = {
                frequency: "daily",
                interval: 1,
                end_type: "date",
                end_date: "2026-12-31",
            };
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "custom", recurrence_config: config },
                    MON,
                    "2026-04-27"
                )
            ).toBe(true);
        });
    });

    // ─── fallbacks ────────────────────────────────────────────────────────────
    describe("fallbacks defensivos", () => {
        it("recurrence undefined retorna true", () => {
            expect(shouldChecklistAppearToday({}, MON, ANY_DATE_KEY)).toBe(true);
        });

        it("recurrence null retorna true", () => {
            expect(
                shouldChecklistAppearToday({ recurrence: null }, MON, ANY_DATE_KEY)
            ).toBe(true);
        });

        it("recurrence string desconhecida retorna true", () => {
            expect(
                shouldChecklistAppearToday(
                    { recurrence: "tipo-inexistente" },
                    MON,
                    ANY_DATE_KEY
                )
            ).toBe(true);
        });

        it("recurrence string vazia retorna true", () => {
            // Valor falsy — cai no early return da linha 31
            expect(
                shouldChecklistAppearToday({ recurrence: "" }, MON, ANY_DATE_KEY)
            ).toBe(true);
        });
    });
});

// ─── Roteamento v1 vs v2 (proteção contra regressão do detector estrito) ──────
// IMPORTANTE: estes testes garantem que SOMENTE `version === 2` (numérico) é
// tratado como v2. Qualquer outro caso cai em v1 e mantém comportamento legado.

describe("shouldChecklistAppearToday — roteamento v1/v2", () => {
    it("config com version=1 (numérico) cai em v1", () => {
        // version=1 não existe oficialmente; o roteador deve ignorá-lo e cair em v1
        // (recurrence='weekly' v1 = bug "aparece todo dia")
        expect(
            shouldChecklistAppearToday(
                {
                    recurrence: "weekly",
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    recurrence_config: { version: 1, type: "daily" } as any,
                },
                SAT,
                ANY_DATE_KEY
            )
        ).toBe(true)
    })

    it("config com version='2' (string) cai em v1, NÃO em v2", () => {
        // Garantia anti-coerção: '2' !== 2
        expect(
            shouldChecklistAppearToday(
                {
                    recurrence: "weekly",
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    recurrence_config: { version: "2", type: "weekly", weekdays: [MON] } as any,
                },
                SAT, // sábado: v2 weekly[MON] retornaria false; v1 weekly retorna true
                ANY_DATE_KEY
            )
        ).toBe(true) // confirma que v1 prevaleceu
    })

    it("config com version=3 cai em v1 (futuro não cobre)", () => {
        expect(
            shouldChecklistAppearToday(
                {
                    recurrence: "weekly",
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    recurrence_config: { version: 3, type: "daily" } as any,
                },
                SAT,
                ANY_DATE_KEY
            )
        ).toBe(true)
    })

    it("config v2 weekly={MON} aparece só na segunda", () => {
        const config = {
            recurrence: "weekly",
            recurrence_config: { version: 2 as const, type: "weekly" as const, weekdays: [MON] },
        }
        expect(shouldChecklistAppearToday(config, MON, "2026-04-27")).toBe(true)
        expect(shouldChecklistAppearToday(config, TUE, "2026-04-28")).toBe(false)
    })

    it("config v2 daily aparece todo dia (mesmo resultado que v1, mas via v2)", () => {
        const config = {
            recurrence: "daily",
            recurrence_config: { version: 2 as const, type: "daily" as const },
        }
        for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
            expect(shouldChecklistAppearToday(config, day, ANY_DATE_KEY)).toBe(true)
        }
    })

    it("config v2 NÃO sofre fallback de v1 — weekly[MON] em terça é false", () => {
        // Sob v1, recurrence='weekly' retornaria true (bug). Sob v2, deve retornar false.
        const config = {
            recurrence: "weekly",
            recurrence_config: { version: 2 as const, type: "weekly" as const, weekdays: [MON] },
        }
        expect(shouldChecklistAppearToday(config, TUE, "2026-04-28")).toBe(false)
    })

    it("config v2 com array (não objeto plain) NÃO entra em v2", () => {
        // Arrays passam typeof === 'object' mas não têm version=2
        expect(
            shouldChecklistAppearToday(
                {
                    recurrence: "weekly",
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    recurrence_config: [] as any,
                },
                SAT,
                ANY_DATE_KEY
            )
        ).toBe(true) // v1 weekly bug = true
    })
})

// ─── filterChecklistsByRecurrence ─────────────────────────────────────────────

describe("filterChecklistsByRecurrence — v1 snapshot", () => {
    it("retorna apenas checklists que devem aparecer hoje", () => {
        const checklists = [
            { recurrence: "daily" },
            { recurrence: "weekdays" },
            { recurrence: "weekly" }, // bug: aparece todo dia
        ];

        // Em um sábado (SAT=6), 'weekdays' não deve aparecer; demais sim
        const result = filterChecklistsByRecurrence(checklists, SAT, ANY_DATE_KEY);
        expect(result).toHaveLength(2);
        expect(result.map((c) => c.recurrence)).toEqual(["daily", "weekly"]);
    });

    it("preserva referências dos objetos filtrados", () => {
        const c1 = { recurrence: "daily" };
        const c2 = { recurrence: "weekdays" };
        const result = filterChecklistsByRecurrence([c1, c2], SAT, ANY_DATE_KEY);
        expect(result).toEqual([c1]);
        expect(result[0]).toBe(c1);
    });

    it("retorna array vazio quando todos são filtrados", () => {
        const checklists = [{ recurrence: "weekdays" }, { recurrence: "weekdays" }];
        const result = filterChecklistsByRecurrence(checklists, SUN, ANY_DATE_KEY);
        expect(result).toHaveLength(0);
    });
});
