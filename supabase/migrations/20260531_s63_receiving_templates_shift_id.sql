-- Sprint 63 — Segmentação por turno nos recebimentos
-- Adiciona FK opcional receiving_templates.shift_id -> shifts(id), espelhando
-- checklists.shift_id (s61). Fonte da verdade do turno do recebimento.
--
--   shift_id preenchido -> recebimento pertence àquele turno (segmenta visibilidade).
--   shift_id = NULL      -> "Todos os turnos" (visível a todos da área/escopo).
--
-- A coluna enum `shift` é mantida como sombra de compatibilidade (derivada do
-- shift_type do turno no save). Sem backfill: templates legados ficam NULL =
-- "Todos os turnos" (zero regressão; segmentação é opt-in pelo gestor).

BEGIN;

ALTER TABLE public.receiving_templates
  ADD COLUMN IF NOT EXISTS shift_id uuid NULL
  REFERENCES public.shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_receiving_templates_rest_shift_id
  ON public.receiving_templates (restaurant_id, shift_id);

COMMENT ON COLUMN public.receiving_templates.shift_id IS
  'Turno (shifts.id) ao qual o recebimento pertence. NULL = todos os turnos. Fonte da verdade para segmentação por turno; o enum `shift` permanece como sombra derivada.';

COMMIT;
