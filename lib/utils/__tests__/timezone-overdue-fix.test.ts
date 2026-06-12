import { describe, it, expect } from "vitest";
import type { RecurrenceConfig, RecurrenceV2 } from "@/lib/types";
import { getNowInTz } from "@/lib/utils/brazil-date";
import { shouldChecklistAppearToday } from "@/lib/utils/should-checklist-appear-today";
import { getOperationalStatus } from "@/lib/utils/get-operational-status";

// Sprint 73 — Validação do cenário do bug:
// Restaurante GMT-4 (America/Manaus), domingo à noite (local), rotina de
// SEGUNDA, janela 07:00–15:00. Próxima ocorrência válida = amanhã (segunda).
//
// Instante UTC escolhido cai na "janela de virada": Manaus ainda é DOMINGO,
// enquanto São Paulo (GMT-3, usado pelo código antigo) já é SEGUNDA.
const BUG_WINDOW = new Date("2026-06-01T03:30:00Z");
const MANAUS = "America/Manaus";
const SAO_PAULO = "America/Sao_Paulo";

// Rotina de segunda-feira (weekday 1). Cobre v2 e v1-custom e v1-weekly.
const mondayV2: { recurrence: string; recurrence_config: RecurrenceV2 } =
    { recurrence: "weekly", recurrence_config: { version: 2, type: "weekly", weekdays: [1] } };
// Casts: payloads v1 legados reais não têm interval/end_type — o teste simula
// exatamente o que existe no banco, não o shape completo do tipo.
const mondayV1custom: { recurrence: string; recurrence_config: RecurrenceConfig } =
    { recurrence: "custom", recurrence_config: { frequency: "weekly", days_of_week: [1] } as RecurrenceConfig };
const mondayV1weekly: { recurrence: string; recurrence_config: RecurrenceConfig } =
    { recurrence: "weekly", recurrence_config: { days_of_week: [1] } as RecurrenceConfig };

describe("Sprint 73 — fuso por restaurante (GMT-4) na janela de virada", () => {
    it("Manaus ainda é DOMINGO; São Paulo já virou SEGUNDA (a raiz do bug)", () => {
        const manaus = getNowInTz(MANAUS, BUG_WINDOW);
        const sp = getNowInTz(SAO_PAULO, BUG_WINDOW);
        expect(manaus.dayOfWeek).toBe(0); // domingo
        expect(manaus.dateKey).toBe("2026-05-31");
        expect(sp.dayOfWeek).toBe(1); // segunda — comportamento antigo (errado p/ GMT-4)
        expect(sp.dateKey).toBe("2026-06-01");
    });
});

describe("Sprint 73 — rotina de segunda NÃO aparece no domingo (fuso correto)", () => {
    const manausSunday = getNowInTz(MANAUS, BUG_WINDOW).dayOfWeek; // 0
    const spMonday = getNowInTz(SAO_PAULO, BUG_WINDOW).dayOfWeek;  // 1

    for (const [label, routine] of [["v2", mondayV2], ["v1-custom", mondayV1custom], ["v1-weekly", mondayV1weekly]] as const) {
        it(`${label}: domingo (Manaus) → não aparece; segunda → aparece`, () => {
            expect(shouldChecklistAppearToday(routine, manausSunday, "2026-05-31")).toBe(false);
            expect(shouldChecklistAppearToday(routine, spMonday, "2026-06-01")).toBe(true);
        });
    }
});

describe("Sprint 73 — atraso é recorrência-aware", () => {
    const manaus = getNowInTz(MANAUS, BUG_WINDOW); // domingo 23:30 → minutes 1410
    const checklist = { area_id: "a1", execution_status: "not_started" as const, end_time: "15:00", ...mondayV2 };

    it("domingo (não é dia da rotina): NÃO fica 'overdue' mesmo após as 15:00", () => {
        const status = getOperationalStatus(checklist, manaus.minutes, {
            dayOfWeek: manaus.dayOfWeek, // 0 domingo
            dateKey: manaus.dateKey,
        });
        expect(manaus.minutes).toBeGreaterThan(15 * 60); // passou das 15:00
        expect(status).toBe("not_started"); // NÃO overdue
    });

    it("segunda (dia da rotina) após as 15:00 e não concluída: fica 'overdue' (verdadeiro positivo preservado)", () => {
        const status = getOperationalStatus(checklist, 16 * 60, {
            dayOfWeek: 1, // segunda
            dateKey: "2026-06-01",
        });
        expect(status).toBe("overdue");
    });

    it("comportamento legado sem statusCtx permanece (compat)", () => {
        // sem contexto → assume devida hoje (não regride chamadas antigas)
        expect(getOperationalStatus(checklist, 16 * 60)).toBe("overdue");
    });
});
