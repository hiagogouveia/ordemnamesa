-- Fix: min(uuid) não existe no PostgreSQL — converter para text antes de agregar.
-- Linha problemática no RPC replicate_checklists:
--   min(r.account_id) → min(r.account_id::text)::uuid

CREATE OR REPLACE FUNCTION public.replicate_checklists(
    p_checklist_ids uuid[],
    p_target_restaurant_ids uuid[]
)
RETURNS TABLE (
    target_restaurant_id uuid,
    source_checklist_id  uuid,
    status               text,
    new_checklist_id     uuid,
    error_message        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller     uuid := auth.uid();
    v_account    uuid;
    v_acct_count integer;
    v_all_rids   uuid[];
    v_src_rids   uuid[];
    v_src_rec    record;
    v_tgt        uuid;
    v_target_area uuid;
    v_new_id     uuid;
    v_root       uuid;
    v_existing   uuid;
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

    -- Coletar restaurants de origem (distintos)
    SELECT array_agg(DISTINCT c.restaurant_id)
      INTO v_src_rids
      FROM public.checklists c
     WHERE c.id = ANY(p_checklist_ids);

    IF coalesce(array_length(v_src_rids, 1), 0) = 0 THEN
        RAISE EXCEPTION 'Checklists de origem não encontrados' USING ERRCODE = 'P0002';
    END IF;

    v_all_rids := v_src_rids || p_target_restaurant_ids;

    -- Garantir que todas as unidades pertencem à mesma account.
    -- CORREÇÃO: min(uuid) não existe → cast para text antes de agregar.
    SELECT count(DISTINCT r.account_id), min(r.account_id::text)::uuid
      INTO v_acct_count, v_account
      FROM public.restaurants r
     WHERE r.id = ANY(v_all_rids);

    IF v_acct_count IS NULL OR v_acct_count <> 1 THEN
        RAISE EXCEPTION 'Todas as unidades devem pertencer à mesma account'
            USING ERRCODE = '42501';
    END IF;

    -- Autorização: admin da account OU admin em cada unidade individualmente.
    IF EXISTS (
        SELECT 1 FROM public.account_users au
         WHERE au.account_id = v_account
           AND au.user_id = v_caller
           AND au.role IN ('owner','manager')
           AND au.active
    ) THEN
        -- owner/manager da account → acesso total
        NULL;
    ELSE
        IF EXISTS (
            SELECT 1 FROM unnest(v_all_rids) AS rid
             WHERE NOT EXISTS (
                SELECT 1 FROM public.restaurant_users ru
                 WHERE ru.restaurant_id = rid
                   AND ru.user_id = v_caller
                   AND ru.role IN ('owner','manager')
                   AND ru.active
             )
        ) THEN
            RAISE EXCEPTION 'Acesso negado a uma ou mais unidades'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Loop por target: lock + isolamento via savepoint interno.
    FOREACH v_tgt IN ARRAY p_target_restaurant_ids
    LOOP
        -- Serializa replicações concorrentes para o mesmo target.
        PERFORM pg_advisory_xact_lock(hashtext(v_tgt::text)::bigint);

        FOR v_src_rec IN
            SELECT c.*
              FROM public.checklists c
             WHERE c.id = ANY(p_checklist_ids)
        LOOP
            BEGIN
                -- Auto-replicação (origem == destino) → skip sem erro.
                IF v_src_rec.restaurant_id = v_tgt THEN
                    target_restaurant_id := v_tgt;
                    source_checklist_id  := v_src_rec.id;
                    status               := 'skipped';
                    new_checklist_id     := NULL;
                    error_message        := 'Origem e destino coincidem';
                    RETURN NEXT;
                    CONTINUE;
                END IF;

                -- Raiz canônica.
                v_root := COALESCE(v_src_rec.root_source_checklist_id, v_src_rec.id);

                -- Idempotência: já existe réplica dessa raiz no target?
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

                -- Resolver/criar área equivalente no target por nome (case-insensitive).
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

                -- Inserir checklist (NÃO copia role_id nem assigned_to_user_id).
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

                -- Copiar tasks (NÃO copia role_id nem assigned_to_user_id).
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
$$;

REVOKE EXECUTE ON FUNCTION public.replicate_checklists(uuid[], uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.replicate_checklists(uuid[], uuid[]) TO authenticated;
