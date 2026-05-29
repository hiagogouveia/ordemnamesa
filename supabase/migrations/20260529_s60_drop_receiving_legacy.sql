-- Sprint 60 — Etapa 5 do refator de Recebimentos: DROP definitivo do legacy.
--
-- Pré-requisito: commit 1 da Etapa 5 (code cleanup) JÁ está em produção.
-- Caso contrário, esta migration vai quebrar SELECT/INSERT em runtime de
-- /api/checklists, /api/areas, /api/tasks/kanban, etc.
--
-- Snapshot pré-migration registrado em
-- docs/refactor-recebimentos/etapa-5-snapshot-nonprod.md.

BEGIN;

-- ===========================================================================
-- 1. Limpeza de notificações com tipo legacy.
--    Necessário ANTES de refazer o CHECK constraint.
-- ===========================================================================
DELETE FROM public.notifications
 WHERE type IN ('RECEIVING_OVERDUE','RECEIVING_PENDING_CONFIRMATION');


-- ===========================================================================
-- 2. Refaz check constraint de notifications removendo tipos legacy.
-- ===========================================================================
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'TASK_COMPLETED_WITH_NOTE'::text,
    'NEW_TASK_ASSIGNED'::text,
    'NEW_TASK_FOR_AREA'::text,
    'PASSWORD_CHANGED_BY_ADMIN'::text
  ]));


-- ===========================================================================
-- 3. DROP da tabela receiving_expectations.
--    CASCADE remove em bloco:
--      - 3 policies RLS
--      - 4 indexes (PK, unique, 2 secundários)
--      - 4 FKs saindo (assumption_id, checklist_id, confirmed_by, restaurant_id)
--    Não há FK apontando PARA esta tabela.
-- ===========================================================================
DROP TABLE IF EXISTS public.receiving_expectations CASCADE;


-- ===========================================================================
-- 4. DROP de colunas legacy em checklists.
--    Drops cascateiam check constraints associados.
-- ===========================================================================
ALTER TABLE public.checklists DROP CONSTRAINT IF EXISTS checklists_receiving_mode_chk;
ALTER TABLE public.checklists DROP CONSTRAINT IF EXISTS checklists_receiving_generation_chk;

ALTER TABLE public.checklists
  DROP COLUMN IF EXISTS receiving_mode,
  DROP COLUMN IF EXISTS receiving_generation,
  DROP COLUMN IF EXISTS supplier_name;


-- ===========================================================================
-- 5. DROP de allow_manual_receiving em areas.
-- ===========================================================================
ALTER TABLE public.areas DROP COLUMN IF EXISTS allow_manual_receiving;

COMMIT;
