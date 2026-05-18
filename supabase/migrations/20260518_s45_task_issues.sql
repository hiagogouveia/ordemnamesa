-- Sprint 45: Ocorrências operacionais (task_issues) — desacopla "reportar problema" de execução
--
-- ANTES: reportar problema marcava task_executions.status = 'blocked' e impedia a finalização
-- da rotina. Confundia execução com ocorrência operacional.
--
-- DEPOIS: ocorrência vive em task_issues com timeline própria em task_issue_events. Task pode
-- ser concluída normalmente mesmo com ocorrência aberta. Gestor trata o issue separadamente.
--
-- Migração idempotente. Reversibilidade: dropar task_issues + task_issue_events, recolocar
-- 'blocked' no CHECK de task_executions, e UPDATE status='blocked' WHERE blocked_reason IS NOT NULL.
-- Colunas blocked_reason/at/by em task_executions são preservadas (deprecação em s45).

BEGIN;

-- ===========================================================================
-- PARTE 1 — Tabela task_issues
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.task_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  task_execution_id uuid REFERENCES public.task_executions(id) ON DELETE SET NULL,
  task_id uuid NOT NULL REFERENCES public.checklist_tasks(id) ON DELETE CASCADE,
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  checklist_assumption_id uuid REFERENCES public.checklist_assumptions(id) ON DELETE SET NULL,
  reported_by uuid NOT NULL REFERENCES public.users(id),
  description text NOT NULL CHECK (length(trim(description)) >= 3),
  photos text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  manager_comment text,
  resolved_by uuid REFERENCES public.users(id),
  resolved_at timestamptz,
  reopened_by uuid REFERENCES public.users(id),
  reopened_at timestamptz,
  -- Reservados para evolução futura (categorização, severidade, exigência de foto)
  severity text,
  category text,
  requires_photo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_issues_resolved_requires_comment
    CHECK (status <> 'resolved' OR (manager_comment IS NOT NULL AND length(trim(manager_comment)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_task_issues_restaurant_status
  ON public.task_issues(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_task_issues_assumption
  ON public.task_issues(checklist_assumption_id);
CREATE INDEX IF NOT EXISTS idx_task_issues_execution
  ON public.task_issues(task_execution_id);
CREATE INDEX IF NOT EXISTS idx_task_issues_checklist_open
  ON public.task_issues(checklist_id)
  WHERE status IN ('open','investigating');

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_task_issues_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_issues_updated_at ON public.task_issues;
CREATE TRIGGER trg_task_issues_updated_at
  BEFORE UPDATE ON public.task_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_task_issues_updated_at();

-- ===========================================================================
-- PARTE 2 — Tabela task_issue_events (timeline auditável, append-only)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.task_issue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_issue_id uuid NOT NULL REFERENCES public.task_issues(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created','status_changed','comment_added','resolved','reopened')),
  from_status text,
  to_status text,
  comment text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_issue_events_issue_time
  ON public.task_issue_events(task_issue_id, created_at);

-- ===========================================================================
-- PARTE 3 — RLS (padrão s40 via is_restaurant_member)
-- ===========================================================================
ALTER TABLE public.task_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_issue_events ENABLE ROW LEVEL SECURITY;

-- task_issues policies
DROP POLICY IF EXISTS "task_issues: staff ve propria, gestor ve tudo" ON public.task_issues;
CREATE POLICY "task_issues: staff ve propria, gestor ve tudo"
ON public.task_issues FOR SELECT TO authenticated
USING (
  (reported_by = auth.uid() AND public.is_restaurant_member(restaurant_id))
  OR public.is_restaurant_member(restaurant_id, ARRAY['owner','manager'])
);

DROP POLICY IF EXISTS "task_issues: membro insere propria" ON public.task_issues;
CREATE POLICY "task_issues: membro insere propria"
ON public.task_issues FOR INSERT TO authenticated
WITH CHECK (
  reported_by = auth.uid()
  AND public.is_restaurant_member(restaurant_id)
);

DROP POLICY IF EXISTS "task_issues: owner/manager atualiza" ON public.task_issues;
CREATE POLICY "task_issues: owner/manager atualiza"
ON public.task_issues FOR UPDATE TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

-- DELETE intencionalmente sem policy — auditoria obrigatória

-- task_issue_events policies
DROP POLICY IF EXISTS "task_issue_events: leitura segue task_issue" ON public.task_issue_events;
CREATE POLICY "task_issue_events: leitura segue task_issue"
ON public.task_issue_events FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_issues ti
    WHERE ti.id = task_issue_events.task_issue_id
      AND (
        (ti.reported_by = auth.uid() AND public.is_restaurant_member(ti.restaurant_id))
        OR public.is_restaurant_member(ti.restaurant_id, ARRAY['owner','manager'])
      )
  )
);

DROP POLICY IF EXISTS "task_issue_events: membro autenticado insere" ON public.task_issue_events;
CREATE POLICY "task_issue_events: membro autenticado insere"
ON public.task_issue_events FOR INSERT TO authenticated
WITH CHECK (
  actor_user_id = auth.uid()
  AND public.is_restaurant_member(restaurant_id)
);

-- UPDATE/DELETE intencionalmente sem policy

-- ===========================================================================
-- PARTE 4 — Backfill idempotente das execuções legadas com status='blocked'
-- ===========================================================================

-- 4a. Cria task_issue para cada execution blocked que ainda não tem issue associada
INSERT INTO public.task_issues (
  restaurant_id, task_execution_id, task_id, checklist_id,
  checklist_assumption_id, reported_by, description, status, created_at, updated_at
)
SELECT
  te.restaurant_id,
  te.id,
  te.task_id,
  te.checklist_id,
  te.checklist_assumption_id,
  te.blocked_by_user_id,
  COALESCE(NULLIF(trim(te.blocked_reason), ''), '(migrado: sem descrição)'),
  'open',
  COALESCE(te.blocked_at, te.executed_at, now()),
  COALESCE(te.blocked_at, te.executed_at, now())
FROM public.task_executions te
WHERE te.status = 'blocked'
  AND te.blocked_by_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.task_issues ti WHERE ti.task_execution_id = te.id
  );

-- 4b. Evento 'created' sintético para cada issue que ainda não tem evento de criação
INSERT INTO public.task_issue_events (
  task_issue_id, restaurant_id, event_type, to_status,
  actor_user_id, created_at, metadata
)
SELECT
  ti.id,
  ti.restaurant_id,
  'created',
  'open',
  ti.reported_by,
  ti.created_at,
  jsonb_build_object('backfilled', true, 'sprint', 45)
FROM public.task_issues ti
WHERE NOT EXISTS (
  SELECT 1 FROM public.task_issue_events e
  WHERE e.task_issue_id = ti.id AND e.event_type = 'created'
);

-- ===========================================================================
-- PARTE 5 — Atualizar CHECK de task_executions.status: remove 'blocked', adiciona 'pending'
-- ===========================================================================

-- Aliviar constraint que exige blocked_reason quando status='blocked' (não vai mais ser usado)
ALTER TABLE public.task_executions
  DROP CONSTRAINT IF EXISTS task_executions_blocked_reason_required;

-- Normalizar status: 'blocked' -> 'pending' (sem deletar a linha; colunas blocked_* preservadas)
ALTER TABLE public.task_executions
  DROP CONSTRAINT IF EXISTS task_executions_status_check;

ALTER TABLE public.task_executions
  ADD CONSTRAINT task_executions_status_check
  CHECK (status IN ('done','skipped','flagged','doing','pending','blocked'));

UPDATE public.task_executions
SET status = 'pending'
WHERE status = 'blocked';

-- Recria o CHECK já sem 'blocked' (agora que não há mais linhas com esse status)
ALTER TABLE public.task_executions
  DROP CONSTRAINT IF EXISTS task_executions_status_check;

ALTER TABLE public.task_executions
  ADD CONSTRAINT task_executions_status_check
  CHECK (status IN ('done','skipped','flagged','doing','pending'));

-- Índice antigo só fazia sentido com status='blocked' (parcial). Recriar sem o filtro.
DROP INDEX IF EXISTS idx_te_assumption;
CREATE INDEX IF NOT EXISTS idx_task_executions_assumption
  ON public.task_executions(checklist_assumption_id);

-- ===========================================================================
-- PARTE 6 — Atualizar CHECK de checklist_assumptions.execution_status (remove 'blocked')
-- ===========================================================================

-- Normalizar primeiro: se algum assumption ficou em 'blocked', mover para 'in_progress'
ALTER TABLE public.checklist_assumptions
  DROP CONSTRAINT IF EXISTS checklist_assumptions_execution_status_check;

UPDATE public.checklist_assumptions
SET execution_status = 'in_progress'
WHERE execution_status = 'blocked';

ALTER TABLE public.checklist_assumptions
  ADD CONSTRAINT checklist_assumptions_execution_status_check
  CHECK (execution_status IN ('in_progress','done'));

COMMIT;

-- ===========================================================================
-- COMENTÁRIOS DE METADADO
-- ===========================================================================
COMMENT ON TABLE public.task_issues IS
  'Ocorrências operacionais reportadas pelo staff numa task. Desacoplada de task_executions: '
  'a task pode ser concluída normalmente. Gestor/owner trata via status (open/investigating/resolved).';
COMMENT ON COLUMN public.task_issues.task_execution_id IS
  'Execução à qual a ocorrência se refere (nullable: pode existir sem execução).';
COMMENT ON COLUMN public.task_issues.requires_photo IS
  'Reservado para evolução futura: categorias que exigem evidência visual.';
COMMENT ON TABLE public.task_issue_events IS
  'Timeline append-only de uma ocorrência. UPDATE/DELETE bloqueados por RLS (auditoria).';
