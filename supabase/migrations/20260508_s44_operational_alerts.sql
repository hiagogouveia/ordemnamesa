-- Sprint 44 — operational_alerts
-- Alertas operacionais detectados por regras simples no servidor.
-- Idempotência via UNIQUE parcial: 1 alerta aberto por (restaurant_id, alert_type).

CREATE TABLE IF NOT EXISTS public.operational_alerts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NULL REFERENCES public.accounts(id) ON DELETE SET NULL,
  restaurant_id      uuid NULL REFERENCES public.restaurants(id) ON DELETE SET NULL,
  alert_type         text NOT NULL CHECK (alert_type IN (
    'trial_expiring', 'inactive_restaurant', 'onboarding_incomplete', 'health_risk'
  )),
  severity           text NOT NULL CHECK (severity IN ('info', 'warning', 'risk')),
  title              text NOT NULL,
  description        text NULL,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at        timestamptz NULL,
  resolved_by        text NULL,
  resolution_reason  text NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.operational_alerts IS
  'Alertas operacionais gerados por regras automatizadas. resolved_by = "system" para auto-resolução, email do admin para resolução manual.';

-- 1 alerta aberto por (restaurant_id, alert_type) — base da idempotência
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_alerts_open_per_restaurant_type
  ON public.operational_alerts (restaurant_id, alert_type)
  WHERE resolved_at IS NULL AND restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operational_alerts_resolved_at
  ON public.operational_alerts (resolved_at);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_severity_created
  ON public.operational_alerts (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_type_created
  ON public.operational_alerts (alert_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_created_at
  ON public.operational_alerts (created_at DESC);

ALTER TABLE public.operational_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "operational_alerts_no_access" ON public.operational_alerts;
CREATE POLICY "operational_alerts_no_access" ON public.operational_alerts
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
