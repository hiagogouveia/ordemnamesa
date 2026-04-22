-- ============================================================
-- Sprint 33 — Billing: tabela de planos (catálogo)
-- ============================================================
-- Modela os 4 planos comerciais (A/B/C/D) com limites e preços
-- em centavos. Campos stripe_price_id_* ficam NULL para futura
-- integração via MCP sem retrabalho.
--
-- RLS: SELECT liberado para autenticados (catálogo), escrita
-- apenas via service_role (sem policy INSERT/UPDATE/DELETE).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plans (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     text NOT NULL UNIQUE CHECK (code IN ('A','B','C','D')),
  name                     text NOT NULL,
  max_units                int  NOT NULL CHECK (max_units > 0),
  max_managers             int  NOT NULL CHECK (max_managers >= 0),
  max_staff_per_unit       int  NOT NULL CHECK (max_staff_per_unit >= 0),
  price_monthly_cents      int  NOT NULL CHECK (price_monthly_cents >= 0),
  price_yearly_cents       int  NOT NULL CHECK (price_yearly_cents >= 0),
  stripe_price_id_monthly  text NULL,
  stripe_price_id_yearly   text NULL,
  active                   boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select_auth ON public.plans;
CREATE POLICY plans_select_auth ON public.plans FOR SELECT
  USING (auth.role() = 'authenticated');

-- Seed idempotente dos 4 planos (preços em centavos; yearly é valor mensal equivalente)
INSERT INTO public.plans (code, name, max_units, max_managers, max_staff_per_unit, price_monthly_cents, price_yearly_cents)
VALUES
  ('A', 'Commis',         1, 1, 6,  7400,  6600),
  ('B', 'Chef de Partie', 2, 2, 12, 14000, 12600),
  ('C', 'Sous-Chef',      4, 3, 20, 26500, 23800),
  ('D', 'Chef Executivo', 6, 5, 35, 50000, 45000)
ON CONFLICT (code) DO UPDATE SET
  name               = EXCLUDED.name,
  max_units          = EXCLUDED.max_units,
  max_managers       = EXCLUDED.max_managers,
  max_staff_per_unit = EXCLUDED.max_staff_per_unit,
  price_monthly_cents= EXCLUDED.price_monthly_cents,
  price_yearly_cents = EXCLUDED.price_yearly_cents,
  updated_at         = now();
