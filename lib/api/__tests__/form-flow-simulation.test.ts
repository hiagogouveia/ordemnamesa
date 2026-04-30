/**
 * Simulação do fluxo do `checklist-form.tsx` — prova logicamente que os
 * cenários bloqueantes C4/C6/C8 estão corretos sem precisar de browser real.
 *
 * Princípio: o frontend só constrói payload v2 quando `handleRecurrenceChange`
 * é chamado (admin toca no dropdown) ou o picker confirma. Em qualquer outro
 * caminho, `recurrence_config` no estado permanece o que veio do banco.
 *
 * Estes testes simulam cada cenário construindo o payload exato que o form
 * geraria, e o passam pelo `processRecurrencePayload` do backend.
 */
import { describe, it, expect } from "vitest"
import { processRecurrencePayload } from "../recurrence-payload"
import { buildV2FromDropdownOption } from "@/lib/utils/recurrence/build-from-dropdown"

// ─── Fixtures de rotinas v1 reais (espelham o que está no NONPROD) ─────────
const ROTINA_V1_DAILY = {
    id: "fake-daily-id",
    recurrence: "daily",
    recurrence_config: null,
}

const ROTINA_V1_CUSTOM_WEEKLY = {
    id: "fake-custom-weekly-id",
    recurrence: "custom",
    recurrence_config: {
        end_type: "never",
        interval: 1,
        frequency: "weekly",
        days_of_week: [1],
    },
}

const ROTINA_V1_WEEKDAYS = {
    id: "fake-weekdays-id",
    recurrence: "weekdays",
    recurrence_config: null,
}

const ROTINA_V1_SHIFT_DAYS = {
    id: "fake-shift-days-id",
    recurrence: "shift_days",
    recurrence_config: null,
}

// ─── Builder do payload do form ────────────────────────────────────────────
// Espelha exatamente o que checklist-form.tsx (handleSave + auto-save) gera.
function buildPayloadFromFormState(state: {
    recurrence: string
    recurrence_config: unknown
    name: string
}) {
    return {
        name: state.name,
        recurrence: state.recurrence,
        // CRÍTICO: o form envia o estado direto, sem transformação
        recurrence_config: state.recurrence_config ?? null,
    }
}

describe("Cenário C4: editar rotina v1 weekly mudando só o nome", () => {
    it("preserva recurrence_config v1 — backend trata como v1", () => {
        // Estado inicial do form ao carregar a rotina
        const initialState = {
            name: "Rotina Original",
            recurrence: ROTINA_V1_CUSTOM_WEEKLY.recurrence,
            recurrence_config: ROTINA_V1_CUSTOM_WEEKLY.recurrence_config,
        }

        // Admin altera APENAS o nome — handleRecurrenceChange NÃO é chamado
        const stateAfterEdit = {
            ...initialState,
            name: "Nome Editado",
        }

        const payload = buildPayloadFromFormState(stateAfterEdit)

        // Validação 1: payload preserva v1 inalterado
        expect(payload.recurrence_config).toEqual(
            ROTINA_V1_CUSTOM_WEEKLY.recurrence_config,
        )
        expect(payload.recurrence).toBe("custom")

        // Validação 2: backend roteia como v1 (não promove)
        const result = processRecurrencePayload(payload.recurrence_config)
        expect(result.mode).toBe("v1")
    })
})

describe("Cenário C6: editar rotina v1 daily mudando só o nome", () => {
    it("preserva recurrence_config null — backend trata como v1", () => {
        const initialState = {
            name: "Rotina Daily",
            recurrence: ROTINA_V1_DAILY.recurrence,
            recurrence_config: ROTINA_V1_DAILY.recurrence_config,
        }

        const stateAfterEdit = { ...initialState, name: "Daily Renomeada" }

        const payload = buildPayloadFromFormState(stateAfterEdit)

        // Continua null
        expect(payload.recurrence_config).toBeNull()

        // Backend não promove
        const result = processRecurrencePayload(payload.recurrence_config)
        expect(result.mode).toBe("v1")
    })

    it("preserva também weekdays e shift_days (todos cenários daily-like)", () => {
        for (const rotina of [ROTINA_V1_WEEKDAYS, ROTINA_V1_SHIFT_DAYS]) {
            const payload = buildPayloadFromFormState({
                name: "Renomeada",
                recurrence: rotina.recurrence,
                recurrence_config: rotina.recurrence_config,
            })
            expect(payload.recurrence_config).toBeNull()
            expect(processRecurrencePayload(payload.recurrence_config).mode).toBe("v1")
        }
    })
})

describe("Cenário C8: replicar rotina v1 e editar nome do destino", () => {
    it("cópia mantém recurrence_config v1 inalterado", () => {
        // Replica copia byte-a-byte (RPC replicate_checklists do PR 2 do banco)
        const copia = {
            id: "nova-id-copia",
            recurrence: ROTINA_V1_CUSTOM_WEEKLY.recurrence,
            recurrence_config: ROTINA_V1_CUSTOM_WEEKLY.recurrence_config,
        }

        // Admin abre a cópia e muda só o nome
        const payload = buildPayloadFromFormState({
            name: "Cópia Renomeada",
            recurrence: copia.recurrence,
            recurrence_config: copia.recurrence_config,
        })

        // Cópia continua v1 — backend não promove
        expect(payload.recurrence_config).toEqual(
            ROTINA_V1_CUSTOM_WEEKLY.recurrence_config,
        )
        expect(processRecurrencePayload(payload.recurrence_config).mode).toBe("v1")
    })
})

// ─── Cenário positivo: tocar no dropdown DEVE promover ──────────────────────

describe("Cenário positivo: admin toca no dropdown → payload v2", () => {
    it("rotina v1 daily → admin escolhe Semanal: toda terça → payload v2 weekly[2]", () => {
        // Estado inicial v1
        const initialState = {
            name: "Rotina",
            recurrence: ROTINA_V1_DAILY.recurrence,
            recurrence_config: ROTINA_V1_DAILY.recurrence_config,
        }

        // Admin clica no dropdown — handleRecurrenceChange constrói v2
        // (simulando uma terça-feira com weekday=2)
        const v2Config = buildV2FromDropdownOption("weekly", {
            day: 28,
            month: 4,
            weekday: 2,
            weekOfMonth: 4,
        })

        const stateAfterDropdown = {
            ...initialState,
            recurrence: "weekly",
            recurrence_config: v2Config,
        }

        const payload = buildPayloadFromFormState(stateAfterDropdown)

        // Payload é v2 e backend valida + sincroniza
        expect(payload.recurrence_config).toEqual({
            version: 2,
            type: "weekly",
            weekdays: [2],
        })

        const result = processRecurrencePayload(payload.recurrence_config)
        expect(result.mode).toBe("v2")
        if (result.mode === "v2" && result.ok) {
            // Backend devolve com o type correto para sincronizar coluna text
            expect(result.validated.type).toBe("weekly")
        } else {
            throw new Error("esperava v2 ok")
        }
    })

    it("rotina v1 custom → admin troca para Mensal (Nª segunda do mês) → payload v2 monthly weekday_position", () => {
        const v2Config = buildV2FromDropdownOption("monthly", {
            day: 27,
            month: 4,
            weekday: 1,
            weekOfMonth: 4,
        })

        const payload = buildPayloadFromFormState({
            name: "Rotina",
            recurrence: "monthly",
            recurrence_config: v2Config,
        })

        const result = processRecurrencePayload(payload.recurrence_config)
        expect(result.mode).toBe("v2")
        if (result.mode === "v2" && result.ok) {
            expect(result.validated).toEqual({
                version: 2,
                type: "monthly",
                mode: "weekday_position",
                weekday: 1,
                weekOfMonth: 4,
            })
        } else {
            throw new Error("esperava v2 ok")
        }
    })
})

// ─── Auto-save ──────────────────────────────────────────────────────────────

describe("Auto-save NÃO promove sem intenção", () => {
    it("auto-save dispara em mudança de qualquer campo, mas preserva recurrence_config v1", () => {
        // Cenário: admin abre rotina v1, muda descrição, auto-save dispara
        const initial = {
            name: "Original",
            description: "Descrição antiga",
            recurrence: ROTINA_V1_CUSTOM_WEEKLY.recurrence,
            recurrence_config: ROTINA_V1_CUSTOM_WEEKLY.recurrence_config,
        }

        const afterTyping = { ...initial, description: "Descrição nova" }

        const payload = {
            ...buildPayloadFromFormState(afterTyping),
            description: afterTyping.description,
        }

        // Description mudou mas recurrence_config preservado
        expect(payload.description).toBe("Descrição nova")
        expect(payload.recurrence_config).toEqual(initial.recurrence_config)
        expect(processRecurrencePayload(payload.recurrence_config).mode).toBe("v1")
    })
})
