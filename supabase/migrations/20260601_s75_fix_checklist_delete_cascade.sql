-- Sprint 75 — Hard delete de checklists: alinhar o modelo de dados à intenção
-- da API (DELETE /api/checklists/[id]).
--
-- Bug (produção): a API faz hard delete assumindo cascata para tasks/assumptions/
-- orders, mas em prod essas FKs eram NO ACTION → `DELETE FROM checklists`
-- violava `checklist_tasks_checklist_id_fkey` (SQLSTATE 23503). Exclusão
-- inoperante para qualquer rotina com tarefas. (Em nonprod 3 dessas FKs já
-- estavam CASCADE — havia divergência de schema entre ambientes; esta migration
-- normaliza ambos de forma idempotente.)
--
-- Decisão de produto: hard delete — remover a rotina e TODOS os dados derivados.
-- Árvore de exclusão mapeada (8 tabelas), sem RESTRICT/NO ACTION remanescente:
--   checklists
--     ├─ checklist_tasks ─┬─ task_executions          (via task_id)
--     │                   └─ task_issues ─ task_issue_events
--     ├─ checklist_assumptions
--     ├─ checklist_orders
--     ├─ checklist_shifts                (já CASCADE)
--     ├─ task_executions                 (via checklist_id)
--     └─ task_issues ─ task_issue_events (task_issues já CASCADE)
-- FKs SET NULL preservadas (não bloqueiam e não devem cascatear):
--   checklists.source_checklist_id / root_source_checklist_id (linhagem de
--   replicação em outras unidades), task_executions.checklist_assumption_id,
--   task_issues.checklist_assumption_id, task_issues.task_execution_id.
--
-- Idempotente: DROP IF EXISTS + ADD com ON DELETE CASCADE.

BEGIN;

-- 1. checklist_tasks.checklist_id → checklists
ALTER TABLE public.checklist_tasks
  DROP CONSTRAINT IF EXISTS checklist_tasks_checklist_id_fkey;
ALTER TABLE public.checklist_tasks
  ADD CONSTRAINT checklist_tasks_checklist_id_fkey
  FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE CASCADE;

-- 2. checklist_assumptions.checklist_id → checklists
ALTER TABLE public.checklist_assumptions
  DROP CONSTRAINT IF EXISTS checklist_assumptions_checklist_id_fkey;
ALTER TABLE public.checklist_assumptions
  ADD CONSTRAINT checklist_assumptions_checklist_id_fkey
  FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE CASCADE;

-- 3. checklist_orders.checklist_id → checklists
ALTER TABLE public.checklist_orders
  DROP CONSTRAINT IF EXISTS checklist_orders_checklist_id_fkey;
ALTER TABLE public.checklist_orders
  ADD CONSTRAINT checklist_orders_checklist_id_fkey
  FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE CASCADE;

-- 4. task_executions.checklist_id → checklists
ALTER TABLE public.task_executions
  DROP CONSTRAINT IF EXISTS task_executions_checklist_id_fkey;
ALTER TABLE public.task_executions
  ADD CONSTRAINT task_executions_checklist_id_fkey
  FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE CASCADE;

-- 5. task_executions.task_id → checklist_tasks
ALTER TABLE public.task_executions
  DROP CONSTRAINT IF EXISTS task_executions_task_id_fkey;
ALTER TABLE public.task_executions
  ADD CONSTRAINT task_executions_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES public.checklist_tasks(id) ON DELETE CASCADE;

-- 6. task_issue_events.task_issue_id → task_issues  (era RESTRICT; folha da árvore)
ALTER TABLE public.task_issue_events
  DROP CONSTRAINT IF EXISTS task_issue_events_task_issue_id_fkey;
ALTER TABLE public.task_issue_events
  ADD CONSTRAINT task_issue_events_task_issue_id_fkey
  FOREIGN KEY (task_issue_id) REFERENCES public.task_issues(id) ON DELETE CASCADE;

COMMIT;
