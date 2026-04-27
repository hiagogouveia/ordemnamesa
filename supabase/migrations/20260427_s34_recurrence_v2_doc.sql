-- Sprint 34 — Recorrência v2 (apenas documentação).
--
-- Esta migration NÃO altera estrutura, NÃO faz backfill, NÃO toca em dados.
-- O único efeito é registrar via COMMENT que `recurrence_config` agora aceita
-- payloads no formato v2 além do legado v1.
--
-- Roteamento entre v1 e v2 é feito na aplicação:
--   - v2  ⇔  recurrence_config.version === 2  (estrito, numérico)
--   - v1  ⇔  qualquer outro caso (incluindo NULL, formato legado, etc.)
--
-- O CHECK constraint atual em `checklists.recurrence` (text) cobre todos os
-- valores possíveis de `RecurrenceV2.type` ('daily', 'weekly', 'monthly',
-- 'yearly', 'custom', 'shift_days'), portanto **nenhuma alteração de schema
-- é necessária**. O backend sincroniza automaticamente a coluna text com
-- `recurrence_config.type` quando o payload é v2.

COMMENT ON COLUMN public.checklists.recurrence_config IS
'Configuração de recorrência. Aceita dois formatos:
 - v1 (legado, Sprint 8): { frequency, interval, days_of_week?, end_type, end_date?, end_count? }
 - v2 (Sprint 34): discriminated union { version: 2, type: ''daily''|''weekly''|''shift_days''|''monthly''|''yearly''|''custom'', ... }
Detecção é feita no backend via `version === 2` estrito. Veja lib/utils/recurrence/.';

COMMENT ON COLUMN public.checklists.recurrence IS
'Classificação macro da recorrência (text). Em payloads v2, é sincronizada
automaticamente pelo backend a partir de recurrence_config.type. Em v1,
é a fonte primária da regra de recorrência. Valores possíveis fixados via
CHECK constraint: daily, weekly, monthly, yearly, weekdays, custom, shift_days.';
