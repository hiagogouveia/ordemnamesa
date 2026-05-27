-- s41: Advanced RLS governance
--   PARTE 1 — replicate_checklists: substitui EXISTS inline pelo helper
--             public.is_restaurant_member. Comportamento idêntico.
--   PARTE 2 — Migra para o helper as policies inline restantes:
--             areas, checklist_orders, purchase_items, purchase_lists,
--             roles, shifts, user_areas, user_roles, user_shifts.
--             Comportamento preservado.
--
-- Nada de novo é exposto, nada é privatizado: este arquivo é hardening de
-- consistência e manutenibilidade. Auditoria completa de replicate_checklists
-- não detectou vulnerabilidade explorável (controles de account/membership,
-- lock por destino, inserção idempotente via root_source_checklist_id e
-- ausência de SQL dinâmico já estavam corretos).

BEGIN;

-- ===========================================================================
-- PARTE 1 — replicate_checklists: usar helper na verificação por unidade
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.replicate_checklists(
  p_checklist_ids uuid[],
  p_target_restaurant_ids uuid[]
)
RETURNS TABLE(
  target_restaurant_id uuid,
  source_checklist_id uuid,
  status text,
  new_checklist_id uuid,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_caller      uuid := auth.uid();
    v_account     uuid;
    v_acct_count  integer;
    v_all_rids    uuid[];
    v_src_rids    uuid[];
    v_src_rec     record;
    v_tgt         uuid;
    v_target_area uuid;
    v_new_id      uuid;
    v_root        uuid;
    v_existing    uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
    END IF;

    IF p_checklist_ids IS NULL OR array_length(p_checklist_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'checklist_ids vazio' USING ERRCODE = '22023';
    END IF;
    IF p_target_restaurant_ids IS NULL OR array_length(p_target_restaurant_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'target_restaurant_ids vazio' USING ERRCODE = '22023';
    END IF;

    -- Resolve restaurantes-origem a partir dos checklists fornecidos
    SELECT array_agg(DISTINCT c.restaurant_id)
      INTO v_src_rids
      FROM public.checklists c
     WHERE c.id = ANY(p_checklist_ids);

    IF coalesce(array_length(v_src_rids, 1), 0) = 0 THEN
        RAISE EXCEPTION 'Checklists de origem não encontrados' USING ERRCODE = 'P0002';
    END IF;

    v_all_rids := v_src_rids || p_target_restaurant_ids;

    -- Restringe a operação à mesma account (isolamento entre clientes)
    SELECT count(DISTINCT r.account_id), min(r.account_id::text)::uuid
      INTO v_acct_count, v_account
      FROM public.restaurants r
     WHERE r.id = ANY(v_all_rids);

    IF v_acct_count IS NULL OR v_acct_count <> 1 THEN
        RAISE EXCEPTION 'Todas as unidades devem pertencer à mesma account'
            USING ERRCODE = '42501';
    END IF;

    -- Autorização: owner/manager da account OU membership owner/manager em
    -- TODAS as unidades envolvidas (origem + destino).
    IF EXISTS (
        SELECT 1 FROM public.account_users au
         WHERE au.account_id = v_account
           AND au.user_id = v_caller
           AND au.role IN ('owner','manager')
           AND au.active
    ) THEN
        NULL;
    ELSE
        IF EXISTS (
            SELECT 1 FROM unnest(v_all_rids) AS rid
             WHERE NOT public.is_restaurant_member(rid, ARRAY['owner','manager'])
        ) THEN
            RAISE EXCEPTION 'Acesso negado a uma ou mais unidades'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    FOREACH v_tgt IN ARRAY p_target_restaurant_ids
    LOOP
        PERFORM pg_advisory_xact_lock(hashtext(v_tgt::text)::bigint);

        FOR v_src_rec IN
            SELECT c.*
              FROM public.checklists c
             WHERE c.id = ANY(p_checklist_ids)
        LOOP
            BEGIN
                IF v_src_rec.restaurant_id = v_tgt THEN
                    target_restaurant_id := v_tgt;
                    source_checklist_id  := v_src_rec.id;
                    status               := 'skipped';
                    new_checklist_id     := NULL;
                    error_message        := 'Origem e destino coincidem';
                    RETURN NEXT;
                    CONTINUE;
                END IF;

                v_root := COALESCE(v_src_rec.root_source_checklist_id, v_src_rec.id);

                SELECT c2.id INTO v_existing
                  FROM public.checklists c2
                 WHERE c2.restaurant_id = v_tgt
                   AND c2.root_source_checklist_id = v_root
                 LIMIT 1;

                IF v_existing IS NOT NULL THEN
                    target_restaurant_id := v_tgt;
                    source_checklist_id  := v_src_rec.id;
                    status               := 'skipped';
                    new_checklist_id     := v_existing;
                    error_message        := NULL;
                    RETURN NEXT;
                    CONTINUE;
                END IF;

                SELECT a.id INTO v_target_area
                  FROM public.areas a
                  JOIN public.areas src_a ON src_a.id = v_src_rec.area_id
                 WHERE a.restaurant_id = v_tgt
                   AND lower(a.name) = lower(src_a.name)
                 LIMIT 1;

                IF v_target_area IS NULL THEN
                    INSERT INTO public.areas
                        (restaurant_id, name, description, color, priority_mode, max_parallel_tasks)
                    SELECT v_tgt, src_a.name, src_a.description, src_a.color,
                           src_a.priority_mode, src_a.max_parallel_tasks
                      FROM public.areas src_a
                     WHERE src_a.id = v_src_rec.area_id
                    RETURNING id INTO v_target_area;
                END IF;

                v_new_id := gen_random_uuid();
                INSERT INTO public.checklists (
                    id, restaurant_id, name, description, shift, status, category,
                    role_id, is_required, checklist_type, assigned_to_user_id,
                    recurrence, start_time, end_time, recurrence_config,
                    enforce_sequential_order, area_id, target_role, assignment_type,
                    active, created_by, source_checklist_id, root_source_checklist_id
                ) VALUES (
                    v_new_id, v_tgt, v_src_rec.name, v_src_rec.description, v_src_rec.shift,
                    v_src_rec.status, v_src_rec.category,
                    NULL,
                    v_src_rec.is_required, v_src_rec.checklist_type,
                    NULL,
                    v_src_rec.recurrence, v_src_rec.start_time, v_src_rec.end_time,
                    v_src_rec.recurrence_config, v_src_rec.enforce_sequential_order,
                    v_target_area, v_src_rec.target_role, v_src_rec.assignment_type,
                    COALESCE(v_src_rec.active, true),
                    v_caller,
                    v_src_rec.id, v_root
                );

                INSERT INTO public.checklist_tasks (
                    checklist_id, restaurant_id, title, description,
                    requires_photo, is_critical, "order",
                    assigned_to_user_id, role_id, checklist_type, area_id
                )
                SELECT v_new_id, v_tgt, t.title, t.description,
                       t.requires_photo, t.is_critical, t."order",
                       NULL, NULL, t.checklist_type, v_target_area
                  FROM public.checklist_tasks t
                 WHERE t.checklist_id = v_src_rec.id;

                target_restaurant_id := v_tgt;
                source_checklist_id  := v_src_rec.id;
                status               := 'created';
                new_checklist_id     := v_new_id;
                error_message        := NULL;
                RETURN NEXT;

            EXCEPTION WHEN OTHERS THEN
                target_restaurant_id := v_tgt;
                source_checklist_id  := v_src_rec.id;
                status               := 'error';
                new_checklist_id     := NULL;
                error_message        := SQLERRM;
                RETURN NEXT;
            END;
        END LOOP;
    END LOOP;
END;
$fn$;

-- Garante que permissões e exposição não regrediram com o REPLACE
REVOKE EXECUTE ON FUNCTION public.replicate_checklists(uuid[], uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.replicate_checklists(uuid[], uuid[]) TO authenticated;

COMMENT ON FUNCTION public.replicate_checklists(uuid[], uuid[]) IS
  'Replica checklists+tasks entre unidades da MESMA account. Autoriza via account_users (account-level owner/manager) OU restaurant_users (owner/manager em todas as unidades envolvidas, via is_restaurant_member). Idempotente por root_source_checklist_id; usa pg_advisory_xact_lock por destino.';

-- ===========================================================================
-- PARTE 2 — Migrar policies inline para o helper (comportamento preservado)
-- ===========================================================================

-- areas
DROP POLICY IF EXISTS "areas: members can view" ON public.areas;
CREATE POLICY "areas: members can view" ON public.areas FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "areas: owner/manager can create" ON public.areas;
CREATE POLICY "areas: owner/manager can create" ON public.areas FOR INSERT TO authenticated
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

DROP POLICY IF EXISTS "areas: owner/manager can update" ON public.areas;
CREATE POLICY "areas: owner/manager can update" ON public.areas FOR UPDATE TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

DROP POLICY IF EXISTS "areas: owner can delete" ON public.areas;
CREATE POLICY "areas: owner can delete" ON public.areas FOR DELETE TO authenticated
USING (public.is_restaurant_member(restaurant_id, ARRAY['owner']));

-- checklist_orders
DROP POLICY IF EXISTS "checklist_orders: members can view" ON public.checklist_orders;
CREATE POLICY "checklist_orders: members can view" ON public.checklist_orders FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "checklist_orders: owner/manager can insert" ON public.checklist_orders;
CREATE POLICY "checklist_orders: owner/manager can insert" ON public.checklist_orders FOR INSERT TO authenticated
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

DROP POLICY IF EXISTS "checklist_orders: owner/manager can update" ON public.checklist_orders;
CREATE POLICY "checklist_orders: owner/manager can update" ON public.checklist_orders FOR UPDATE TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

DROP POLICY IF EXISTS "checklist_orders: owner can delete" ON public.checklist_orders;
CREATE POLICY "checklist_orders: owner can delete" ON public.checklist_orders FOR DELETE TO authenticated
USING (public.is_restaurant_member(restaurant_id, ARRAY['owner']));

-- purchase_items: write é qualquer membro (era o comportamento anterior)
DROP POLICY IF EXISTS "purchase_items_select" ON public.purchase_items;
CREATE POLICY "purchase_items_select" ON public.purchase_items FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "purchase_items_write" ON public.purchase_items;
CREATE POLICY "purchase_items_write" ON public.purchase_items FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id))
WITH CHECK (public.is_restaurant_member(restaurant_id));

-- purchase_lists: write é owner/manager
DROP POLICY IF EXISTS "purchase_lists_select" ON public.purchase_lists;
CREATE POLICY "purchase_lists_select" ON public.purchase_lists FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "purchase_lists_write" ON public.purchase_lists;
CREATE POLICY "purchase_lists_write" ON public.purchase_lists FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

-- roles
DROP POLICY IF EXISTS "roles_select" ON public.roles;
CREATE POLICY "roles_select" ON public.roles FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "roles_write" ON public.roles;
CREATE POLICY "roles_write" ON public.roles FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

-- shifts
DROP POLICY IF EXISTS "shifts_select" ON public.shifts;
CREATE POLICY "shifts_select" ON public.shifts FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "shifts_write" ON public.shifts;
CREATE POLICY "shifts_write" ON public.shifts FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

-- user_areas
DROP POLICY IF EXISTS "user_areas: members can view" ON public.user_areas;
CREATE POLICY "user_areas: members can view" ON public.user_areas FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "user_areas: owner/manager can assign" ON public.user_areas;
CREATE POLICY "user_areas: owner/manager can assign" ON public.user_areas FOR INSERT TO authenticated
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

DROP POLICY IF EXISTS "user_areas: owner/manager can remove" ON public.user_areas;
CREATE POLICY "user_areas: owner/manager can remove" ON public.user_areas FOR DELETE TO authenticated
USING (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

-- user_roles
DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "user_roles_write" ON public.user_roles;
CREATE POLICY "user_roles_write" ON public.user_roles FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

-- user_shifts
DROP POLICY IF EXISTS "user_shifts_select" ON public.user_shifts;
CREATE POLICY "user_shifts_select" ON public.user_shifts FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "user_shifts_write" ON public.user_shifts;
CREATE POLICY "user_shifts_write" ON public.user_shifts FOR ALL TO authenticated
USING      (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']))
WITH CHECK (public.is_restaurant_member(restaurant_id, ARRAY['owner','manager']));

COMMIT;
