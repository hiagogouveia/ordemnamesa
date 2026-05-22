-- ============================================================
-- Sprint 45 — Stripe: idempotência de webhooks
-- ============================================================
-- Registra cada event.id já processado para garantir retry-safety.
-- O Stripe reentrega eventos; processar 2x deve ser no-op.
-- Escrita apenas via service_role (webhook server-side).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id            text PRIMARY KEY,           -- Stripe event.id (evt_...)
  type          text NOT NULL,              -- event.type
  processed_at  timestamptz NOT NULL DEFAULT now(),
  payload       jsonb NULL                  -- snapshot mínimo para auditoria/debug
);

CREATE INDEX IF NOT EXISTS stripe_events_type_idx
  ON public.stripe_events (type, processed_at DESC);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- Sem policies: acesso somente via service_role (webhook).
