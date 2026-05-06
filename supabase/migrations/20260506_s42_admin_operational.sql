-- Sprint 42 — Control Hub operacional
-- Adiciona campos para suspensão de conta, VIP/tags e índices de performance.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS internal_notes text NULL,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS suspended_reason text NULL;

COMMENT ON COLUMN public.accounts.metadata IS
  'Escopo restrito: vip (boolean), tags (array de strings curtas). Não usar para cache, blobs grandes ou dados relacionais.';
COMMENT ON COLUMN public.accounts.internal_notes IS
  'Anotações internas do time de suporte/comercial. Não exibido no app dos clientes.';

CREATE INDEX IF NOT EXISTS idx_accounts_active ON public.accounts (active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_ends ON public.subscriptions (status, ends_at);
CREATE INDEX IF NOT EXISTS idx_checklist_assumptions_assumed_at ON public.checklist_assumptions (assumed_at DESC);
