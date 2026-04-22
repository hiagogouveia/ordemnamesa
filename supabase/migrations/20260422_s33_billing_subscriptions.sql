-- ============================================================
-- Sprint 33 — Billing: subscriptions por account
-- ============================================================
-- Uma account = uma subscription viva (trial|active|past_due).
-- Estados cobrem vocabulário Stripe para mapeamento 1:1 futuro.
-- block_task_exec_on_past_due default FALSE (permite execução
-- em past_due — reduz churn). grace_period_days preparado mas
-- sem lógica de transição nesta fase.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plan_id                     uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  billing_cycle               text NOT NULL CHECK (billing_cycle IN ('monthly','yearly')),
  status                      text NOT NULL CHECK (status IN (
                                'trial','active','past_due','canceled','incomplete','unpaid'
                              )),
  started_at                  timestamptz NOT NULL DEFAULT now(),
  ends_at                     timestamptz NULL,
  canceled_at                 timestamptz NULL,
  grace_period_days           int NULL,
  block_task_exec_on_past_due boolean NOT NULL DEFAULT false,
  stripe_customer_id          text NULL,
  stripe_subscription_id      text NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- 1 subscription "viva" por account (trial|active|past_due)
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_live_per_account
  ON public.subscriptions (account_id)
  WHERE status IN ('trial','active','past_due');

CREATE INDEX IF NOT EXISTS subscriptions_account_idx
  ON public.subscriptions (account_id);

-- Índice para cron futuro que expira trials (Fase 8)
CREATE INDEX IF NOT EXISTS subscriptions_trial_ends_at_idx
  ON public.subscriptions (ends_at)
  WHERE status = 'trial';

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Membros ativos da account podem ler a subscription da própria account
DROP POLICY IF EXISTS subscriptions_select_member ON public.subscriptions;
CREATE POLICY subscriptions_select_member ON public.subscriptions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.account_users au
    WHERE au.account_id = subscriptions.account_id
      AND au.user_id = auth.uid()
      AND au.active = true
  ));

-- Escrita apenas via service_role (sem policy INSERT/UPDATE/DELETE)
