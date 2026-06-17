-- s38: RLS hardening — fechar migration_logs, notifications INSERT, e revogar EXECUTE
-- de funções SECURITY DEFINER expostas indevidamente. Fixa search_path mutável.
--
-- Mudanças seguras: inserts e leituras reais já passam por service_role server-side
-- (verificado em app/api/* e app/control-hub-admin/**), então restringir RLS/EXECUTE
-- para anon/authenticated não quebra fluxos existentes.

BEGIN;

-- 1) migration_logs: habilitar RLS sem policies (bloqueia anon/authenticated;
--    service_role e migrations seguem bypassando RLS).
ALTER TABLE public.migration_logs ENABLE ROW LEVEL SECURITY;

-- 2) notifications: remover policy INSERT permissiva (WITH CHECK true). Inserts
--    legítimos vêm via service_role, que ignora RLS.
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;

-- 3) Revogar EXECUTE de funções SECURITY DEFINER expostas indevidamente.
--    handle_new_user é trigger interno; não deve ser callable via PostgREST.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

--    replicate_checklists só é chamada autenticada (app/api/checklists/replicate/route.ts:79).
REVOKE EXECUTE ON FUNCTION public.replicate_checklists(uuid[], uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.replicate_checklists(uuid[], uuid[]) TO authenticated;

--    signup_create_restaurant: mantido callable por anon (signup pré-login).

-- 4) Fixar search_path mutável em SECURITY DEFINER (mitiga schema hijack).
ALTER FUNCTION public.handle_new_user()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.signup_create_restaurant(uuid, text, text, text, text, text, text, text, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.replicate_checklists(uuid[], uuid[])
  SET search_path = public, pg_temp;

ALTER FUNCTION public.set_leads_updated_at()
  SET search_path = public, pg_temp;

COMMIT;
