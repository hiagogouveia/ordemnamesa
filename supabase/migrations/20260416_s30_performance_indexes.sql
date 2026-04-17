-- ============================================================
-- Sprint 30 — Índices de performance
-- ============================================================
-- Índices compostos para queries frequentes identificadas
-- no diagnóstico de performance. Criação idempotente (IF NOT EXISTS).
-- ============================================================

-- Dashboard: task_executions filtradas por restaurant + range de executed_at
CREATE INDEX IF NOT EXISTS idx_task_executions_restaurant_executed
  ON public.task_executions (restaurant_id, executed_at);

-- Shifts: filtro frequente por restaurant + active (dashboard, my-activities, kanban)
CREATE INDEX IF NOT EXISTS idx_shifts_restaurant_active
  ON public.shifts (restaurant_id)
  WHERE active = true;

-- RLS helper: restaurant_users consultado em subquery de policies (user_id + active + restaurant_id)
CREATE INDEX IF NOT EXISTS idx_restaurant_users_userid_active
  ON public.restaurant_users (user_id, restaurant_id)
  WHERE active = true;
