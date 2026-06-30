-- Sprint 84 — Snapshot da definição da tarefa para fidelidade histórica da Auditoria
--
-- Contexto: a Auditoria/PDF leem título, descrição e criticidade da tarefa da definição ATUAL
-- de checklist_tasks. Se a tarefa é renomeada/editada/excluída depois, auditorias antigas passam
-- a exibir a definição nova (ou somem) — infidelidade histórica. Os snapshots existentes (s35)
-- cobrem apenas tipo/obrigatoriedade/config, não a identidade legível.
--
-- Esta migration adiciona o snapshot da identidade da tarefa e faz backfill a partir da definição
-- atual (melhor valor disponível para o passado; congela dali em diante). A Auditoria passará a ler
-- o snapshot com fallback para a definição atual em linhas legadas (coluna null).
--
-- Observação: deve ser aplicada ANTES dos triggers de imutabilidade (s85), para que o backfill
-- (um UPDATE em linhas concluídas) não seja bloqueado.

ALTER TABLE public.task_executions
  ADD COLUMN IF NOT EXISTS task_title_snapshot       text    NULL,
  ADD COLUMN IF NOT EXISTS task_description_snapshot text    NULL,
  ADD COLUMN IF NOT EXISTS is_critical_snapshot      boolean NULL;

COMMENT ON COLUMN public.task_executions.task_title_snapshot IS
  'Snapshot do checklist_tasks.title no momento da execução (fidelidade histórica da Auditoria).';
COMMENT ON COLUMN public.task_executions.task_description_snapshot IS
  'Snapshot do checklist_tasks.description no momento da execução.';
COMMENT ON COLUMN public.task_executions.is_critical_snapshot IS
  'Snapshot do checklist_tasks.is_critical no momento da execução.';

-- Backfill: preenche o snapshot a partir da definição atual da tarefa, apenas onde ainda é null
-- e a tarefa ainda existe. Linhas cuja tarefa já foi removida permanecem null (a Auditoria usa
-- fallback/'Tarefa').
UPDATE public.task_executions te
   SET task_title_snapshot       = ct.title,
       task_description_snapshot = ct.description,
       is_critical_snapshot      = ct.is_critical
  FROM public.checklist_tasks ct
 WHERE ct.id = te.task_id
   AND te.task_title_snapshot IS NULL;
