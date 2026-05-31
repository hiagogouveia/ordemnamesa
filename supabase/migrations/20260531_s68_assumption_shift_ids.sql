-- Sprint 68 — Auditoria: snapshot dos turnos da rotina no momento da execução.
-- Com múltiplos turnos (s66), o snapshot vira um array de shift_id (registro
-- histórico imutável — array é adequado aqui, igual a assumption_user_shift_ids).
-- assumption_shift_id (single, s62) é mantido por compat (deprecado).

BEGIN;

ALTER TABLE public.checklist_assumptions
  ADD COLUMN IF NOT EXISTS assumption_shift_ids uuid[] NULL;

COMMENT ON COLUMN public.checklist_assumptions.assumption_shift_ids IS
  'Snapshot: turnos (shifts.id) da rotina no momento da assunção. Array vazio/NULL = "Todos os turnos". Substitui assumption_shift_id (single, deprecado) no modelo N:N.';

COMMIT;
