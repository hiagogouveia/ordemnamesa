-- ============================================================================
-- Sprint 78 — Hardening de segurança (auditoria ofensiva 2026-06-12)
-- ============================================================================
-- Corrige:
--   C1  RPCs SECURITY DEFINER executáveis por anon/authenticated (RLS bypass,
--       escrita cross-tenant, falsificação de autor). Fix: REVOKE de
--       PUBLIC/anon/authenticated; só service_role executa (as rotas TS já
--       chamam via service-role e validam membership antes).
--   C2/C3/H6/M2/M3  Storage 'photos': policies SELECT/INSERT ignoravam o tenant
--       e o bucket não impunha MIME/tamanho. Fix: amarra o 1º segmento do path
--       (restaurant_id) à membership ativa do auth.uid() e restringe o bucket.
--   M8  task_executions deletável retroativamente pelo autor (apaga evidência).
--       Fix: DELETE só de linhas do dia corrente (preserva o "desfazer" do turno,
--       bloqueia adulteração do histórico de dias anteriores).
--   M9  checklist_assumptions SELECT não filtrava membro ativo (ex-funcionário
--       lia histórico). Fix: troca o IN(...) pelo helper is_restaurant_member.
--   WARN (advisor) search_path mutável em 5 funções. Fix: ALTER ... SET search_path.
--
-- Idempotente: REVOKE/GRANT, DROP POLICY IF EXISTS, CREATE POLICY, ALTER FUNCTION.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- C1 — Travar RPCs SECURITY DEFINER / de escrita: só service_role executa.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.instantiate_receiving_execution(uuid, uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.instantiate_receiving_execution(uuid, uuid, uuid, uuid, text, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.replace_receiving_template_tasks(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.replace_receiving_template_tasks(uuid, uuid, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.apply_kit(uuid, uuid, uuid, text[], uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_kit(uuid, uuid, uuid, text[], uuid[], text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.undo_kit_application(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.undo_kit_application(uuid, uuid[]) TO service_role;

-- ----------------------------------------------------------------------------
-- C2/C3/H6/M2/M3 — Storage 'photos' isolado por tenant + limites no bucket.
-- Path: <restaurant_id>/<execution_id>/<arquivo>. (storage.foldername(name))[1]
-- é o restaurant_id; precisa ser um restaurante onde auth.uid() é membro ativo.
-- is_restaurant_member é SECURITY DEFINER (sem recursão de RLS em restaurant_users).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload photos"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'photos'
        AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND public.is_restaurant_member(((storage.foldername(name))[1])::uuid)
    );

DROP POLICY IF EXISTS "Authenticated users can read photos" ON storage.objects;
CREATE POLICY "Authenticated users can read photos"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'photos'
        AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND public.is_restaurant_member(((storage.foldername(name))[1])::uuid)
    );

-- Enforcement server-side de tipo e tamanho (o client validava, mas era burlável
-- chamando o Storage diretamente com o JWT). 10 MiB; só JPEG/PNG.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png'],
    file_size_limit    = 10485760
WHERE id = 'photos';

-- ----------------------------------------------------------------------------
-- M8 — task_executions: DELETE só de linhas do dia corrente (timezone SP, igual
-- ao restante do domínio). Preserva o "desfazer" do turno; bloqueia exclusão
-- retroativa de evidência de dias anteriores.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "task_executions: membro deleta propria" ON public.task_executions;
CREATE POLICY "task_executions: membro deleta propria"
    ON public.task_executions FOR DELETE TO authenticated
    USING (
        user_id = auth.uid()
        AND public.is_restaurant_member(restaurant_id)
        AND COALESCE(executed_at, started_at, blocked_at)
            >= (date_trunc('day', (now() AT TIME ZONE 'America/Sao_Paulo')) AT TIME ZONE 'America/Sao_Paulo')
    );

-- ----------------------------------------------------------------------------
-- M9 — checklist_assumptions SELECT: exigir membro ATIVO (ex-funcionário cuja
-- linha em restaurant_users ficou active=false não deve mais ler o histórico).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Restaurant members can view assumptions" ON public.checklist_assumptions;
CREATE POLICY "Restaurant members can view assumptions"
    ON public.checklist_assumptions FOR SELECT TO authenticated
    USING (public.is_restaurant_member(restaurant_id));

-- ----------------------------------------------------------------------------
-- WARN advisor — fixar search_path nas funções sinalizadas (anti-hijack de
-- search_path em SECURITY DEFINER e triggers).
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.apply_kit(uuid, uuid, uuid, text[], uuid[], text)        SET search_path = public, pg_temp;
ALTER FUNCTION public.undo_kit_application(uuid, uuid[])                        SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_task_issues_updated_at()                           SET search_path = public, pg_temp;
ALTER FUNCTION public.tg_receiving_templates_updated_at()                      SET search_path = public, pg_temp;
ALTER FUNCTION public.tg_checklist_templates_updated_at()                      SET search_path = public, pg_temp;
ALTER FUNCTION public.tg_template_kits_updated_at()                            SET search_path = public, pg_temp;

COMMIT;
