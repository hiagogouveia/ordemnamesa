-- Sprint 43 — event_logs
-- Telemetria interna server-side. Sem PII em metadata.
-- ON DELETE SET NULL preserva eventos históricos.

CREATE TABLE IF NOT EXISTS public.event_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NULL REFERENCES public.accounts(id) ON DELETE SET NULL,
  restaurant_id   uuid NULL REFERENCES public.restaurants(id) ON DELETE SET NULL,
  user_id         uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  event_name      text NOT NULL,
  event_category  text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_logs IS
  'Telemetria interna do produto. Inserts via service role apenas. Não armazenar PII (senha, token, payload sensível).';

CREATE INDEX IF NOT EXISTS idx_event_logs_created_at ON public.event_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_logs_restaurant_created
  ON public.event_logs (restaurant_id, created_at DESC) WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_logs_account_created
  ON public.event_logs (account_id, created_at DESC) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_logs_event_created
  ON public.event_logs (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_logs_user_created
  ON public.event_logs (user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- RLS: bloqueia tudo. Service role bypassa. Staff lê via supabaseAdmin no Control Hub.
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "event_logs_no_access" ON public.event_logs;
CREATE POLICY "event_logs_no_access" ON public.event_logs
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
