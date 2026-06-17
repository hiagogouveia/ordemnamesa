-- ============================================================
-- Sprint 79 — Índices de performance (Dashboard, Turno, Checklists, Relatórios)
-- ============================================================
-- Índices identificados no diagnóstico de performance das 4 telas mais lentas.
-- Aditivos e idempotentes (IF NOT EXISTS) — não alteram resultados de query.
--
-- Verificado no banco (NONPROD e PROD, via pg_indexes) o que JÁ existe — para
-- não duplicar índice (IF NOT EXISTS checa apenas o NOME, não as colunas):
--   - checklist_tasks(checklist_id)            já existe como idx_ct_checklist  -> NÃO recriar
--   - task_executions(checklist_id)            já existe como idx_te_checklist  (single-col)
--   - task_executions(restaurant_id)           já existe como idx_te_restaurant (single-col)
--   - task_executions(user_id)                 já existe como idx_te_user       (single-col)
--   - task_executions(restaurant_id,executed_at) já existe [s30]
--   - task_executions(checklist_assumption_id)   já existe [s45]
--   - task_issues(checklist_assumption_id)        já existe [s45] — cobre o audit-service
--
-- Esta migration adiciona apenas os índices COMPOSTOS que ainda faltam e que
-- superam os single-column existentes nas queries multi-predicado.
-- ============================================================

-- Kanban (Turno) e Dashboard filtram task_executions por
-- restaurant_id + user_id + range de executed_at. Os índices existentes
-- (restaurant_id, executed_at) e (user_id) sozinhos forçam filtro adicional;
-- o composto cobre os três predicados de uma vez.
CREATE INDEX IF NOT EXISTS idx_task_executions_restaurant_user_executed
  ON public.task_executions (restaurant_id, user_id, executed_at);

-- audit-service (Relatórios) varre task_executions por checklist_id IN + range
-- de executed_at (sem restaurant_id). O composto (checklist_id, executed_at)
-- supera o single-column idx_te_checklist nessa janela de datas.
CREATE INDEX IF NOT EXISTS idx_task_executions_checklist_executed
  ON public.task_executions (checklist_id, executed_at);
