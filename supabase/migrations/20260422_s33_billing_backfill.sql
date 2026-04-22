-- ============================================================
-- Sprint 33 — Billing: backfill de subscriptions para accounts existentes
-- ============================================================
-- Idempotente. Para toda account sem subscription, cria um
-- trial 30d no Plano A. Re-run é no-op.
-- ============================================================

INSERT INTO public.subscriptions (
  account_id, plan_id, billing_cycle, status, started_at, ends_at
)
SELECT
  a.id,
  (SELECT id FROM public.plans WHERE code = 'A'),
  'monthly',
  'trial',
  now(),
  now() + interval '30 days'
FROM public.accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s
  WHERE s.account_id = a.id
);
