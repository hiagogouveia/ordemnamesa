-- ============================================================
-- Sprint 33 — Billing: marcar accounts.plan_id como deprecated
-- ============================================================
-- Coluna legada redundante com subscriptions.plan_id. Não
-- remover nesta fase para preservar compatibilidade. Apenas
-- documentar para code review bloquear novos leitores.
-- Drop físico fica para S34+ depois de validarmos que nenhum
-- código lê essa coluna.
-- ============================================================

COMMENT ON COLUMN public.accounts.plan_id IS
  'DEPRECATED: use subscriptions.plan_id como fonte de verdade. Mantido apenas para compatibilidade histórica.';
