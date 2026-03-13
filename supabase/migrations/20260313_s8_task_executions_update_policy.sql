-- Sprint 8 fix: adiciona políticas de UPDATE e DELETE para task_executions
-- Sem essas políticas, colaboradores não conseguem desmarcar tarefas (RLS bloqueava silenciosamente)
-- DELETE é necessário pois desmarcar uma task remove o registro (toggle usa INSERT/DELETE, não UPDATE de status)

CREATE POLICY "task_executions: membro atualiza propria"
  ON public.task_executions FOR UPDATE
  USING (
    (user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.restaurant_id = task_executions.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.active = true
    ))
    OR EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.restaurant_id = task_executions.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.role IN ('owner', 'manager')
        AND ru.active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.restaurant_id = task_executions.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.active = true
    )
  );

CREATE POLICY "task_executions: membro deleta propria"
  ON public.task_executions FOR DELETE
  USING (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.restaurant_id = task_executions.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.active = true
    )
  );
