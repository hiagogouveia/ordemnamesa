-- s40: RLS standardization — helper is_restaurant_member + migração controlada
-- de policies em checklists, checklist_tasks, task_executions. Comportamento idêntico
-- ao pós-s39, apenas troca o EXISTS inline pelo helper centralizado.
--
-- Inclui também (comentadas) duas variantes de event trigger anti-RLS — entregues
-- como referência mas NÃO ativadas, conforme decisão de risco documentada abaixo.

BEGIN;

-- ===========================================================================
-- PARTE 1 — Helper oficial: is_restaurant_member(rid, required_roles?)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.is_restaurant_member(
  rid uuid,
  required_roles text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_users ru
    WHERE ru.restaurant_id = rid
      AND ru.user_id = auth.uid()
      AND ru.active = true
      AND (
        required_roles IS NULL
        OR ru.role = ANY(required_roles)
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_restaurant_member(uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_restaurant_member(uuid, text[]) TO authenticated;

COMMENT ON FUNCTION public.is_restaurant_member(uuid, text[]) IS
  'Padrão oficial de RLS multi-tenant. Retorna true se auth.uid() é membro ativo do restaurante rid '
  'com algum dos roles em required_roles (NULL = qualquer role). Use em policies em vez de EXISTS inline.';

-- ===========================================================================
-- PARTE 2 — Migração controlada: checklists, checklist_tasks, task_executions
-- Comportamento mantido idêntico ao pós-s39.
-- ===========================================================================

-- ---- checklists ----
DROP POLICY IF EXISTS "checklists: membro ve" ON public.checklists;
CREATE POLICY "checklists: membro ve"
ON public.checklists FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "checklists: owner/manager gerencia" ON public.checklists;
CREATE POLICY "checklists: owner/manager gerencia"
ON public.checklists FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

-- ---- checklist_tasks ----
DROP POLICY IF EXISTS "checklist_tasks: membro ve" ON public.checklist_tasks;
CREATE POLICY "checklist_tasks: membro ve"
ON public.checklist_tasks FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "checklist_tasks: owner/manager gerencia" ON public.checklist_tasks;
CREATE POLICY "checklist_tasks: owner/manager gerencia"
ON public.checklist_tasks FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

-- ---- task_executions ----
DROP POLICY IF EXISTS "task_executions: membro insere" ON public.task_executions;
CREATE POLICY "task_executions: membro insere"
ON public.task_executions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_restaurant_member(restaurant_id)
);

DROP POLICY IF EXISTS "task_executions: staff ve propria" ON public.task_executions;
CREATE POLICY "task_executions: staff ve propria"
ON public.task_executions FOR SELECT TO authenticated
USING (
  (user_id = auth.uid() AND public.is_restaurant_member(restaurant_id))
  OR public.is_restaurant_member(restaurant_id, ARRAY['owner','manager'])
);

DROP POLICY IF EXISTS "task_executions: membro atualiza propria" ON public.task_executions;
CREATE POLICY "task_executions: membro atualiza propria"
ON public.task_executions FOR UPDATE TO authenticated
USING (
  (user_id = auth.uid() AND public.is_restaurant_member(restaurant_id))
  OR public.is_restaurant_member(restaurant_id, ARRAY['owner','manager'])
)
WITH CHECK (
  (user_id = auth.uid() AND public.is_restaurant_member(restaurant_id))
  OR public.is_restaurant_member(restaurant_id, ARRAY['owner','manager'])
);

DROP POLICY IF EXISTS "task_executions: membro deleta propria" ON public.task_executions;
CREATE POLICY "task_executions: membro deleta propria"
ON public.task_executions FOR DELETE TO authenticated
USING (
  user_id = auth.uid() AND public.is_restaurant_member(restaurant_id)
);

COMMIT;

-- ===========================================================================
-- PARTE 3 — Event trigger anti-RLS (NÃO ATIVADO — entregue como referência)
-- ===========================================================================
--
-- Por que NÃO ativar automaticamente nesta fase:
--
-- 1) Event triggers do Postgres disparam em `ddl_command_end` POR COMANDO. Se uma
--    migration faz, na mesma transação,
--        CREATE TABLE public.foo (...);
--        ALTER TABLE public.foo ENABLE ROW LEVEL SECURITY;
--    o trigger já dispara após o CREATE TABLE — antes do ALTER — e rejeita a
--    transação inteira. Padrão extremamente comum em migrations Supabase, então
--    enforcement quebra o fluxo natural de desenvolvimento.
--
-- 2) Supabase rotineiramente cria tabelas em schemas internos (auth, storage,
--    realtime, supabase_*) — precisamos restringir a `public`. Ainda assim,
--    extensões instaladas no schema public (postgis, pg_net etc.) podem criar
--    tabelas que naturalmente não têm RLS, causando falsos positivos.
--
-- 3) `CREATE TABLE ... PARTITION OF`, `CREATE TABLE AS SELECT` e tabelas
--    geradas por extensions têm comportamento variado em
--    `pg_event_trigger_ddl_commands()`.
--
-- Decisão: deixamos as duas variantes abaixo (enforcement + warn-only) como
-- referência. Para ativar uma delas no futuro:
--   • rodar primeiro a versão WARN-ONLY por algumas semanas;
--   • coletar amostras de migrations que disparariam falso positivo;
--   • criar allowlist (tabelas da Supabase, partições, tabelas de extensions);
--   • só então considerar enforcement.
--
-- ---------------------------------------------------------------------------
-- Variante A — ENFORCEMENT (alto risco; NÃO RODAR sem allowlist)
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.enforce_rls_on_public_tables()
-- RETURNS event_trigger
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_catalog, pg_temp
-- AS $fn$
-- DECLARE
--   obj record;
--   is_rls boolean;
-- BEGIN
--   FOR obj IN
--     SELECT * FROM pg_event_trigger_ddl_commands()
--     WHERE command_tag = 'CREATE TABLE'
--       AND schema_name = 'public'
--       AND object_type = 'table'
--   LOOP
--     SELECT c.relrowsecurity INTO is_rls
--     FROM pg_class c
--     WHERE c.oid = obj.objid;
--     IF NOT COALESCE(is_rls, false) THEN
--       RAISE EXCEPTION
--         'RLS policy violation: tabela %.% criada sem ROW LEVEL SECURITY. '
--         'Habilite RLS na mesma migration via ALTER TABLE ... ENABLE ROW LEVEL SECURITY.',
--         obj.schema_name, obj.object_identity;
--     END IF;
--   END LOOP;
-- END;
-- $fn$;
--
-- CREATE EVENT TRIGGER enforce_rls_on_public_tables
-- ON ddl_command_end
-- WHEN TAG IN ('CREATE TABLE')
-- EXECUTE FUNCTION public.enforce_rls_on_public_tables();
--
-- ---------------------------------------------------------------------------
-- Variante B — WARN-ONLY (baixo risco; recomendada para piloto)
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.warn_rls_on_public_tables()
-- RETURNS event_trigger
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_catalog, pg_temp
-- AS $fn$
-- DECLARE
--   obj record;
--   is_rls boolean;
-- BEGIN
--   FOR obj IN
--     SELECT * FROM pg_event_trigger_ddl_commands()
--     WHERE command_tag = 'CREATE TABLE'
--       AND schema_name = 'public'
--       AND object_type = 'table'
--   LOOP
--     SELECT c.relrowsecurity INTO is_rls
--     FROM pg_class c WHERE c.oid = obj.objid;
--     IF NOT COALESCE(is_rls, false) THEN
--       RAISE WARNING
--         '[RLS-AUDIT] Tabela %.% criada sem RLS — habilite na mesma migration.',
--         obj.schema_name, obj.object_identity;
--     END IF;
--   END LOOP;
-- END;
-- $fn$;
--
-- CREATE EVENT TRIGGER warn_rls_on_public_tables
-- ON ddl_command_end
-- WHEN TAG IN ('CREATE TABLE')
-- EXECUTE FUNCTION public.warn_rls_on_public_tables();
