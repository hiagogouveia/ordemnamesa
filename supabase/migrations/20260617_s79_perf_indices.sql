-- ============================================================
-- Sprint 79 — Índices de performance (Dashboard, Turno, Checklists, Relatórios)
-- ============================================================
-- Índices identificados no diagnóstico de performance das 4 telas mais lentas.
-- Todos aditivos e idempotentes (IF NOT EXISTS) — não alteram resultados de query.
-- Confirmado que NÃO duplicam índices existentes:
--   - task_executions já tem (restaurant_id, executed_at) [s30] e (checklist_assumption_id) [s45]
--   - task_issues já tem (checklist_assumption_id) [s45] — cobre o filtro do audit-service
--   - checklist_tasks NÃO tinha nenhum índice secundário
-- ============================================================

-- checklist_tasks: filtrada por checklist_id em três pontos quentes:
--   1) reset de recorrência (kanban/route.ts) — IN (checklist_id)
--   2) fetch de tasks do turno (kanban/route.ts) — IN (checklist_id)
--   3) contagem de tasks por checklist no audit-service (Relatórios) — IN (checklist_id)
CREATE INDEX IF NOT EXISTS idx_checklist_tasks_checklist
  ON public.checklist_tasks (checklist_id);

-- task_executions: kanban e dashboard filtram por restaurant_id + user_id + range de executed_at.
-- O índice existente (restaurant_id, executed_at) não inclui user_id, forçando filtro em memória.
CREATE INDEX IF NOT EXISTS idx_task_executions_restaurant_user_executed
  ON public.task_executions (restaurant_id, user_id, executed_at);

-- task_executions: audit-service (Relatórios) faz varredura ampla por checklist_id IN + range de executed_at,
-- SEM filtro por restaurant_id — então o índice precisa liderar por checklist_id.
CREATE INDEX IF NOT EXISTS idx_task_executions_checklist_executed
  ON public.task_executions (checklist_id, executed_at);
