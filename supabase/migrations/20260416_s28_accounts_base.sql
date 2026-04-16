-- ============================================================
-- Sprint 28 — Base estrutural de Accounts (Fase 1)
-- ============================================================
-- Introduz tenant de topo (accounts + account_users), liga
-- restaurants a uma account, prepara soft delete e unicidade
-- parcial de CNPJ. Sem alteração de UI, sem modo global, sem
-- replicação. Migrations desta fase:
--   1. 20260416_s28_accounts_base.sql      (este arquivo)
--   2. 20260416_s28_accounts_backfill.sql  (backfill idempotente)
--   3. 20260416_s28_accounts_rls.sql       (políticas RLS)
-- ============================================================

-- ── ACCOUNTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  plan_id     uuid NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── ACCOUNT_USERS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner','manager')),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, user_id)
);

CREATE INDEX IF NOT EXISTS account_users_user_idx
  ON public.account_users (user_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS account_users_account_idx
  ON public.account_users (account_id)
  WHERE active = true;

-- ── RESTAURANTS: colunas novas ──────────────────────────────
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS account_id  uuid NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS is_primary  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz NULL;

-- 1 principal ativa por account
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_one_primary_per_account
  ON public.restaurants (account_id)
  WHERE is_primary = true AND active = true;

-- CNPJ único apenas entre ativos (permite reuso após soft delete)
ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_cnpj_key;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_cnpj_active_unique
  ON public.restaurants (cnpj)
  WHERE cnpj IS NOT NULL AND active = true;
