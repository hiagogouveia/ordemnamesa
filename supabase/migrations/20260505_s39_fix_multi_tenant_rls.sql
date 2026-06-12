-- s39: Fix multi-tenant RLS — corrige bug crítico `ru.restaurant_id = ru.restaurant_id`
-- que tornava a comparação sempre verdadeira e permitia acesso cross-tenant.
--
-- Escopo cirúrgico (sem refactor / sem helper):
--   P0: checklists, checklist_tasks, task_executions (4 policies bugadas)
--   P1: checklist_assumptions INSERT (trava user_id=auth.uid() + ru.active)
--       task_executions UPDATE (WITH CHECK impede reassignment de user_id)
--
-- Não toca em: admin_logs, leads, notifications, subscriptions, accounts, account_users.

BEGIN;

-- ===========================================================================
-- P0.1 — checklists: ALL para owner/manager
-- ===========================================================================
DROP POLICY IF EXISTS "checklists: owner/manager gerencia" ON public.checklists;

CREATE POLICY "checklists: owner/manager gerencia"
ON public.checklists
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = checklists.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.role IN ('owner','manager')
      AND ru.active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = checklists.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.role IN ('owner','manager')
      AND ru.active = true
  )
);

-- ===========================================================================
-- P0.2 — checklist_tasks: ALL para owner/manager
-- ===========================================================================
DROP POLICY IF EXISTS "checklist_tasks: owner/manager gerencia" ON public.checklist_tasks;

CREATE POLICY "checklist_tasks: owner/manager gerencia"
ON public.checklist_tasks
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = checklist_tasks.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.role IN ('owner','manager')
      AND ru.active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = checklist_tasks.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.role IN ('owner','manager')
      AND ru.active = true
  )
);

-- ===========================================================================
-- P0.3 + P1 — task_executions: INSERT (trava user_id = auth.uid())
-- ===========================================================================
DROP POLICY IF EXISTS "task_executions: membro insere" ON public.task_executions;

CREATE POLICY "task_executions: membro insere"
ON public.task_executions
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = task_executions.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.active = true
  )
);

-- ===========================================================================
-- P0.4 — task_executions: SELECT (staff ve propria; owner/manager veem tudo)
-- ===========================================================================
DROP POLICY IF EXISTS "task_executions: staff ve propria" ON public.task_executions;

CREATE POLICY "task_executions: staff ve propria"
ON public.task_executions
FOR SELECT
TO authenticated
USING (
  (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.restaurant_id = task_executions.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.active = true
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = task_executions.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.role IN ('owner','manager')
      AND ru.active = true
  )
);

-- ===========================================================================
-- P1 — task_executions: UPDATE (WITH CHECK impede reassignment de user_id)
-- ===========================================================================
DROP POLICY IF EXISTS "task_executions: membro atualiza propria" ON public.task_executions;

CREATE POLICY "task_executions: membro atualiza propria"
ON public.task_executions
FOR UPDATE
TO authenticated
USING (
  (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.restaurant_id = task_executions.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.active = true
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = task_executions.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.role IN ('owner','manager')
      AND ru.active = true
  )
)
WITH CHECK (
  (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.restaurant_id = task_executions.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.active = true
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = task_executions.restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.role IN ('owner','manager')
      AND ru.active = true
  )
);

-- ===========================================================================
-- P1 — checklist_assumptions: INSERT (trava user_id + ru.active)
-- ===========================================================================
DROP POLICY IF EXISTS "Staff can insert assumptions" ON public.checklist_assumptions;

CREATE POLICY "Staff can insert assumptions"
ON public.checklist_assumptions
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND restaurant_id IN (
    SELECT ru.restaurant_id
    FROM public.restaurant_users ru
    WHERE ru.user_id = auth.uid()
      AND ru.active = true
  )
);

COMMIT;
