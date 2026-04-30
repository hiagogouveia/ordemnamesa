import type { RecurrenceV2 } from "@/lib/types"
import { validateV2, RecurrenceValidationError } from "@/lib/utils/recurrence"

/**
 * Resultado de processar o `recurrence_config` recebido em um POST/PUT.
 *
 * - `mode: 'v1'`  → payload é v1 (ou ausente). O caller mantém o caminho legado
 *                   intacto. **Nunca** transforma, normaliza ou promove para v2.
 * - `mode: 'v2'` + `ok: true`   → v2 válido; usar `validated` no INSERT/UPDATE
 *                                  e sincronizar a coluna `recurrence` (text)
 *                                  com `validated.type`.
 * - `mode: 'v2'` + `ok: false`  → v2 inválido; o caller deve responder 400 com
 *                                  o `error` e o code `INVALID_RECURRENCE_V2`.
 */
export type RecurrenceProcessResult =
    | { mode: "v1" }
    | { mode: "v2"; ok: true; validated: RecurrenceV2 }
    | { mode: "v2"; ok: false; error: string }

/**
 * Detecta v2 de forma estrita (`version === 2` numérico) e valida.
 * Para qualquer outro formato — `null`, `undefined`, `version: 1`, `version: '2'`
 * (string), ausência, etc — retorna `{ mode: 'v1' }` sem alteração nenhuma.
 *
 * Política: zero coerção, zero normalização, zero default-fill.
 */
export function processRecurrencePayload(
    recurrence_config: unknown,
): RecurrenceProcessResult {
    const isV2 =
        typeof recurrence_config === "object" &&
        recurrence_config !== null &&
        (recurrence_config as { version?: unknown }).version === 2

    if (!isV2) return { mode: "v1" }

    try {
        const validated = validateV2(recurrence_config)
        return { mode: "v2", ok: true, validated }
    } catch (err) {
        const error =
            err instanceof RecurrenceValidationError
                ? err.message
                : "recurrence_config v2 inválida"
        return { mode: "v2", ok: false, error }
    }
}
