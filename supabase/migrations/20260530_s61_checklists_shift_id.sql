-- Sprint 61 — Segmentação operacional por turno (fonte única da verdade)
-- Adiciona FK opcional checklists.shift_id -> shifts(id).
--
-- Semântica:
--   shift_id preenchido  -> rotina pertence àquele turno cadastrado
--                           (usado para visibilidade do colaborador e para
--                            herdar os dias da recorrência 'shift_days').
--   shift_id = NULL      -> "Todos os turnos" (visível a todos os colaboradores).
--
-- A coluna enum `shift` ('morning'|'afternoon'|'evening'|'any') é MANTIDA como
-- sombra de compatibilidade (relatórios, checklist_orders, ordenação/labels do
-- board, receiving continuam lendo o enum). Ela passa a ser derivada no save a
-- partir do shift_type do turno escolhido. Nada é removido nesta migration.
--
-- Backfill: NENHUM. Todas as rotinas legadas permanecem com shift_id = NULL
-- ("Todos os turnos") para garantir ZERO regressão de visibilidade no deploy —
-- a segmentação passa a ser opt-in pelo gestor. ON DELETE SET NULL faz uma
-- rotina cujo turno foi excluído voltar a ser global (em vez de bloquear o
-- DELETE do turno).

BEGIN;

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS shift_id uuid NULL
  REFERENCES public.shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_checklists_rest_shift_id
  ON public.checklists (restaurant_id, shift_id);

COMMENT ON COLUMN public.checklists.shift_id IS
  'Turno (shifts.id) ao qual a rotina pertence. NULL = todos os turnos (visível a todos). Fonte da verdade para visibilidade por turno e para os dias da recorrência shift_days. A coluna enum `shift` permanece como sombra derivada para consumidores legados.';

COMMIT;
