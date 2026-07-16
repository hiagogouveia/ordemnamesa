


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."admin_purge_history_for_restaurants"("p_restaurant_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    perform set_config('app.allow_history_mutation', 'on', true);
    delete from task_issues where restaurant_id = any(p_restaurant_ids);
    delete from task_executions where restaurant_id = any(p_restaurant_ids);
    delete from checklist_assumptions where restaurant_id = any(p_restaurant_ids);
end; $$;


ALTER FUNCTION "public"."admin_purge_history_for_restaurants"("p_restaurant_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_kit"("p_restaurant_id" "uuid", "p_user_id" "uuid", "p_kit_id" "uuid", "p_levels" "text"[], "p_extra_template_ids" "uuid"[] DEFAULT '{}'::"uuid"[], "p_fallback_area" "text" DEFAULT 'Geral'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tpl            record;
  v_area_id        uuid;
  v_label          text;
  v_new_id         uuid;
  v_created_ids    uuid[] := '{}';
  v_skipped        uuid[] := '{}';
  v_created_areas  uuid[] := '{}';
BEGIN
  FOR v_tpl IN
    SELECT ct.id, ct.name, ct.description, ct.suggested_type, ct.suggested_recurrence,
           ct.suggested_recurrence_config, ct.suggested_area_label, ct.version
    FROM public.template_kit_items ki
    JOIN public.checklist_templates ct ON ct.id = ki.template_id
    WHERE ki.kit_id = p_kit_id
      AND ct.is_active = true
      AND (ki.requirement_level = ANY(p_levels) OR ki.template_id = ANY(p_extra_template_ids))
    ORDER BY ki.sort_order
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.restaurant_id = p_restaurant_id
        AND c.origin_template_id = v_tpl.id
        AND c.status <> 'archived'
        AND COALESCE(c.is_one_shot, false) = false
    ) THEN
      v_skipped := array_append(v_skipped, v_tpl.id);
      CONTINUE;
    END IF;

    v_label := COALESCE(NULLIF(btrim(v_tpl.suggested_area_label), ''), p_fallback_area);
    SELECT a.id INTO v_area_id
    FROM public.areas a
    WHERE a.restaurant_id = p_restaurant_id
      AND lower(btrim(a.name)) = lower(btrim(v_label))
    LIMIT 1;

    IF v_area_id IS NULL THEN
      INSERT INTO public.areas (restaurant_id, name)
      VALUES (p_restaurant_id, v_label)
      RETURNING id INTO v_area_id;
      v_created_areas := array_append(v_created_areas, v_area_id);
    END IF;

    INSERT INTO public.checklists (
      restaurant_id, name, description, shift, shift_id, status,
      is_required, checklist_type, recurrence, recurrence_config,
      enforce_sequential_order, area_id, target_role, assignment_type,
      active, created_by, origin_template_id, origin_template_version, origin_kit_id
    ) VALUES (
      p_restaurant_id, v_tpl.name, v_tpl.description, 'any', NULL, 'active',
      true, COALESCE(v_tpl.suggested_type, 'regular'),
      COALESCE(v_tpl.suggested_recurrence, 'daily'), v_tpl.suggested_recurrence_config,
      false, v_area_id, 'all', 'area',
      true, p_user_id, v_tpl.id, v_tpl.version, p_kit_id
    ) RETURNING id INTO v_new_id;

    INSERT INTO public.checklist_tasks (
      checklist_id, restaurant_id, title, description, "order",
      requires_photo, is_critical, requires_observation, type, max_photos, task_config
    )
    SELECT v_new_id, p_restaurant_id, i.title, i.description, i."order",
           i.requires_photo, i.is_critical, i.requires_observation, i.type, i.max_photos, i.task_config
    FROM public.checklist_template_items i
    WHERE i.template_id = v_tpl.id;

    v_created_ids := array_append(v_created_ids, v_new_id);
  END LOOP;

  RETURN jsonb_build_object(
    'created_count',         COALESCE(array_length(v_created_ids, 1), 0),
    'created_checklist_ids', to_jsonb(v_created_ids),
    'skipped_count',         COALESCE(array_length(v_skipped, 1), 0),
    'skipped_template_ids',  to_jsonb(v_skipped),
    'created_area_ids',      to_jsonb(v_created_areas)
  );
END $$;


ALTER FUNCTION "public"."apply_kit"("p_restaurant_id" "uuid", "p_user_id" "uuid", "p_kit_id" "uuid", "p_levels" "text"[], "p_extra_template_ids" "uuid"[], "p_fallback_area" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_task_exists"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    if new.task_id is not null
       and not exists (select 1 from public.checklist_tasks t where t.id = new.task_id)
    then
        raise exception 'task_id % não existe em checklist_tasks (integridade na escrita — s89).', new.task_id
            using errcode = '23503';
    end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."assert_task_exists"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expired_evidence_photo_paths"("retention_days" integer) RETURNS SETOF "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'storage', 'public'
    AS $$
    select name
      from storage.objects
     where bucket_id = 'photos'
       and created_at < now() - make_interval(days => retention_days);
$$;


ALTER FUNCTION "public"."expired_evidence_photo_paths"("retention_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_history_assumption"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    if public.history_mutation_allowed() then return coalesce(new, old); end if;
    if old.completed_at is not null then
        raise exception 'IMUTABILIDADE: sessao concluida nao pode ser % (checklist_assumption %).', tg_op, old.id
            using hint = 'set_config(''app.allow_history_mutation'',''on'',true) para manutencao intencional.';
    end if;
    return coalesce(new, old);
end; $$;


ALTER FUNCTION "public"."guard_history_assumption"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_history_task_exec"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    if public.history_mutation_allowed() then return coalesce(new, old); end if;
    if public.history_is_locked(old.checklist_assumption_id, old.checklist_id, old.user_id, old.status) then
        raise exception 'IMUTABILIDADE: historico auditavel nao pode ser % (task_execution %).', tg_op, old.id
            using hint = 'set_config(''app.allow_history_mutation'',''on'',true) para retencao/manutencao intencional.';
    end if;
    return coalesce(new, old);
end; $$;


ALTER FUNCTION "public"."guard_history_task_exec"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_history_task_issue"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    if public.history_mutation_allowed() then return coalesce(new, old); end if;
    if tg_op = 'DELETE' then
        raise exception 'IMUTABILIDADE: ocorrencia (task_issue %) nao pode ser apagada.', old.id
            using hint = 'set_config(''app.allow_history_mutation'',''on'',true) para manutencao intencional.';
    end if;
    if new.description is distinct from old.description
       or new.photos is distinct from old.photos
       or new.task_id is distinct from old.task_id
       or new.checklist_id is distinct from old.checklist_id
       or new.reported_by is distinct from old.reported_by
       or new.created_at is distinct from old.created_at
       or new.task_execution_id is distinct from old.task_execution_id
    then
        raise exception 'IMUTABILIDADE: registro original da ocorrencia (task_issue %) e imutavel.', old.id
            using hint = 'Apenas status/comentario/resolucao podem mudar.';
    end if;
    return new;
end; $$;


ALTER FUNCTION "public"."guard_history_task_issue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."history_is_locked"("p_assumption_id" "uuid", "p_checklist_id" "uuid", "p_user_id" "uuid", "p_status" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    select case
        when p_status = 'doing' then false
        when p_assumption_id is not null then exists (
            select 1 from public.checklist_assumptions a
             where a.id = p_assumption_id and a.completed_at is not null)
        else not exists (
            select 1 from public.checklist_assumptions a
             where a.checklist_id = p_checklist_id and a.user_id = p_user_id and a.completed_at is null)
    end;
$$;


ALTER FUNCTION "public"."history_is_locked"("p_assumption_id" "uuid", "p_checklist_id" "uuid", "p_user_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."history_mutation_allowed"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
    select coalesce(current_setting('app.allow_history_mutation', true), '') = 'on';
$$;


ALTER FUNCTION "public"."history_mutation_allowed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."instantiate_receiving_execution"("p_restaurant_id" "uuid", "p_template_id" "uuid", "p_supplier_id" "uuid", "p_user_id" "uuid", "p_user_name" "text", "p_idempotency_key" "uuid") RETURNS TABLE("checklist_id" "uuid", "assumption_id" "uuid", "was_duplicate" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_existing_checklist  uuid;
  v_existing_assumption uuid;
  v_new_checklist       uuid;
  v_new_assumption      uuid;
  v_template            public.receiving_templates%ROWTYPE;
  v_template_shift_ids  uuid[];
  v_shift_id_shadow     uuid;
  v_shift_enum          text;
  v_user_shift_ids      uuid[];
  v_today               text := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD');
BEGIN
  SELECT c.id INTO v_existing_checklist
  FROM public.checklists c
  WHERE c.idempotency_key = p_idempotency_key
    AND c.restaurant_id = p_restaurant_id;

  IF v_existing_checklist IS NOT NULL THEN
    SELECT a.id INTO v_existing_assumption
    FROM public.checklist_assumptions a
    WHERE a.checklist_id = v_existing_checklist
    LIMIT 1;

    RETURN QUERY SELECT v_existing_checklist, v_existing_assumption, true;
    RETURN;
  END IF;

  SELECT * INTO v_template
  FROM public.receiving_templates
  WHERE id = p_template_id
    AND restaurant_id = p_restaurant_id
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_AVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  v_template_shift_ids := ARRAY(
    SELECT rts.shift_id FROM public.receiving_template_shifts rts
     WHERE rts.template_id = p_template_id
     ORDER BY rts.shift_id);

  v_shift_id_shadow := CASE WHEN cardinality(v_template_shift_ids) = 1
                            THEN v_template_shift_ids[1] ELSE NULL END;
  v_shift_enum := COALESCE(
    (SELECT CASE WHEN s.shift_type IN ('morning','afternoon','evening')
                 THEN s.shift_type ELSE 'any' END
       FROM public.shifts s
      WHERE s.id = v_shift_id_shadow),
    'any');

  v_user_shift_ids := ARRAY(
    SELECT us.shift_id FROM public.user_shifts us
     WHERE us.restaurant_id = p_restaurant_id
       AND us.user_id = p_user_id);

  INSERT INTO public.checklists (
    restaurant_id, name, description,
    shift, shift_id, recurrence, status, active, created_by, created_at,
    checklist_type, is_one_shot,
    area_id, role_id, assigned_to_user_id,
    enforce_sequential_order,
    source_template_id, supplier_id,
    idempotency_key
  )
  VALUES (
    p_restaurant_id, v_template.name, v_template.description,
    v_shift_enum, v_shift_id_shadow, NULL, 'active', true, p_user_id, now(),
    'receiving', true,
    v_template.area_id, v_template.role_id, v_template.assigned_to_user_id,
    v_template.enforce_sequential_order,
    v_template.id, p_supplier_id,
    p_idempotency_key
  )
  RETURNING id INTO v_new_checklist;

  INSERT INTO public.checklist_shifts (restaurant_id, checklist_id, shift_id)
  SELECT p_restaurant_id, v_new_checklist, sid
    FROM unnest(v_template_shift_ids) AS sid
  ON CONFLICT (checklist_id, shift_id) DO NOTHING;

  INSERT INTO public.checklist_tasks (
    checklist_id, restaurant_id, title, description, "order",
    requires_photo, is_critical, requires_observation,
    type, max_photos, task_config
  )
  SELECT
    v_new_checklist, p_restaurant_id, tt.title, tt.description, tt."order",
    tt.requires_photo, tt.is_critical, tt.requires_observation,
    tt.type, tt.max_photos, tt.task_config
  FROM public.receiving_template_tasks tt
  WHERE tt.template_id = p_template_id
  ORDER BY tt."order";

  INSERT INTO public.checklist_assumptions (
    restaurant_id, checklist_id, user_id, user_name,
    date_key, assumed_at, execution_status,
    assumption_shift_id, assumption_shift_ids, assumption_user_shift_ids
  )
  VALUES (
    p_restaurant_id, v_new_checklist, p_user_id, p_user_name,
    v_today, now(), 'in_progress',
    v_shift_id_shadow, v_template_shift_ids, v_user_shift_ids
  )
  RETURNING id INTO v_new_assumption;

  RETURN QUERY SELECT v_new_checklist, v_new_assumption, false;
END;
$$;


ALTER FUNCTION "public"."instantiate_receiving_execution"("p_restaurant_id" "uuid", "p_template_id" "uuid", "p_supplier_id" "uuid", "p_user_id" "uuid", "p_user_name" "text", "p_idempotency_key" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."instantiate_receiving_execution"("p_restaurant_id" "uuid", "p_template_id" "uuid", "p_supplier_id" "uuid", "p_user_id" "uuid", "p_user_name" "text", "p_idempotency_key" "uuid") IS 'Cria execução one-shot a partir de um receiving_template. Sprint 69: copia turnos N:N (receiving_template_shifts → checklist_shifts) e grava auditoria assumption_shift_ids. Sprint 74: corrige ambiguidade de checklist_id no ON CONFLICT via #variable_conflict use_column. recurrence=NULL (não recorrente). Idempotente.';



CREATE OR REPLACE FUNCTION "public"."is_restaurant_member"("rid" "uuid", "required_roles" "text"[] DEFAULT NULL::"text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_users ru
    WHERE ru.restaurant_id = rid
      AND ru.user_id = auth.uid()
      AND ru.active = true
      AND (required_roles IS NULL OR ru.role = ANY(required_roles))
  );
$$;


ALTER FUNCTION "public"."is_restaurant_member"("rid" "uuid", "required_roles" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_restaurant_member"("rid" "uuid", "required_roles" "text"[]) IS 'Padrao oficial de RLS multi-tenant. Retorna true se auth.uid() e membro ativo do restaurante rid com algum dos roles em required_roles (NULL = qualquer role).';



CREATE OR REPLACE FUNCTION "public"."purge_evidence_photo_refs"("p_paths" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_photo_url_cleared int := 0; v_exec_photos_updated int := 0; v_issues_updated int := 0;
begin
    perform set_config('app.allow_history_mutation', 'on', true);
    if p_paths is null or array_length(p_paths, 1) is null then
        return jsonb_build_object('photo_url_cleared', 0, 'exec_photos_updated', 0, 'issues_updated', 0);
    end if;
    update task_executions set photo_url = null, requires_photo_snapshot = false where photo_url = any(p_paths);
    get diagnostics v_photo_url_cleared = row_count;
    update task_executions te set photos = coalesce((
                select jsonb_agg(elem) from jsonb_array_elements_text(te.photos) elem where elem <> all(p_paths)
            ), '[]'::jsonb)
     where te.photos is not null and jsonb_typeof(te.photos) = 'array'
       and exists (select 1 from jsonb_array_elements_text(te.photos) e where e = any(p_paths));
    get diagnostics v_exec_photos_updated = row_count;
    update task_issues ti set photos = (
                select coalesce(array_agg(elem), '{}') from unnest(ti.photos) elem where elem <> all(p_paths)
            )
     where ti.photos is not null and ti.photos && p_paths;
    get diagnostics v_issues_updated = row_count;
    return jsonb_build_object('photo_url_cleared', v_photo_url_cleared, 'exec_photos_updated', v_exec_photos_updated, 'issues_updated', v_issues_updated);
end; $$;


ALTER FUNCTION "public"."purge_evidence_photo_refs"("p_paths" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_expired_history"("retention_days" integer DEFAULT 60, "dry_run" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_cutoff timestamptz := now() - make_interval(days => retention_days);
    v_issues int := 0; v_execs int := 0; v_assumptions int := 0;
    v_photo_paths text[] := '{}';
begin
    if dry_run then
        return jsonb_build_object(
            'dry_run', true, 'retention_days', retention_days, 'cutoff', v_cutoff,
            'issues', (select count(*) from task_issues where created_at < v_cutoff),
            'executions', (select count(*) from task_executions where executed_at < v_cutoff),
            'assumptions', (select count(*) from checklist_assumptions a
                             where coalesce(a.completed_at, a.assumed_at) < v_cutoff
                               and not exists (select 1 from task_executions te
                                                where te.checklist_assumption_id = a.id
                                                  and te.executed_at >= v_cutoff))
        );
    end if;

    perform set_config('app.allow_history_mutation', 'on', true);

    select coalesce(array_agg(distinct p), '{}') into v_photo_paths
    from (
        select photo_url as p from task_executions where executed_at < v_cutoff and photo_url is not null
        union all
        select jsonb_array_elements_text(photos) as p from task_executions
         where executed_at < v_cutoff and photos is not null and jsonb_typeof(photos) = 'array'
        union all
        select unnest(photos) as p from task_issues where created_at < v_cutoff and photos is not null
    ) s
    where p is not null and p <> '';

    delete from task_issues where created_at < v_cutoff;
    get diagnostics v_issues = row_count;
    delete from task_executions where executed_at < v_cutoff;
    get diagnostics v_execs = row_count;
    delete from checklist_assumptions a
     where coalesce(a.completed_at, a.assumed_at) < v_cutoff
       and not exists (select 1 from task_executions te where te.checklist_assumption_id = a.id);
    get diagnostics v_assumptions = row_count;

    return jsonb_build_object(
        'dry_run', false, 'retention_days', retention_days, 'cutoff', v_cutoff,
        'issues_deleted', v_issues, 'executions_deleted', v_execs,
        'assumptions_deleted', v_assumptions, 'photo_paths', to_jsonb(v_photo_paths)
    );
end;
$$;


ALTER FUNCTION "public"."purge_expired_history"("retention_days" integer, "dry_run" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_receiving_template_tasks"("p_template_id" "uuid", "p_restaurant_id" "uuid", "p_tasks" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_template_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.receiving_templates
     WHERE id = p_template_id AND restaurant_id = p_restaurant_id
  ) INTO v_template_exists;

  IF NOT v_template_exists THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.receiving_template_tasks WHERE template_id = p_template_id;

  INSERT INTO public.receiving_template_tasks (
    template_id, restaurant_id, title, description, "order",
    requires_photo, is_critical, requires_observation,
    type, max_photos, task_config
  )
  SELECT
    p_template_id,
    p_restaurant_id,
    (t->>'title')::text,
    NULLIF(t->>'description', '')::text,
    COALESCE((t->>'order')::int, 0),
    COALESCE((t->>'requires_photo')::boolean, false),
    COALESCE((t->>'is_critical')::boolean, false),
    COALESCE((t->>'requires_observation')::boolean, false),
    NULLIF(t->>'type', '')::text,
    NULLIF(t->>'max_photos', '')::int,
    CASE WHEN t->'task_config' IS NULL OR t->'task_config' = 'null'::jsonb
         THEN NULL ELSE t->'task_config' END
  FROM jsonb_array_elements(p_tasks) AS t;
END;
$$;


ALTER FUNCTION "public"."replace_receiving_template_tasks"("p_template_id" "uuid", "p_restaurant_id" "uuid", "p_tasks" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."replace_receiving_template_tasks"("p_template_id" "uuid", "p_restaurant_id" "uuid", "p_tasks" "jsonb") IS 'Substitui em bloco as tasks de um receiving_template (DELETE + INSERT atômico). Não toca execuções já criadas.';



CREATE OR REPLACE FUNCTION "public"."replicate_checklists"("p_checklist_ids" "uuid"[], "p_target_restaurant_ids" "uuid"[]) RETURNS TABLE("target_restaurant_id" "uuid", "source_checklist_id" "uuid", "status" "text", "new_checklist_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
        RAISE EXCEPTION 'Nao autenticado' USING ERRCODE = '42501';
    END IF;

    IF p_checklist_ids IS NULL OR array_length(p_checklist_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'checklist_ids vazio' USING ERRCODE = '22023';
    END IF;
    IF p_target_restaurant_ids IS NULL OR array_length(p_target_restaurant_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'target_restaurant_ids vazio' USING ERRCODE = '22023';
    END IF;

    SELECT array_agg(DISTINCT c.restaurant_id)
      INTO v_src_rids
      FROM public.checklists c
     WHERE c.id = ANY(p_checklist_ids);

    IF coalesce(array_length(v_src_rids, 1), 0) = 0 THEN
        RAISE EXCEPTION 'Checklists de origem nao encontrados' USING ERRCODE = 'P0002';
    END IF;

    v_all_rids := v_src_rids || p_target_restaurant_ids;

    SELECT count(DISTINCT r.account_id), min(r.account_id::text)::uuid
      INTO v_acct_count, v_account
      FROM public.restaurants r
     WHERE r.id = ANY(v_all_rids);

    IF v_acct_count IS NULL OR v_acct_count <> 1 THEN
        RAISE EXCEPTION 'Todas as unidades devem pertencer a mesma account'
            USING ERRCODE = '42501';
    END IF;

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
            SELECT c.* FROM public.checklists c WHERE c.id = ANY(p_checklist_ids)
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
$$;


ALTER FUNCTION "public"."replicate_checklists"("p_checklist_ids" "uuid"[], "p_target_restaurant_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_task_issue_tx"("p_issue_id" "uuid", "p_restaurant_id" "uuid", "p_task_id" "uuid", "p_checklist_id" "uuid", "p_checklist_assumption_id" "uuid", "p_task_execution_id" "uuid", "p_reported_by" "uuid", "p_description" "text", "p_photos" "text"[], "p_severity" "text", "p_actor_user_id" "uuid", "p_event_type" "text", "p_dedup_key" "text", "p_payload" "jsonb", "p_payload_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_issue task_issues;
    v_event domain_events;
begin
    insert into task_issues (
        id, restaurant_id, task_id, checklist_id, checklist_assumption_id,
        task_execution_id, reported_by, description, photos, status, severity
    ) values (
        p_issue_id, p_restaurant_id, p_task_id, p_checklist_id, p_checklist_assumption_id,
        p_task_execution_id, p_reported_by, p_description, coalesce(p_photos, '{}'::text[]),
        'open', p_severity
    )
    returning * into v_issue;

    insert into task_issue_events (
        task_issue_id, restaurant_id, event_type, to_status, actor_user_id, metadata
    ) values (
        p_issue_id, p_restaurant_id, 'created', 'open', p_actor_user_id,
        jsonb_build_object('source', 'api')
    );

    insert into domain_events (
        restaurant_id, event_type, dedup_key, payload, payload_version, actor_user_id
    ) values (
        p_restaurant_id, p_event_type, p_dedup_key, p_payload, p_payload_version, p_actor_user_id
    )
    on conflict (event_type, dedup_key) do nothing
    returning * into v_event;

    return jsonb_build_object(
        'issue', to_jsonb(v_issue),
        'domain_event', to_jsonb(v_event)
    );
end;
$$;


ALTER FUNCTION "public"."report_task_issue_tx"("p_issue_id" "uuid", "p_restaurant_id" "uuid", "p_task_id" "uuid", "p_checklist_id" "uuid", "p_checklist_assumption_id" "uuid", "p_task_execution_id" "uuid", "p_reported_by" "uuid", "p_description" "text", "p_photos" "text"[], "p_severity" "text", "p_actor_user_id" "uuid", "p_event_type" "text", "p_dedup_key" "text", "p_payload" "jsonb", "p_payload_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_notification_outbox_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_admin_notification_outbox_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_notification_recipients_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_admin_notification_recipients_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_job_state_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_job_state_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_leads_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_leads_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."signup_create_restaurant"("p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_rest_name" "text", "p_rest_slug" "text", "p_cnpj" "text", "p_phone" "text", "p_cep" "text", "p_address" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_restaurant_id uuid;
    v_role_admin_id uuid;
    v_role_mgmt_id  uuid;
BEGIN
    -- Garantir row em public.users
    INSERT INTO public.users (id, email, name)
    VALUES (p_user_id, p_email, p_name)
    ON CONFLICT (id) DO NOTHING;

    -- Criar restaurante
    INSERT INTO public.restaurants (name, slug, owner_id, cnpj, phone, cep, address)
    VALUES (p_rest_name, p_rest_slug, p_user_id, p_cnpj, p_phone, p_cep, p_address)
    RETURNING id INTO v_restaurant_id;

    -- Criar vínculo owner em restaurant_users
    INSERT INTO public.restaurant_users (restaurant_id, user_id, role, active)
    VALUES (v_restaurant_id, p_user_id, 'owner', true);

    -- Criar função padrão: Administração (para owner lançar atividades)
    INSERT INTO public.roles (restaurant_id, name, color, max_concurrent_tasks, active)
    VALUES (v_restaurant_id, 'Administração', '#13b6ec', 10, true)
    RETURNING id INTO v_role_admin_id;

    -- Criar função padrão: Gerência (para manager lançar atividades)
    INSERT INTO public.roles (restaurant_id, name, color, max_concurrent_tasks, active)
    VALUES (v_restaurant_id, 'Gerência', '#a855f7', 10, true)
    RETURNING id INTO v_role_mgmt_id;

    -- Auto-associar owner à função Administração (via mesmo sistema do staff)
    INSERT INTO public.user_roles (restaurant_id, user_id, role_id)
    VALUES (v_restaurant_id, p_user_id, v_role_admin_id);

    RETURN v_restaurant_id;
END;
$$;


ALTER FUNCTION "public"."signup_create_restaurant"("p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_rest_name" "text", "p_rest_slug" "text", "p_cnpj" "text", "p_phone" "text", "p_cep" "text", "p_address" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_checklist_templates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."tg_checklist_templates_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_receiving_templates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


ALTER FUNCTION "public"."tg_receiving_templates_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_template_kits_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."tg_template_kits_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_task_issues_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."touch_task_issues_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."undo_kit_application"("p_restaurant_id" "uuid", "p_checklist_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_deletable     uuid[];
  v_deleted_count int := 0;
  v_requested     int := COALESCE(array_length(p_checklist_ids, 1), 0);
BEGIN
  SELECT array_agg(c.id) INTO v_deletable
  FROM public.checklists c
  WHERE c.id = ANY(p_checklist_ids)
    AND c.restaurant_id = p_restaurant_id
    AND c.origin_kit_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.checklist_assumptions a WHERE a.checklist_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.task_executions te     WHERE te.checklist_id = c.id);

  IF v_deletable IS NULL THEN
    RETURN jsonb_build_object('deleted_count', 0, 'protected_count', v_requested, 'deleted_ids', '[]'::jsonb);
  END IF;

  DELETE FROM public.checklists WHERE id = ANY(v_deletable);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_count',   v_deleted_count,
    'protected_count', v_requested - v_deleted_count,
    'deleted_ids',     to_jsonb(v_deletable)
  );
END $$;


ALTER FUNCTION "public"."undo_kit_application"("p_restaurant_id" "uuid", "p_checklist_ids" "uuid"[]) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."account_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "can_view_global" boolean DEFAULT false NOT NULL,
    CONSTRAINT "account_users_owner_must_view_global" CHECK ((("role" <> 'owner'::"text") OR ("can_view_global" = true))),
    CONSTRAINT "account_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'manager'::"text"])))
);


ALTER TABLE "public"."account_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "plan_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "internal_notes" "text",
    "suspended_at" timestamp with time zone,
    "suspended_reason" "text"
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."accounts"."plan_id" IS 'DEPRECATED: use subscriptions.plan_id como fonte de verdade. Mantido apenas para compatibilidade histórica.';



COMMENT ON COLUMN "public"."accounts"."metadata" IS 'Escopo restrito: vip (boolean), tags (array de strings curtas). Não usar para cache, blobs grandes ou dados relacionais.';



COMMENT ON COLUMN "public"."accounts"."internal_notes" IS 'Anotações internas do time de suporte/comercial. Não exibido no app dos clientes.';



CREATE TABLE IF NOT EXISTS "public"."admin_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text",
    "target_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_notification_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "dedup_key" "text" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_error" "text",
    "provider_message_id" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_notification_outbox_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."admin_notification_outbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_notification_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "label" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_notification_recipients_email_check" CHECK (("email" ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::"text"))
);


ALTER TABLE "public"."admin_notification_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_notification_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_notification_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#13b6ec'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "migrated_from_role" boolean DEFAULT false,
    "priority_mode" "text" DEFAULT 'auto'::"text" NOT NULL,
    "max_parallel_tasks" integer,
    CONSTRAINT "areas_max_parallel_tasks_check" CHECK ((("max_parallel_tasks" IS NULL) OR ("max_parallel_tasks" >= 1))),
    CONSTRAINT "areas_priority_mode_check" CHECK (("priority_mode" = ANY (ARRAY['auto'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checklist_assumptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "checklist_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_name" "text" NOT NULL,
    "date_key" "text" NOT NULL,
    "assumed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "completed_by_user_id" "uuid",
    "completed_by_user_name" "text",
    "observation" "text",
    "execution_status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "blocked_reason" "text",
    "assumption_shift_id" "uuid",
    "assumption_user_shift_ids" "uuid"[],
    "assumption_shift_ids" "uuid"[],
    "tasks_snapshot" "jsonb",
    CONSTRAINT "checklist_assumptions_execution_status_check" CHECK (("execution_status" = ANY (ARRAY['in_progress'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."checklist_assumptions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."checklist_assumptions"."assumption_shift_id" IS 'Snapshot: shift_id da rotina no momento em que foi assumida (NULL = rotina global ou row legada).';



COMMENT ON COLUMN "public"."checklist_assumptions"."assumption_user_shift_ids" IS 'Snapshot: turnos (shifts.id) do colaborador no momento da assunção. Array puro, sem FK (histórico imutável).';



COMMENT ON COLUMN "public"."checklist_assumptions"."assumption_shift_ids" IS 'Snapshot: turnos (shifts.id) da rotina no momento da assuncao. Array vazio/NULL = Todos os turnos. Substitui assumption_shift_id (single, deprecado) no modelo N:N.';



COMMENT ON COLUMN "public"."checklist_assumptions"."tasks_snapshot" IS 'Composição da rotina no momento do assume (s88). Congelado: escrito uma única vez, na criação da assumption. Fonte da lista de tarefas da Auditoria/PDF. Linhas anteriores à s88 foram backfilled com a composição atual do checklist e NÃO representam fidelidade histórica.';



CREATE TABLE IF NOT EXISTS "public"."checklist_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "checklist_id" "uuid" NOT NULL,
    "shift" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "checklist_orders_shift_check" CHECK (("shift" = ANY (ARRAY['morning'::"text", 'afternoon'::"text", 'evening'::"text"])))
);


ALTER TABLE "public"."checklist_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checklist_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "checklist_id" "uuid" NOT NULL,
    "shift_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."checklist_shifts" OWNER TO "postgres";


COMMENT ON TABLE "public"."checklist_shifts" IS 'N:N rotina-turno (s66). Conjunto vazio = Todos os turnos. Fonte da verdade; checklists.shift_id mantido temporariamente para compat.';



CREATE TABLE IF NOT EXISTS "public"."checklist_tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "checklist_id" "uuid" NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "requires_photo" boolean DEFAULT false,
    "is_critical" boolean DEFAULT false,
    "order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "assigned_to_user_id" "uuid",
    "role_id" "uuid",
    "checklist_type" "text" DEFAULT 'regular'::"text",
    "area_id" "uuid",
    "type" "text",
    "requires_observation" boolean DEFAULT false NOT NULL,
    "max_photos" integer,
    "task_config" "jsonb",
    CONSTRAINT "checklist_tasks_checklist_type_check" CHECK (("checklist_type" = ANY (ARRAY['regular'::"text", 'opening'::"text", 'closing'::"text", 'receiving'::"text"]))),
    CONSTRAINT "checklist_tasks_max_photos_check" CHECK ((("max_photos" IS NULL) OR ("max_photos" >= 1))),
    CONSTRAINT "checklist_tasks_type_check" CHECK ((("type" IS NULL) OR ("type" = ANY (ARRAY['boolean'::"text", 'date'::"text", 'number'::"text", 'rating'::"text"]))))
);


ALTER TABLE "public"."checklist_tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."checklist_tasks"."type" IS 'Tipo de resposta da task. Valores: boolean (default), date, number, rating. NULL é tratado como boolean pela aplicação (compatibilidade com tasks antigas).';



COMMENT ON COLUMN "public"."checklist_tasks"."requires_observation" IS 'Quando true, exige campo de observação preenchido na execução para concluir.';



COMMENT ON COLUMN "public"."checklist_tasks"."max_photos" IS 'Quando requires_photo=true: limite máximo de fotos permitidas. NULL = sem limite. Mínimo é sempre 1 quando requires_photo=true.';



COMMENT ON COLUMN "public"."checklist_tasks"."task_config" IS 'Configurações específicas do tipo. Para number: { min_value?: number, max_value?: number }.';



CREATE TABLE IF NOT EXISTS "public"."checklist_template_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "item_slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "order" integer DEFAULT 0 NOT NULL,
    "requires_photo" boolean DEFAULT false NOT NULL,
    "is_critical" boolean DEFAULT false NOT NULL,
    "requires_observation" boolean DEFAULT false NOT NULL,
    "type" "text",
    "max_photos" integer,
    "task_config" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "checklist_template_items_type_check" CHECK ((("type" IS NULL) OR ("type" = ANY (ARRAY['boolean'::"text", 'date'::"text", 'number'::"text", 'rating'::"text"]))))
);


ALTER TABLE "public"."checklist_template_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."checklist_template_items" IS 'Itens de um modelo de rotina. Clonados para checklist_tasks na importação. item_slug garante seed idempotente.';



CREATE TABLE IF NOT EXISTS "public"."checklist_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text" NOT NULL,
    "icon" "text",
    "suggested_type" "text" DEFAULT 'regular'::"text" NOT NULL,
    "suggested_area_label" "text",
    "suggested_recurrence" "text",
    "suggested_recurrence_config" "jsonb",
    "is_premium" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "checklist_templates_category_check" CHECK (("category" = ANY (ARRAY['caixa'::"text", 'cozinha'::"text", 'salao'::"text", 'estoque'::"text", 'limpeza'::"text", 'banheiros'::"text", 'seguranca_alimentar'::"text", 'equipamentos'::"text", 'manutencao'::"text", 'delivery'::"text", 'administrativo'::"text"]))),
    CONSTRAINT "checklist_templates_suggested_type_check" CHECK (("suggested_type" = ANY (ARRAY['regular'::"text", 'opening'::"text", 'closing'::"text"])))
);


ALTER TABLE "public"."checklist_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."checklist_templates" IS 'Catálogo global de rotinas prontas. Importação clona o conteúdo para checklists do tenant. Nunca vira atividade direta.';



COMMENT ON COLUMN "public"."checklist_templates"."version" IS 'Rastreabilidade apenas — não dispara upgrade/sync de rotinas já importadas.';



CREATE TABLE IF NOT EXISTS "public"."checklists" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "shift" "text" NOT NULL,
    "active" boolean DEFAULT false,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "status" "text" DEFAULT 'active'::"text",
    "category" "text",
    "role_id" "uuid",
    "is_required" boolean DEFAULT true,
    "checklist_type" "text" DEFAULT 'regular'::"text",
    "recurrence" "text" DEFAULT 'daily'::"text",
    "last_reset_at" timestamp with time zone,
    "assigned_to_user_id" "uuid",
    "start_time" "text",
    "end_time" "text",
    "recurrence_config" "jsonb",
    "enforce_sequential_order" boolean DEFAULT false NOT NULL,
    "order_index" integer,
    "area_id" "uuid" NOT NULL,
    "target_role" "text" DEFAULT 'all'::"text" NOT NULL,
    "assignment_type" "text" DEFAULT 'all'::"text" NOT NULL,
    "source_checklist_id" "uuid",
    "root_source_checklist_id" "uuid",
    "is_one_shot" boolean DEFAULT false NOT NULL,
    "source_template_id" "uuid",
    "supplier_id" "uuid",
    "idempotency_key" "uuid",
    "shift_id" "uuid",
    "origin_template_id" "uuid",
    "origin_template_version" integer,
    "origin_kit_id" "uuid",
    "allow_early_start" boolean DEFAULT false NOT NULL,
    CONSTRAINT "checklists_assignment_type_check" CHECK (("assignment_type" = ANY (ARRAY['area'::"text", 'user'::"text", 'all'::"text"]))),
    CONSTRAINT "checklists_recurrence_check" CHECK (("recurrence" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text", 'yearly'::"text", 'weekdays'::"text", 'custom'::"text", 'shift_days'::"text"]))),
    CONSTRAINT "checklists_shift_check" CHECK (("shift" = ANY (ARRAY['morning'::"text", 'afternoon'::"text", 'evening'::"text", 'any'::"text"]))),
    CONSTRAINT "checklists_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"]))),
    CONSTRAINT "checklists_target_role_check" CHECK (("target_role" = ANY (ARRAY['staff'::"text", 'manager'::"text", 'owner'::"text", 'all'::"text"])))
);


ALTER TABLE "public"."checklists" OWNER TO "postgres";


COMMENT ON COLUMN "public"."checklists"."recurrence" IS 'Classificação macro da recorrência (text). Em payloads v2, é sincronizada
automaticamente pelo backend a partir de recurrence_config.type. Em v1,
é a fonte primária da regra de recorrência. Valores possíveis fixados via
CHECK constraint: daily, weekly, monthly, yearly, weekdays, custom, shift_days.';



COMMENT ON COLUMN "public"."checklists"."recurrence_config" IS 'Configuração de recorrência. Aceita dois formatos:
 - v1 (legado, Sprint 8): { frequency, interval, days_of_week?, end_type, end_date?, end_count? }
 - v2 (Sprint 34): discriminated union { version: 2, type: ''daily''|''weekly''|''shift_days''|''monthly''|''yearly''|''custom'', ... }
Detecção é feita no backend via `version === 2` estrito. Veja lib/utils/recurrence/.';



COMMENT ON COLUMN "public"."checklists"."is_one_shot" IS 'Se true, este checklist é uma instância descartável (criada ad-hoc, executada uma vez e auto-arquivada). Não aparece em listagens de templates/rotinas por padrão. Histórico preservado via checklist_assumptions.';



COMMENT ON COLUMN "public"."checklists"."source_template_id" IS 'Quando preenchido, este checklist é uma execução one-shot instanciada do modelo de recebimento indicado.';



COMMENT ON COLUMN "public"."checklists"."supplier_id" IS 'Fornecedor selecionado pelo colaborador no momento da instanciação. Aplicável apenas a execuções de recebimento.';



COMMENT ON COLUMN "public"."checklists"."idempotency_key" IS 'UUID gerado pelo cliente para deduplicar criação de execuções one-shot (clique duplo, retry, refresh). NULL em rows legadas. Se evoluir para múltiplos endpoints, migrar para tabela dedicada idempotency_keys.';



COMMENT ON COLUMN "public"."checklists"."shift_id" IS 'Turno (shifts.id) ao qual a rotina pertence. NULL = todos os turnos (visível a todos). Fonte da verdade para visibilidade por turno e para os dias da recorrência shift_days. A coluna enum `shift` permanece como sombra derivada para consumidores legados.';



COMMENT ON COLUMN "public"."checklists"."origin_template_id" IS 'Modelo de origem quando a rotina foi importada do catálogo. Somente rastreabilidade — não sincroniza.';



COMMENT ON COLUMN "public"."checklists"."origin_template_version" IS 'Snapshot da versão do modelo no momento da importação. Somente auditoria.';



COMMENT ON COLUMN "public"."checklists"."allow_early_start" IS 'Se true, permite iniciar a rotina antes do start_time (janela de horário). Default false mantém o bloqueio padrão.';



CREATE TABLE IF NOT EXISTS "public"."data_export_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "resource_type" "text" NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'dispatched'::"text" NOT NULL,
    "item_count" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "data_export_events_status_check" CHECK (("status" = ANY (ARRAY['dispatched'::"text", 'completed'::"text", 'cancelled'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."data_export_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."domain_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "dedup_key" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payload_version" integer DEFAULT 1 NOT NULL,
    "actor_user_id" "uuid",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "domain_events_dedup_key_check" CHECK ((("char_length"("dedup_key") >= 1) AND ("char_length"("dedup_key") <= 200))),
    CONSTRAINT "domain_events_event_type_check" CHECK ((("char_length"("event_type") >= 1) AND ("char_length"("event_type") <= 64))),
    CONSTRAINT "domain_events_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."domain_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid",
    "restaurant_id" "uuid",
    "user_id" "uuid",
    "event_name" "text" NOT NULL,
    "event_category" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_logs" IS 'Telemetria interna do produto. Inserts via service role apenas. Não armazenar PII (senha, token, payload sensível).';



CREATE TABLE IF NOT EXISTS "public"."job_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_name" "text" NOT NULL,
    "worker_id" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "items_processed" integer,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "job_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'success'::"text", 'failed'::"text", 'timeout'::"text", 'interrupted'::"text"])))
);


ALTER TABLE "public"."job_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_state" (
    "job_name" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "last_run_at" timestamp with time zone,
    "last_success_at" timestamp with time zone,
    "locked_by" "text",
    "locked_until" timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone NOT NULL,
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."job_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "organization_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "city" "text",
    "state" "text",
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "approved_entity_id" "uuid",
    "approved_user_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "setup_email_sent_at" timestamp with time zone,
    "setup_email_last_error" "text",
    CONSTRAINT "leads_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


COMMENT ON COLUMN "public"."leads"."setup_email_sent_at" IS 'Timestamp do último envio bem-sucedido do e-mail de setup (definir senha) após aprovação. NULL = nunca enviado com sucesso.';



COMMENT ON COLUMN "public"."leads"."setup_email_last_error" IS 'Razão do último erro ao tentar enviar o e-mail de setup (NULL quando o último envio foi bem-sucedido).';



CREATE TABLE IF NOT EXISTS "public"."migration_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    "action" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."migration_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "restaurant_id" "uuid",
    "channel_type" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_channels_channel_type_check" CHECK (("channel_type" = ANY (ARRAY['telegram'::"text", 'whatsapp'::"text", 'email'::"text"])))
);


ALTER TABLE "public"."notification_channels" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_channels" IS 'Canais externos de notificação por usuário (telegram|whatsapp|email). restaurant_id NULL = global. external_id = chat id / phone / email.';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "related_id" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payload_version" integer DEFAULT 1 NOT NULL,
    "event_id" "uuid",
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "group_key" "text",
    "read_at" timestamp with time zone,
    "priority_rank" smallint GENERATED ALWAYS AS (
CASE "priority"
    WHEN 'critical'::"text" THEN 0
    WHEN 'high'::"text" THEN 1
    WHEN 'normal'::"text" THEN 2
    ELSE 3
END) STORED,
    CONSTRAINT "notifications_priority_check" CHECK (("priority" = ANY (ARRAY['critical'::"text", 'high'::"text", 'normal'::"text", 'low'::"text"]))),
    CONSTRAINT "notifications_type_nonempty" CHECK ((("char_length"("type") >= 1) AND ("char_length"("type") <= 64)))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid",
    "restaurant_id" "uuid",
    "alert_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "text",
    "resolution_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operational_alerts_alert_type_check" CHECK (("alert_type" = ANY (ARRAY['trial_expiring'::"text", 'inactive_restaurant'::"text", 'onboarding_incomplete'::"text", 'health_risk'::"text"]))),
    CONSTRAINT "operational_alerts_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'risk'::"text"])))
);


ALTER TABLE "public"."operational_alerts" OWNER TO "postgres";


COMMENT ON TABLE "public"."operational_alerts" IS 'Alertas operacionais gerados por regras automatizadas. resolved_by = "system" para auto-resolução, email do admin para resolução manual.';



CREATE TABLE IF NOT EXISTS "public"."ordemnamesa_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text" NOT NULL,
    CONSTRAINT "ordemnamesa_staff_role_check" CHECK (("role" = ANY (ARRAY['SUPER_ADMIN'::"text", 'SUPPORT_AGENT'::"text"])))
);


ALTER TABLE "public"."ordemnamesa_staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "max_units" integer NOT NULL,
    "max_managers" integer NOT NULL,
    "max_staff_per_unit" integer NOT NULL,
    "price_monthly_cents" integer NOT NULL,
    "price_yearly_cents" integer NOT NULL,
    "stripe_price_id_monthly" "text",
    "stripe_price_id_yearly" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plans_code_check" CHECK (("code" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text", 'D'::"text"]))),
    CONSTRAINT "plans_max_managers_check" CHECK (("max_managers" >= 0)),
    CONSTRAINT "plans_max_staff_per_unit_check" CHECK (("max_staff_per_unit" >= 0)),
    CONSTRAINT "plans_max_units_check" CHECK (("max_units" > 0)),
    CONSTRAINT "plans_price_monthly_cents_check" CHECK (("price_monthly_cents" >= 0)),
    CONSTRAINT "plans_price_yearly_cents_check" CHECK (("price_yearly_cents" >= 0))
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receiving_template_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "shift_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."receiving_template_shifts" OWNER TO "postgres";


COMMENT ON TABLE "public"."receiving_template_shifts" IS 'N:N modelo de recebimento-turno (s67). Conjunto vazio = Todos os turnos.';



CREATE TABLE IF NOT EXISTS "public"."receiving_template_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "order" integer DEFAULT 0 NOT NULL,
    "requires_photo" boolean DEFAULT false NOT NULL,
    "is_critical" boolean DEFAULT false NOT NULL,
    "requires_observation" boolean DEFAULT false NOT NULL,
    "type" "text",
    "max_photos" integer,
    "task_config" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "receiving_template_tasks_type_check" CHECK ((("type" IS NULL) OR ("type" = ANY (ARRAY['boolean'::"text", 'date'::"text", 'number'::"text", 'rating'::"text"]))))
);


ALTER TABLE "public"."receiving_template_tasks" OWNER TO "postgres";


COMMENT ON TABLE "public"."receiving_template_tasks" IS 'Tasks do modelo de recebimento. Clonadas para checklist_tasks quando uma execução é instanciada via /api/receiving/instantiate.';



CREATE TABLE IF NOT EXISTS "public"."receiving_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "area_id" "uuid" NOT NULL,
    "role_id" "uuid",
    "assigned_to_user_id" "uuid",
    "shift" "text",
    "recurrence" "text" DEFAULT 'daily'::"text" NOT NULL,
    "recurrence_config" "jsonb",
    "enforce_sequential_order" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shift_id" "uuid",
    CONSTRAINT "receiving_templates_recurrence_check" CHECK (("recurrence" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text", 'yearly'::"text", 'weekdays'::"text", 'custom'::"text", 'shift_days'::"text"]))),
    CONSTRAINT "receiving_templates_shift_check" CHECK ((("shift" IS NULL) OR ("shift" = ANY (ARRAY['morning'::"text", 'afternoon'::"text", 'evening'::"text"]))))
);


ALTER TABLE "public"."receiving_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."receiving_templates" IS 'Blueprint de recebimento. Define disponibilidade (recorrência) e escopo (área/role/user) para o picker "+ Novo Recebimento" no Meu Turno. Nunca vira atividade direta.';



COMMENT ON COLUMN "public"."receiving_templates"."shift_id" IS 'Turno (shifts.id) ao qual o recebimento pertence. NULL = todos os turnos. Fonte da verdade para segmentação por turno; o enum `shift` permanece como sombra derivada.';



CREATE TABLE IF NOT EXISTS "public"."restaurant_users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "active" boolean DEFAULT true,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "left_at" timestamp with time zone,
    CONSTRAINT "restaurant_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."restaurant_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "logo_url" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cnpj" "text",
    "phone" "text",
    "cep" "text",
    "address" "text",
    "account_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL,
    CONSTRAINT "restaurants_timezone_check" CHECK (("timezone" = ANY (ARRAY['America/Sao_Paulo'::"text", 'America/Bahia'::"text", 'America/Fortaleza'::"text", 'America/Recife'::"text", 'America/Maceio'::"text", 'America/Belem'::"text", 'America/Araguaina'::"text", 'America/Campo_Grande'::"text", 'America/Cuiaba'::"text", 'America/Manaus'::"text", 'America/Boa_Vista'::"text", 'America/Porto_Velho'::"text", 'America/Rio_Branco'::"text", 'America/Eirunepe'::"text", 'America/Noronha'::"text"])))
);


ALTER TABLE "public"."restaurants" OWNER TO "postgres";


COMMENT ON COLUMN "public"."restaurants"."timezone" IS 'Fuso IANA do restaurante. Fonte da verdade para cálculos operacionais de dia/hora/atraso. Default America/Sao_Paulo.';



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#13b6ec'::"text" NOT NULL,
    "max_concurrent_tasks" integer DEFAULT 1 NOT NULL,
    "can_launch_purchases" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "days_of_week" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "shift_type" "text",
    CONSTRAINT "shifts_shift_type_check" CHECK (("shift_type" = ANY (ARRAY['morning'::"text", 'afternoon'::"text", 'evening'::"text"])))
);


ALTER TABLE "public"."shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload" "jsonb"
);


ALTER TABLE "public"."stripe_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "billing_cycle" "text" NOT NULL,
    "status" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "grace_period_days" integer,
    "block_task_exec_on_past_due" boolean DEFAULT false NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subscriptions_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trial'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'incomplete'::"text", 'unpaid'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "cnpj" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


COMMENT ON TABLE "public"."suppliers" IS 'Fornecedores do restaurante. Usado em execuções de recebimento para identificar quem entregou.';



CREATE TABLE IF NOT EXISTS "public"."task_executions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "checklist_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "executed_at" timestamp with time zone DEFAULT "now"(),
    "photo_url" "text",
    "status" "text" NOT NULL,
    "notes" "text",
    "started_at" timestamp with time zone,
    "requires_photo_snapshot" boolean DEFAULT false NOT NULL,
    "checklist_assumption_id" "uuid",
    "blocked_reason" "text",
    "blocked_at" timestamp with time zone,
    "blocked_by_user_id" "uuid",
    "value_boolean" boolean,
    "value_date" "date",
    "value_number" numeric,
    "value_rating" smallint,
    "observation" "text",
    "photos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "has_alert" boolean DEFAULT false NOT NULL,
    "type_snapshot" "text",
    "requires_observation_snapshot" boolean DEFAULT false NOT NULL,
    "max_photos_snapshot" integer,
    "task_config_snapshot" "jsonb",
    "task_title_snapshot" "text",
    "task_description_snapshot" "text",
    "is_critical_snapshot" boolean,
    CONSTRAINT "check_required_photo" CHECK ((NOT (("requires_photo_snapshot" = true) AND ("status" = 'done'::"text") AND ("photo_url" IS NULL)))),
    CONSTRAINT "task_executions_photo_enforcement" CHECK ((NOT (("requires_photo_snapshot" = true) AND ("status" = 'done'::"text") AND ("photo_url" IS NULL)))),
    CONSTRAINT "task_executions_status_check" CHECK (("status" = ANY (ARRAY['done'::"text", 'skipped'::"text", 'flagged'::"text", 'doing'::"text", 'pending'::"text"]))),
    CONSTRAINT "task_executions_type_snapshot_check" CHECK ((("type_snapshot" IS NULL) OR ("type_snapshot" = ANY (ARRAY['boolean'::"text", 'date'::"text", 'number'::"text", 'rating'::"text"])))),
    CONSTRAINT "task_executions_value_rating_check" CHECK ((("value_rating" IS NULL) OR (("value_rating" >= 1) AND ("value_rating" <= 5))))
);


ALTER TABLE "public"."task_executions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."task_executions"."task_id" IS 'Referência HISTÓRICA à tarefa (s89): sem FK — a definição pode ter sido removida da rotina. A identidade da tarefa no momento da execução está nos snapshots (task_title_snapshot etc.).';



COMMENT ON COLUMN "public"."task_executions"."photos" IS 'Array JSONB de paths no Storage. Multi-foto. Mantido em paralelo com photo_url (legado). Leitura deve considerar ambos: se photos=[] e photo_url IS NOT NULL, usar photo_url.';



COMMENT ON COLUMN "public"."task_executions"."has_alert" IS 'Flag de alerta visual (não bloqueante). Computado server-side a partir do valor + config: date < hoje | number fora de [min, max] | rating <= 3.';



COMMENT ON COLUMN "public"."task_executions"."type_snapshot" IS 'Snapshot do tipo da task no momento da execução. Garante histórico imutável se admin trocar config posteriormente.';



COMMENT ON COLUMN "public"."task_executions"."task_title_snapshot" IS 'Snapshot do checklist_tasks.title no momento da execução (fidelidade histórica da Auditoria).';



COMMENT ON COLUMN "public"."task_executions"."task_description_snapshot" IS 'Snapshot do checklist_tasks.description no momento da execução.';



COMMENT ON COLUMN "public"."task_executions"."is_critical_snapshot" IS 'Snapshot do checklist_tasks.is_critical no momento da execução.';



CREATE TABLE IF NOT EXISTS "public"."task_issue_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_issue_id" "uuid" NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "from_status" "text",
    "to_status" "text",
    "comment" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "actor_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_issue_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'status_changed'::"text", 'comment_added'::"text", 'resolved'::"text", 'reopened'::"text", 'edited'::"text"])))
);


ALTER TABLE "public"."task_issue_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."task_issue_events" IS 'Timeline append-only de uma ocorrência.';



CREATE TABLE IF NOT EXISTS "public"."task_issues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "task_execution_id" "uuid",
    "task_id" "uuid" NOT NULL,
    "checklist_id" "uuid" NOT NULL,
    "checklist_assumption_id" "uuid",
    "reported_by" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "photos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "manager_comment" "text",
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "reopened_by" "uuid",
    "reopened_at" timestamp with time zone,
    "severity" "text" DEFAULT 'normal'::"text" NOT NULL,
    "category" "text",
    "requires_photo" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_issues_description_check" CHECK (("length"(TRIM(BOTH FROM "description")) >= 3)),
    CONSTRAINT "task_issues_resolved_requires_comment" CHECK ((("status" <> 'resolved'::"text") OR (("manager_comment" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "manager_comment")) > 0)))),
    CONSTRAINT "task_issues_severity_check" CHECK (("severity" = ANY (ARRAY['normal'::"text", 'blocker'::"text"]))),
    CONSTRAINT "task_issues_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'investigating'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."task_issues" OWNER TO "postgres";


COMMENT ON TABLE "public"."task_issues" IS 'Ocorrências operacionais reportadas pelo staff numa task. Desacoplada de task_executions.';



COMMENT ON COLUMN "public"."task_issues"."task_execution_id" IS 'Execução à qual a ocorrência se refere (nullable).';



COMMENT ON COLUMN "public"."task_issues"."task_id" IS 'Referência HISTÓRICA à tarefa (s89): sem FK — a definição pode ter sido removida da rotina.';



COMMENT ON COLUMN "public"."task_issues"."requires_photo" IS 'Reservado para evolução futura.';



CREATE TABLE IF NOT EXISTS "public"."telegram_link_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."telegram_link_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."telegram_link_tokens" IS 'Tokens temporários de uso único para vincular o Telegram via "/start TOKEN". Validado pelo webhook.';



CREATE TABLE IF NOT EXISTS "public"."template_kit_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kit_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "requirement_level" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "template_kit_items_requirement_level_check" CHECK (("requirement_level" = ANY (ARRAY['obrigatorio'::"text", 'recomendado'::"text", 'opcional'::"text"])))
);


ALTER TABLE "public"."template_kit_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_kits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "segment" "text" NOT NULL,
    "icon" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "template_kits_segment_check" CHECK (("segment" = ANY (ARRAY['restaurante'::"text", 'hamburgueria'::"text", 'pizzaria'::"text", 'cafeteria'::"text", 'fast_food'::"text", 'gastrobar'::"text"])))
);


ALTER TABLE "public"."template_kits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "area_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "shift_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_users"
    ADD CONSTRAINT "account_users_account_id_user_id_key" UNIQUE ("account_id", "user_id");



ALTER TABLE ONLY "public"."account_users"
    ADD CONSTRAINT "account_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_logs"
    ADD CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_notification_outbox"
    ADD CONSTRAINT "admin_notification_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_notification_recipients"
    ADD CONSTRAINT "admin_notification_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_notification_subscriptions"
    ADD CONSTRAINT "admin_notification_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_restaurant_id_name_key" UNIQUE ("restaurant_id", "name");



ALTER TABLE ONLY "public"."checklist_assumptions"
    ADD CONSTRAINT "checklist_assumptions_checklist_id_date_key_key" UNIQUE ("checklist_id", "date_key");



ALTER TABLE ONLY "public"."checklist_assumptions"
    ADD CONSTRAINT "checklist_assumptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checklist_orders"
    ADD CONSTRAINT "checklist_orders_checklist_id_shift_key" UNIQUE ("checklist_id", "shift");



ALTER TABLE ONLY "public"."checklist_orders"
    ADD CONSTRAINT "checklist_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checklist_shifts"
    ADD CONSTRAINT "checklist_shifts_checklist_id_shift_id_key" UNIQUE ("checklist_id", "shift_id");



ALTER TABLE ONLY "public"."checklist_shifts"
    ADD CONSTRAINT "checklist_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checklist_tasks"
    ADD CONSTRAINT "checklist_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checklist_template_items"
    ADD CONSTRAINT "checklist_template_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checklist_template_items"
    ADD CONSTRAINT "checklist_template_items_template_id_item_slug_key" UNIQUE ("template_id", "item_slug");



ALTER TABLE ONLY "public"."checklist_templates"
    ADD CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checklist_templates"
    ADD CONSTRAINT "checklist_templates_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_export_events"
    ADD CONSTRAINT "data_export_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."domain_events"
    ADD CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_logs"
    ADD CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_runs"
    ADD CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_state"
    ADD CONSTRAINT "job_state_pkey" PRIMARY KEY ("job_name");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_channels"
    ADD CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_alerts"
    ADD CONSTRAINT "operational_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordemnamesa_staff"
    ADD CONSTRAINT "ordemnamesa_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordemnamesa_staff"
    ADD CONSTRAINT "ordemnamesa_staff_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receiving_template_shifts"
    ADD CONSTRAINT "receiving_template_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receiving_template_shifts"
    ADD CONSTRAINT "receiving_template_shifts_template_id_shift_id_key" UNIQUE ("template_id", "shift_id");



ALTER TABLE ONLY "public"."receiving_template_tasks"
    ADD CONSTRAINT "receiving_template_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receiving_templates"
    ADD CONSTRAINT "receiving_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_users"
    ADD CONSTRAINT "restaurant_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_users"
    ADD CONSTRAINT "restaurant_users_restaurant_id_user_id_key" UNIQUE ("restaurant_id", "user_id");



ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_events"
    ADD CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_restaurant_id_name_key" UNIQUE ("restaurant_id", "name");



ALTER TABLE ONLY "public"."task_executions"
    ADD CONSTRAINT "task_executions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_issue_events"
    ADD CONSTRAINT "task_issue_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_issues"
    ADD CONSTRAINT "task_issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_link_tokens"
    ADD CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_link_tokens"
    ADD CONSTRAINT "telegram_link_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."template_kit_items"
    ADD CONSTRAINT "template_kit_items_kit_id_template_id_key" UNIQUE ("kit_id", "template_id");



ALTER TABLE ONLY "public"."template_kit_items"
    ADD CONSTRAINT "template_kit_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_kits"
    ADD CONSTRAINT "template_kits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_kits"
    ADD CONSTRAINT "template_kits_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."user_areas"
    ADD CONSTRAINT "user_areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_areas"
    ADD CONSTRAINT "user_areas_restaurant_id_user_id_area_id_key" UNIQUE ("restaurant_id", "user_id", "area_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_restaurant_id_user_id_role_id_key" UNIQUE ("restaurant_id", "user_id", "role_id");



ALTER TABLE ONLY "public"."user_shifts"
    ADD CONSTRAINT "user_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "account_users_account_idx" ON "public"."account_users" USING "btree" ("account_id") WHERE ("active" = true);



CREATE INDEX "account_users_account_role_active_idx" ON "public"."account_users" USING "btree" ("account_id", "role") WHERE ("active" = true);



CREATE INDEX "account_users_user_idx" ON "public"."account_users" USING "btree" ("user_id") WHERE ("active" = true);



CREATE INDEX "checklist_orders_checklist_id_idx" ON "public"."checklist_orders" USING "btree" ("checklist_id");



CREATE INDEX "checklist_orders_restaurant_shift_idx" ON "public"."checklist_orders" USING "btree" ("restaurant_id", "shift");



CREATE INDEX "checklists_area_id_idx" ON "public"."checklists" USING "btree" ("area_id");



CREATE INDEX "checklists_is_one_shot_false_idx" ON "public"."checklists" USING "btree" ("restaurant_id") WHERE ("is_one_shot" = false);



CREATE INDEX "checklists_root_source_idx" ON "public"."checklists" USING "btree" ("restaurant_id", "root_source_checklist_id") WHERE ("root_source_checklist_id" IS NOT NULL);



CREATE INDEX "checklists_target_role_idx" ON "public"."checklists" USING "btree" ("restaurant_id", "target_role");



CREATE INDEX "idx_accounts_active" ON "public"."accounts" USING "btree" ("active");



CREATE INDEX "idx_admin_logs_admin_email" ON "public"."admin_logs" USING "btree" ("admin_email");



CREATE INDEX "idx_admin_logs_created_at" ON "public"."admin_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_admin_logs_target" ON "public"."admin_logs" USING "btree" ("target_type", "target_id");



CREATE UNIQUE INDEX "idx_admin_notification_outbox_dedup" ON "public"."admin_notification_outbox" USING "btree" ("event_type", "dedup_key", "recipient_email");



CREATE INDEX "idx_admin_notification_outbox_status_next" ON "public"."admin_notification_outbox" USING "btree" ("status", "next_attempt_at");



CREATE UNIQUE INDEX "idx_admin_notification_recipients_email" ON "public"."admin_notification_recipients" USING "btree" ("lower"("email"));



CREATE INDEX "idx_admin_notification_subscriptions_event" ON "public"."admin_notification_subscriptions" USING "btree" ("event_type");



CREATE UNIQUE INDEX "idx_admin_notification_subscriptions_recipient_event" ON "public"."admin_notification_subscriptions" USING "btree" ("recipient_id", "event_type");



CREATE INDEX "idx_checklist_assumptions_assumed_at" ON "public"."checklist_assumptions" USING "btree" ("assumed_at" DESC);



CREATE INDEX "idx_checklist_assumptions_restaurant_date" ON "public"."checklist_assumptions" USING "btree" ("restaurant_id", "date_key");



CREATE INDEX "idx_checklist_assumptions_user_area_status" ON "public"."checklist_assumptions" USING "btree" ("user_id", "date_key", "execution_status") WHERE ("execution_status" = 'in_progress'::"text");



CREATE INDEX "idx_checklist_shifts_checklist" ON "public"."checklist_shifts" USING "btree" ("checklist_id");



CREATE INDEX "idx_checklist_shifts_rest_shift" ON "public"."checklist_shifts" USING "btree" ("restaurant_id", "shift_id");



CREATE INDEX "idx_checklist_template_items_template_order" ON "public"."checklist_template_items" USING "btree" ("template_id", "order");



CREATE INDEX "idx_checklist_templates_category_sort" ON "public"."checklist_templates" USING "btree" ("category", "sort_order");



CREATE INDEX "idx_checklists_assignment_type" ON "public"."checklists" USING "btree" ("restaurant_id", "assignment_type") WHERE (("active" = true) AND ("status" = 'active'::"text"));



CREATE INDEX "idx_checklists_origin_kit" ON "public"."checklists" USING "btree" ("origin_kit_id") WHERE ("origin_kit_id" IS NOT NULL);



CREATE INDEX "idx_checklists_origin_template" ON "public"."checklists" USING "btree" ("origin_template_id") WHERE ("origin_template_id" IS NOT NULL);



CREATE INDEX "idx_checklists_rest_shift_id" ON "public"."checklists" USING "btree" ("restaurant_id", "shift_id");



CREATE INDEX "idx_checklists_source_template" ON "public"."checklists" USING "btree" ("source_template_id") WHERE ("source_template_id" IS NOT NULL);



CREATE INDEX "idx_checklists_supplier" ON "public"."checklists" USING "btree" ("supplier_id") WHERE ("supplier_id" IS NOT NULL);



CREATE INDEX "idx_cl_restaurant" ON "public"."checklists" USING "btree" ("restaurant_id");



CREATE INDEX "idx_ct_checklist" ON "public"."checklist_tasks" USING "btree" ("checklist_id");



CREATE INDEX "idx_data_export_events_batch" ON "public"."data_export_events" USING "btree" ("batch_id");



CREATE INDEX "idx_data_export_events_restaurant_created" ON "public"."data_export_events" USING "btree" ("restaurant_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_domain_events_dedup" ON "public"."domain_events" USING "btree" ("event_type", "dedup_key");



CREATE INDEX "idx_domain_events_pending" ON "public"."domain_events" USING "btree" ("next_attempt_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'failed'::"text"]));



CREATE INDEX "idx_domain_events_status_created" ON "public"."domain_events" USING "btree" ("status", "created_at");



CREATE INDEX "idx_event_logs_account_created" ON "public"."event_logs" USING "btree" ("account_id", "created_at" DESC) WHERE ("account_id" IS NOT NULL);



CREATE INDEX "idx_event_logs_created_at" ON "public"."event_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_event_logs_event_created" ON "public"."event_logs" USING "btree" ("event_name", "created_at" DESC);



CREATE INDEX "idx_event_logs_restaurant_created" ON "public"."event_logs" USING "btree" ("restaurant_id", "created_at" DESC) WHERE ("restaurant_id" IS NOT NULL);



CREATE INDEX "idx_event_logs_user_created" ON "public"."event_logs" USING "btree" ("user_id", "created_at" DESC) WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_job_runs_job_started" ON "public"."job_runs" USING "btree" ("job_name", "started_at" DESC);



CREATE INDEX "idx_job_runs_running" ON "public"."job_runs" USING "btree" ("started_at") WHERE ("status" = 'running'::"text");



CREATE INDEX "idx_job_runs_status_created" ON "public"."job_runs" USING "btree" ("status", "created_at");



CREATE INDEX "idx_leads_approved_entity" ON "public"."leads" USING "btree" ("approved_entity_id");



CREATE INDEX "idx_leads_created_at" ON "public"."leads" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("status");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "idx_notifications_event_user" ON "public"."notifications" USING "btree" ("event_id", "user_id");



CREATE INDEX "idx_notifications_restaurant_id" ON "public"."notifications" USING "btree" ("restaurant_id");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_user_rest_rank" ON "public"."notifications" USING "btree" ("user_id", "restaurant_id", "read", "priority_rank", "created_at" DESC);



CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "read") WHERE ("read" = false);



CREATE INDEX "idx_operational_alerts_created_at" ON "public"."operational_alerts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_operational_alerts_resolved_at" ON "public"."operational_alerts" USING "btree" ("resolved_at");



CREATE INDEX "idx_operational_alerts_severity_created" ON "public"."operational_alerts" USING "btree" ("severity", "created_at" DESC);



CREATE INDEX "idx_operational_alerts_type_created" ON "public"."operational_alerts" USING "btree" ("alert_type", "created_at" DESC);



CREATE INDEX "idx_ordemnamesa_staff_role" ON "public"."ordemnamesa_staff" USING "btree" ("role");



CREATE INDEX "idx_ordemnamesa_staff_user_id" ON "public"."ordemnamesa_staff" USING "btree" ("user_id");



CREATE INDEX "idx_receiving_templates_rest_shift_id" ON "public"."receiving_templates" USING "btree" ("restaurant_id", "shift_id");



CREATE INDEX "idx_recv_tpl_rest_active_area" ON "public"."receiving_templates" USING "btree" ("restaurant_id", "active", "area_id");



CREATE INDEX "idx_recv_tpl_rest_assigned_user" ON "public"."receiving_templates" USING "btree" ("restaurant_id", "assigned_to_user_id") WHERE ("assigned_to_user_id" IS NOT NULL);



CREATE INDEX "idx_recv_tpl_tasks_template_order" ON "public"."receiving_template_tasks" USING "btree" ("template_id", "order");



CREATE INDEX "idx_restaurant_users_userid_active" ON "public"."restaurant_users" USING "btree" ("user_id", "restaurant_id") WHERE ("active" = true);



CREATE INDEX "idx_rt_shifts_rest_shift" ON "public"."receiving_template_shifts" USING "btree" ("restaurant_id", "shift_id");



CREATE INDEX "idx_rt_shifts_template" ON "public"."receiving_template_shifts" USING "btree" ("template_id");



CREATE INDEX "idx_ru_restaurant" ON "public"."restaurant_users" USING "btree" ("restaurant_id");



CREATE INDEX "idx_ru_user" ON "public"."restaurant_users" USING "btree" ("user_id");



CREATE INDEX "idx_shifts_restaurant_active" ON "public"."shifts" USING "btree" ("restaurant_id") WHERE ("active" = true);



CREATE INDEX "idx_subscriptions_status_ends" ON "public"."subscriptions" USING "btree" ("status", "ends_at");



CREATE INDEX "idx_suppliers_rest_active" ON "public"."suppliers" USING "btree" ("restaurant_id", "active");



CREATE INDEX "idx_task_executions_assumption" ON "public"."task_executions" USING "btree" ("checklist_assumption_id");



CREATE INDEX "idx_task_executions_checklist_executed" ON "public"."task_executions" USING "btree" ("checklist_id", "executed_at");



CREATE INDEX "idx_task_executions_restaurant_executed" ON "public"."task_executions" USING "btree" ("restaurant_id", "executed_at");



CREATE INDEX "idx_task_executions_restaurant_user_executed" ON "public"."task_executions" USING "btree" ("restaurant_id", "user_id", "executed_at");



CREATE INDEX "idx_task_executions_task_id" ON "public"."task_executions" USING "btree" ("task_id");



CREATE INDEX "idx_task_issue_events_issue_time" ON "public"."task_issue_events" USING "btree" ("task_issue_id", "created_at");



CREATE INDEX "idx_task_issues_assumption" ON "public"."task_issues" USING "btree" ("checklist_assumption_id");



CREATE INDEX "idx_task_issues_checklist_open" ON "public"."task_issues" USING "btree" ("checklist_id") WHERE ("status" = ANY (ARRAY['open'::"text", 'investigating'::"text"]));



CREATE INDEX "idx_task_issues_checklist_severity" ON "public"."task_issues" USING "btree" ("checklist_id", "severity") WHERE ("status" = ANY (ARRAY['open'::"text", 'investigating'::"text"]));



CREATE INDEX "idx_task_issues_execution" ON "public"."task_issues" USING "btree" ("task_execution_id");



CREATE INDEX "idx_task_issues_restaurant_status" ON "public"."task_issues" USING "btree" ("restaurant_id", "status");



CREATE INDEX "idx_task_issues_task_id" ON "public"."task_issues" USING "btree" ("task_id");



CREATE INDEX "idx_te_checklist" ON "public"."task_executions" USING "btree" ("checklist_id");



CREATE INDEX "idx_te_restaurant" ON "public"."task_executions" USING "btree" ("restaurant_id");



CREATE INDEX "idx_te_user" ON "public"."task_executions" USING "btree" ("user_id");



CREATE INDEX "idx_template_kit_items_kit" ON "public"."template_kit_items" USING "btree" ("kit_id", "sort_order");



CREATE INDEX "idx_template_kit_items_template" ON "public"."template_kit_items" USING "btree" ("template_id");



CREATE INDEX "idx_template_kits_segment_sort" ON "public"."template_kits" USING "btree" ("segment", "sort_order");



CREATE INDEX "notification_channels_external_idx" ON "public"."notification_channels" USING "btree" ("channel_type", "external_id");



CREATE UNIQUE INDEX "notification_channels_user_type_global_uniq" ON "public"."notification_channels" USING "btree" ("user_id", "channel_type") WHERE ("restaurant_id" IS NULL);



CREATE INDEX "restaurant_users_restaurant_role_active_idx" ON "public"."restaurant_users" USING "btree" ("restaurant_id", "role") WHERE ("active" = true);



CREATE INDEX "restaurants_account_active_alive_idx" ON "public"."restaurants" USING "btree" ("account_id") WHERE (("active" = true) AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "restaurants_cnpj_active_unique" ON "public"."restaurants" USING "btree" ("cnpj") WHERE (("cnpj" IS NOT NULL) AND ("active" = true));



CREATE UNIQUE INDEX "restaurants_one_primary_per_account" ON "public"."restaurants" USING "btree" ("account_id") WHERE (("is_primary" = true) AND ("active" = true));



CREATE INDEX "stripe_events_type_idx" ON "public"."stripe_events" USING "btree" ("type", "processed_at" DESC);



CREATE INDEX "subscriptions_account_idx" ON "public"."subscriptions" USING "btree" ("account_id");



CREATE UNIQUE INDEX "subscriptions_one_live_per_account" ON "public"."subscriptions" USING "btree" ("account_id") WHERE ("status" = ANY (ARRAY['trial'::"text", 'active'::"text", 'past_due'::"text"]));



CREATE INDEX "subscriptions_trial_ends_at_idx" ON "public"."subscriptions" USING "btree" ("ends_at") WHERE ("status" = 'trial'::"text");



CREATE INDEX "telegram_link_tokens_token_idx" ON "public"."telegram_link_tokens" USING "btree" ("token");



CREATE UNIQUE INDEX "uq_checklists_idempotency_key" ON "public"."checklists" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "uq_operational_alerts_open_per_restaurant_type" ON "public"."operational_alerts" USING "btree" ("restaurant_id", "alert_type") WHERE (("resolved_at" IS NULL) AND ("restaurant_id" IS NOT NULL));



CREATE INDEX "user_areas_area_idx" ON "public"."user_areas" USING "btree" ("area_id");



CREATE INDEX "user_areas_user_idx" ON "public"."user_areas" USING "btree" ("restaurant_id", "user_id");



CREATE OR REPLACE TRIGGER "admin_notification_outbox_set_updated_at" BEFORE UPDATE ON "public"."admin_notification_outbox" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_notification_outbox_updated_at"();



CREATE OR REPLACE TRIGGER "admin_notification_recipients_set_updated_at" BEFORE UPDATE ON "public"."admin_notification_recipients" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_notification_recipients_updated_at"();



CREATE OR REPLACE TRIGGER "checklist_templates_updated_at" BEFORE UPDATE ON "public"."checklist_templates" FOR EACH ROW EXECUTE FUNCTION "public"."tg_checklist_templates_updated_at"();



CREATE OR REPLACE TRIGGER "job_state_set_updated_at" BEFORE UPDATE ON "public"."job_state" FOR EACH ROW EXECUTE FUNCTION "public"."set_job_state_updated_at"();



CREATE OR REPLACE TRIGGER "leads_set_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_leads_updated_at"();



CREATE OR REPLACE TRIGGER "receiving_templates_updated_at" BEFORE UPDATE ON "public"."receiving_templates" FOR EACH ROW EXECUTE FUNCTION "public"."tg_receiving_templates_updated_at"();



CREATE OR REPLACE TRIGGER "template_kits_updated_at" BEFORE UPDATE ON "public"."template_kits" FOR EACH ROW EXECUTE FUNCTION "public"."tg_template_kits_updated_at"();



CREATE OR REPLACE TRIGGER "trg_assert_task_exists_exec" BEFORE INSERT ON "public"."task_executions" FOR EACH ROW EXECUTE FUNCTION "public"."assert_task_exists"();



CREATE OR REPLACE TRIGGER "trg_assert_task_exists_issue" BEFORE INSERT ON "public"."task_issues" FOR EACH ROW EXECUTE FUNCTION "public"."assert_task_exists"();



CREATE OR REPLACE TRIGGER "trg_guard_hist_assumption" BEFORE DELETE OR UPDATE ON "public"."checklist_assumptions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_history_assumption"();



CREATE OR REPLACE TRIGGER "trg_guard_hist_task_exec" BEFORE DELETE OR UPDATE ON "public"."task_executions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_history_task_exec"();



CREATE OR REPLACE TRIGGER "trg_guard_hist_task_issue" BEFORE DELETE OR UPDATE ON "public"."task_issues" FOR EACH ROW EXECUTE FUNCTION "public"."guard_history_task_issue"();



CREATE OR REPLACE TRIGGER "trg_task_issues_updated_at" BEFORE UPDATE ON "public"."task_issues" FOR EACH ROW EXECUTE FUNCTION "public"."touch_task_issues_updated_at"();



ALTER TABLE ONLY "public"."account_users"
    ADD CONSTRAINT "account_users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."account_users"
    ADD CONSTRAINT "account_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_notification_subscriptions"
    ADD CONSTRAINT "admin_notification_subscriptions_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."admin_notification_recipients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_assumptions"
    ADD CONSTRAINT "checklist_assumptions_assumption_shift_id_fkey" FOREIGN KEY ("assumption_shift_id") REFERENCES "public"."shifts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checklist_assumptions"
    ADD CONSTRAINT "checklist_assumptions_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_assumptions"
    ADD CONSTRAINT "checklist_assumptions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_orders"
    ADD CONSTRAINT "checklist_orders_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_orders"
    ADD CONSTRAINT "checklist_orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_shifts"
    ADD CONSTRAINT "checklist_shifts_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_shifts"
    ADD CONSTRAINT "checklist_shifts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_shifts"
    ADD CONSTRAINT "checklist_shifts_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_tasks"
    ADD CONSTRAINT "checklist_tasks_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checklist_tasks"
    ADD CONSTRAINT "checklist_tasks_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."checklist_tasks"
    ADD CONSTRAINT "checklist_tasks_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_tasks"
    ADD CONSTRAINT "checklist_tasks_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."checklist_tasks"
    ADD CONSTRAINT "checklist_tasks_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."checklist_template_items"
    ADD CONSTRAINT "checklist_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_origin_kit_id_fkey" FOREIGN KEY ("origin_kit_id") REFERENCES "public"."template_kits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_origin_template_id_fkey" FOREIGN KEY ("origin_template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_root_source_checklist_id_fkey" FOREIGN KEY ("root_source_checklist_id") REFERENCES "public"."checklists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_source_checklist_id_fkey" FOREIGN KEY ("source_checklist_id") REFERENCES "public"."checklists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "public"."receiving_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checklists"
    ADD CONSTRAINT "checklists_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."domain_events"
    ADD CONSTRAINT "domain_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_logs"
    ADD CONSTRAINT "event_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_logs"
    ADD CONSTRAINT "event_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_logs"
    ADD CONSTRAINT "event_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_approved_user_id_fkey" FOREIGN KEY ("approved_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_channels"
    ADD CONSTRAINT "notification_channels_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_channels"
    ADD CONSTRAINT "notification_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_alerts"
    ADD CONSTRAINT "operational_alerts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_alerts"
    ADD CONSTRAINT "operational_alerts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ordemnamesa_staff"
    ADD CONSTRAINT "ordemnamesa_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receiving_template_shifts"
    ADD CONSTRAINT "receiving_template_shifts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receiving_template_shifts"
    ADD CONSTRAINT "receiving_template_shifts_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receiving_template_shifts"
    ADD CONSTRAINT "receiving_template_shifts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."receiving_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receiving_template_tasks"
    ADD CONSTRAINT "receiving_template_tasks_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receiving_template_tasks"
    ADD CONSTRAINT "receiving_template_tasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."receiving_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receiving_templates"
    ADD CONSTRAINT "receiving_templates_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id");



ALTER TABLE ONLY "public"."receiving_templates"
    ADD CONSTRAINT "receiving_templates_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receiving_templates"
    ADD CONSTRAINT "receiving_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receiving_templates"
    ADD CONSTRAINT "receiving_templates_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receiving_templates"
    ADD CONSTRAINT "receiving_templates_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."receiving_templates"
    ADD CONSTRAINT "receiving_templates_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."restaurant_users"
    ADD CONSTRAINT "restaurant_users_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."restaurant_users"
    ADD CONSTRAINT "restaurant_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."restaurants"
    ADD CONSTRAINT "restaurants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_executions"
    ADD CONSTRAINT "task_executions_blocked_by_user_id_fkey" FOREIGN KEY ("blocked_by_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_executions"
    ADD CONSTRAINT "task_executions_checklist_assumption_id_fkey" FOREIGN KEY ("checklist_assumption_id") REFERENCES "public"."checklist_assumptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_executions"
    ADD CONSTRAINT "task_executions_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_executions"
    ADD CONSTRAINT "task_executions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."task_executions"
    ADD CONSTRAINT "task_executions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_issue_events"
    ADD CONSTRAINT "task_issue_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_issue_events"
    ADD CONSTRAINT "task_issue_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_issue_events"
    ADD CONSTRAINT "task_issue_events_task_issue_id_fkey" FOREIGN KEY ("task_issue_id") REFERENCES "public"."task_issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_issues"
    ADD CONSTRAINT "task_issues_checklist_assumption_id_fkey" FOREIGN KEY ("checklist_assumption_id") REFERENCES "public"."checklist_assumptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_issues"
    ADD CONSTRAINT "task_issues_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_issues"
    ADD CONSTRAINT "task_issues_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_issues"
    ADD CONSTRAINT "task_issues_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_issues"
    ADD CONSTRAINT "task_issues_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."task_issues"
    ADD CONSTRAINT "task_issues_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_issues"
    ADD CONSTRAINT "task_issues_task_execution_id_fkey" FOREIGN KEY ("task_execution_id") REFERENCES "public"."task_executions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."telegram_link_tokens"
    ADD CONSTRAINT "telegram_link_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_kit_items"
    ADD CONSTRAINT "template_kit_items_kit_id_fkey" FOREIGN KEY ("kit_id") REFERENCES "public"."template_kits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_kit_items"
    ADD CONSTRAINT "template_kit_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_areas"
    ADD CONSTRAINT "user_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_areas"
    ADD CONSTRAINT "user_areas_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_areas"
    ADD CONSTRAINT "user_areas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."user_shifts"
    ADD CONSTRAINT "user_shifts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id");



ALTER TABLE ONLY "public"."user_shifts"
    ADD CONSTRAINT "user_shifts_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id");



ALTER TABLE ONLY "public"."user_shifts"
    ADD CONSTRAINT "user_shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Restaurant members can view assumptions" ON "public"."checklist_assumptions" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "Staff can insert assumptions" ON "public"."checklist_assumptions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("restaurant_id" IN ( SELECT "ru"."restaurant_id"
   FROM "public"."restaurant_users" "ru"
  WHERE (("ru"."user_id" = "auth"."uid"()) AND ("ru"."active" = true))))));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."account_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "account_users: owner atualiza" ON "public"."account_users" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."account_users" "owner_row"
  WHERE (("owner_row"."account_id" = "account_users"."account_id") AND ("owner_row"."user_id" = "auth"."uid"()) AND ("owner_row"."role" = 'owner'::"text") AND ("owner_row"."active" = true)))));



CREATE POLICY "account_users: owner deleta" ON "public"."account_users" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."account_users" "owner_row"
  WHERE (("owner_row"."account_id" = "account_users"."account_id") AND ("owner_row"."user_id" = "auth"."uid"()) AND ("owner_row"."role" = 'owner'::"text") AND ("owner_row"."active" = true)))));



CREATE POLICY "account_users: owner insere" ON "public"."account_users" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."account_users" "owner_row"
  WHERE (("owner_row"."account_id" = "account_users"."account_id") AND ("owner_row"."user_id" = "auth"."uid"()) AND ("owner_row"."role" = 'owner'::"text") AND ("owner_row"."active" = true)))));



CREATE POLICY "account_users: proprio ou owner" ON "public"."account_users" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."account_users" "owner_row"
  WHERE (("owner_row"."account_id" = "account_users"."account_id") AND ("owner_row"."user_id" = "auth"."uid"()) AND ("owner_row"."role" = 'owner'::"text") AND ("owner_row"."active" = true))))));



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounts: membros veem" ON "public"."accounts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."account_users" "au"
  WHERE (("au"."account_id" = "accounts"."id") AND ("au"."user_id" = "auth"."uid"()) AND ("au"."active" = true)))));



CREATE POLICY "accounts: owner atualiza" ON "public"."accounts" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."account_users" "au"
  WHERE (("au"."account_id" = "accounts"."id") AND ("au"."user_id" = "auth"."uid"()) AND ("au"."role" = 'owner'::"text") AND ("au"."active" = true)))));



ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_notification_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_notification_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_notification_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "areas: members can view" ON "public"."areas" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "areas: owner can delete" ON "public"."areas" FOR DELETE TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text"]));



CREATE POLICY "areas: owner/manager can create" ON "public"."areas" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



CREATE POLICY "areas: owner/manager can update" ON "public"."areas" FOR UPDATE TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."checklist_assumptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checklist_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checklist_orders: members can view" ON "public"."checklist_orders" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "checklist_orders: owner can delete" ON "public"."checklist_orders" FOR DELETE TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text"]));



CREATE POLICY "checklist_orders: owner/manager can insert" ON "public"."checklist_orders" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



CREATE POLICY "checklist_orders: owner/manager can update" ON "public"."checklist_orders" FOR UPDATE TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."checklist_shifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checklist_shifts: membro ve" ON "public"."checklist_shifts" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "checklist_shifts: owner/manager gerencia" ON "public"."checklist_shifts" TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."checklist_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checklist_tasks: membro ve" ON "public"."checklist_tasks" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "checklist_tasks: owner/manager gerencia" ON "public"."checklist_tasks" TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."checklist_template_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checklist_template_items_select_auth" ON "public"."checklist_template_items" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."checklist_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checklist_templates_select_auth" ON "public"."checklist_templates" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."checklists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checklists: membro ve" ON "public"."checklists" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "checklists: owner/manager gerencia" ON "public"."checklists" TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."data_export_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "data_export_events: owner/manager le" ON "public"."data_export_events" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."domain_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_logs_no_access" ON "public"."event_logs" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."job_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."migration_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_channels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_channels: owner rows" ON "public"."notification_channels" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operational_alerts_no_access" ON "public"."operational_alerts" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."ordemnamesa_staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owner_manager_read_audit_log" ON "public"."admin_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."restaurant_users" "ru"
  WHERE (("ru"."restaurant_id" = "admin_audit_log"."restaurant_id") AND ("ru"."user_id" = "auth"."uid"()) AND ("ru"."role" = ANY (ARRAY['owner'::"text", 'manager'::"text"])) AND ("ru"."active" = true)))));



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plans_select_auth" ON "public"."plans" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."receiving_template_shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receiving_template_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "receiving_template_tasks: membro ve" ON "public"."receiving_template_tasks" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "receiving_template_tasks: owner/manager gerencia" ON "public"."receiving_template_tasks" TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."receiving_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "receiving_templates: membro ve" ON "public"."receiving_templates" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "receiving_templates: owner/manager gerencia" ON "public"."receiving_templates" TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."restaurant_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "restaurant_users: membro ve seu proprio vinculo" ON "public"."restaurant_users" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."restaurants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "restaurants: auth cria" ON "public"."restaurants" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "restaurants: membro da account insere" ON "public"."restaurants" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."account_users" "au"
  WHERE (("au"."account_id" = "restaurants"."account_id") AND ("au"."user_id" = "auth"."uid"()) AND ("au"."active" = true)))));



CREATE POLICY "restaurants: membro ve seu restaurante" ON "public"."restaurants" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "restaurant_users"."restaurant_id"
   FROM "public"."restaurant_users"
  WHERE (("restaurant_users"."user_id" = "auth"."uid"()) AND ("restaurant_users"."active" = true)))));



CREATE POLICY "restaurants: owner da account atualiza" ON "public"."restaurants" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."account_users" "au"
  WHERE (("au"."account_id" = "restaurants"."account_id") AND ("au"."user_id" = "auth"."uid"()) AND ("au"."role" = 'owner'::"text") AND ("au"."active" = true)))));



CREATE POLICY "restaurants: owner edita" ON "public"."restaurants" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_select" ON "public"."roles" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "roles_write" ON "public"."roles" TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



CREATE POLICY "rt_shifts: membro ve" ON "public"."receiving_template_shifts" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "rt_shifts: owner/manager gerencia" ON "public"."receiving_template_shifts" TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."shifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shifts_select" ON "public"."shifts" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "shifts_write" ON "public"."shifts" TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscriptions_select_member" ON "public"."subscriptions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."account_users" "au"
  WHERE (("au"."account_id" = "subscriptions"."account_id") AND ("au"."user_id" = "auth"."uid"()) AND ("au"."active" = true)))));



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers: membro pode cadastrar" ON "public"."suppliers" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "suppliers: membro ve" ON "public"."suppliers" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "suppliers: owner/manager gerencia" ON "public"."suppliers" TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."task_executions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_executions: membro atualiza propria" ON "public"."task_executions" FOR UPDATE TO "authenticated" USING (((("user_id" = "auth"."uid"()) AND "public"."is_restaurant_member"("restaurant_id")) OR "public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]))) WITH CHECK (((("user_id" = "auth"."uid"()) AND "public"."is_restaurant_member"("restaurant_id")) OR "public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])));



CREATE POLICY "task_executions: membro deleta propria" ON "public"."task_executions" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND "public"."is_restaurant_member"("restaurant_id") AND (COALESCE("executed_at", "started_at", "blocked_at") >= ("date_trunc"('day'::"text", ("now"() AT TIME ZONE 'America/Sao_Paulo'::"text")) AT TIME ZONE 'America/Sao_Paulo'::"text"))));



CREATE POLICY "task_executions: membro insere" ON "public"."task_executions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "task_executions: staff ve propria" ON "public"."task_executions" FOR SELECT TO "authenticated" USING (((("user_id" = "auth"."uid"()) AND "public"."is_restaurant_member"("restaurant_id")) OR "public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])));



ALTER TABLE "public"."task_issue_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_issue_events: leitura segue task_issue" ON "public"."task_issue_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."task_issues" "ti"
  WHERE (("ti"."id" = "task_issue_events"."task_issue_id") AND ((("ti"."reported_by" = "auth"."uid"()) AND "public"."is_restaurant_member"("ti"."restaurant_id")) OR "public"."is_restaurant_member"("ti"."restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]))))));



CREATE POLICY "task_issue_events: membro autenticado insere" ON "public"."task_issue_events" FOR INSERT TO "authenticated" WITH CHECK ((("actor_user_id" = "auth"."uid"()) AND "public"."is_restaurant_member"("restaurant_id")));



ALTER TABLE "public"."task_issues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_issues: membro insere propria" ON "public"."task_issues" FOR INSERT TO "authenticated" WITH CHECK ((("reported_by" = "auth"."uid"()) AND "public"."is_restaurant_member"("restaurant_id")));



CREATE POLICY "task_issues: owner/manager atualiza" ON "public"."task_issues" FOR UPDATE TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



CREATE POLICY "task_issues: staff ve propria, gestor ve tudo" ON "public"."task_issues" FOR SELECT TO "authenticated" USING (((("reported_by" = "auth"."uid"()) AND "public"."is_restaurant_member"("restaurant_id")) OR "public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])));



ALTER TABLE "public"."telegram_link_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "telegram_link_tokens: owner rows" ON "public"."telegram_link_tokens" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."template_kit_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "template_kit_items_select_auth" ON "public"."template_kit_items" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."template_kits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "template_kits_select_auth" ON "public"."template_kits" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."user_areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_areas: members can view" ON "public"."user_areas" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "user_areas: owner/manager can assign" ON "public"."user_areas" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



CREATE POLICY "user_areas: owner/manager can remove" ON "public"."user_areas" FOR DELETE TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_select" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "user_roles_write" ON "public"."user_roles" TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."user_shifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_shifts_select" ON "public"."user_shifts" FOR SELECT TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id"));



CREATE POLICY "user_shifts_write" ON "public"."user_shifts" TO "authenticated" USING ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"])) WITH CHECK ("public"."is_restaurant_member"("restaurant_id", ARRAY['owner'::"text", 'manager'::"text"]));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users: editar proprio perfil" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "users: ver proprio perfil" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."checklist_assumptions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."admin_purge_history_for_restaurants"("p_restaurant_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_purge_history_for_restaurants"("p_restaurant_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_kit"("p_restaurant_id" "uuid", "p_user_id" "uuid", "p_kit_id" "uuid", "p_levels" "text"[], "p_extra_template_ids" "uuid"[], "p_fallback_area" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_kit"("p_restaurant_id" "uuid", "p_user_id" "uuid", "p_kit_id" "uuid", "p_levels" "text"[], "p_extra_template_ids" "uuid"[], "p_fallback_area" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."assert_task_exists"() TO "anon";
GRANT ALL ON FUNCTION "public"."assert_task_exists"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_task_exists"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."expired_evidence_photo_paths"("retention_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expired_evidence_photo_paths"("retention_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_history_assumption"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_history_assumption"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_history_assumption"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_history_task_exec"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_history_task_exec"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_history_task_exec"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_history_task_issue"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_history_task_issue"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_history_task_issue"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."history_is_locked"("p_assumption_id" "uuid", "p_checklist_id" "uuid", "p_user_id" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."history_is_locked"("p_assumption_id" "uuid", "p_checklist_id" "uuid", "p_user_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."history_is_locked"("p_assumption_id" "uuid", "p_checklist_id" "uuid", "p_user_id" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."history_mutation_allowed"() TO "anon";
GRANT ALL ON FUNCTION "public"."history_mutation_allowed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."history_mutation_allowed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."instantiate_receiving_execution"("p_restaurant_id" "uuid", "p_template_id" "uuid", "p_supplier_id" "uuid", "p_user_id" "uuid", "p_user_name" "text", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."instantiate_receiving_execution"("p_restaurant_id" "uuid", "p_template_id" "uuid", "p_supplier_id" "uuid", "p_user_id" "uuid", "p_user_name" "text", "p_idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_restaurant_member"("rid" "uuid", "required_roles" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_restaurant_member"("rid" "uuid", "required_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_restaurant_member"("rid" "uuid", "required_roles" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_evidence_photo_refs"("p_paths" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_evidence_photo_refs"("p_paths" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_expired_history"("retention_days" integer, "dry_run" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_expired_history"("retention_days" integer, "dry_run" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."replace_receiving_template_tasks"("p_template_id" "uuid", "p_restaurant_id" "uuid", "p_tasks" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replace_receiving_template_tasks"("p_template_id" "uuid", "p_restaurant_id" "uuid", "p_tasks" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."replicate_checklists"("p_checklist_ids" "uuid"[], "p_target_restaurant_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replicate_checklists"("p_checklist_ids" "uuid"[], "p_target_restaurant_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."replicate_checklists"("p_checklist_ids" "uuid"[], "p_target_restaurant_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."report_task_issue_tx"("p_issue_id" "uuid", "p_restaurant_id" "uuid", "p_task_id" "uuid", "p_checklist_id" "uuid", "p_checklist_assumption_id" "uuid", "p_task_execution_id" "uuid", "p_reported_by" "uuid", "p_description" "text", "p_photos" "text"[], "p_severity" "text", "p_actor_user_id" "uuid", "p_event_type" "text", "p_dedup_key" "text", "p_payload" "jsonb", "p_payload_version" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_admin_notification_outbox_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_notification_outbox_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_notification_outbox_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_admin_notification_recipients_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_notification_recipients_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_notification_recipients_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_job_state_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_job_state_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_job_state_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_leads_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_leads_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_leads_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."signup_create_restaurant"("p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_rest_name" "text", "p_rest_slug" "text", "p_cnpj" "text", "p_phone" "text", "p_cep" "text", "p_address" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."signup_create_restaurant"("p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_rest_name" "text", "p_rest_slug" "text", "p_cnpj" "text", "p_phone" "text", "p_cep" "text", "p_address" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."signup_create_restaurant"("p_user_id" "uuid", "p_email" "text", "p_name" "text", "p_rest_name" "text", "p_rest_slug" "text", "p_cnpj" "text", "p_phone" "text", "p_cep" "text", "p_address" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_checklist_templates_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_checklist_templates_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_checklist_templates_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_receiving_templates_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_receiving_templates_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_receiving_templates_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_template_kits_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_template_kits_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_template_kits_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_task_issues_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_task_issues_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_task_issues_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."undo_kit_application"("p_restaurant_id" "uuid", "p_checklist_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."undo_kit_application"("p_restaurant_id" "uuid", "p_checklist_ids" "uuid"[]) TO "service_role";


















GRANT ALL ON TABLE "public"."account_users" TO "anon";
GRANT ALL ON TABLE "public"."account_users" TO "authenticated";
GRANT ALL ON TABLE "public"."account_users" TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."admin_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_logs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_notification_outbox" TO "anon";
GRANT ALL ON TABLE "public"."admin_notification_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notification_outbox" TO "service_role";



GRANT ALL ON TABLE "public"."admin_notification_recipients" TO "anon";
GRANT ALL ON TABLE "public"."admin_notification_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notification_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."admin_notification_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."admin_notification_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notification_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."areas" TO "anon";
GRANT ALL ON TABLE "public"."areas" TO "authenticated";
GRANT ALL ON TABLE "public"."areas" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_assumptions" TO "anon";
GRANT ALL ON TABLE "public"."checklist_assumptions" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_assumptions" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_orders" TO "anon";
GRANT ALL ON TABLE "public"."checklist_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_orders" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_shifts" TO "anon";
GRANT ALL ON TABLE "public"."checklist_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_tasks" TO "anon";
GRANT ALL ON TABLE "public"."checklist_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_template_items" TO "anon";
GRANT ALL ON TABLE "public"."checklist_template_items" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_template_items" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_templates" TO "anon";
GRANT ALL ON TABLE "public"."checklist_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_templates" TO "service_role";



GRANT ALL ON TABLE "public"."checklists" TO "anon";
GRANT ALL ON TABLE "public"."checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."checklists" TO "service_role";



GRANT ALL ON TABLE "public"."data_export_events" TO "anon";
GRANT ALL ON TABLE "public"."data_export_events" TO "authenticated";
GRANT ALL ON TABLE "public"."data_export_events" TO "service_role";



GRANT ALL ON TABLE "public"."domain_events" TO "service_role";



GRANT ALL ON TABLE "public"."event_logs" TO "anon";
GRANT ALL ON TABLE "public"."event_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."event_logs" TO "service_role";



GRANT ALL ON TABLE "public"."job_runs" TO "service_role";



GRANT ALL ON TABLE "public"."job_state" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."migration_logs" TO "anon";
GRANT ALL ON TABLE "public"."migration_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."migration_logs" TO "service_role";



GRANT ALL ON TABLE "public"."notification_channels" TO "anon";
GRANT ALL ON TABLE "public"."notification_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_channels" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT UPDATE("read") ON TABLE "public"."notifications" TO "authenticated";



GRANT UPDATE("read_at") ON TABLE "public"."notifications" TO "authenticated";



GRANT ALL ON TABLE "public"."operational_alerts" TO "anon";
GRANT ALL ON TABLE "public"."operational_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."operational_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."ordemnamesa_staff" TO "anon";
GRANT ALL ON TABLE "public"."ordemnamesa_staff" TO "authenticated";
GRANT ALL ON TABLE "public"."ordemnamesa_staff" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."receiving_template_shifts" TO "anon";
GRANT ALL ON TABLE "public"."receiving_template_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."receiving_template_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."receiving_template_tasks" TO "anon";
GRANT ALL ON TABLE "public"."receiving_template_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."receiving_template_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."receiving_templates" TO "anon";
GRANT ALL ON TABLE "public"."receiving_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."receiving_templates" TO "service_role";



GRANT ALL ON TABLE "public"."restaurant_users" TO "anon";
GRANT ALL ON TABLE "public"."restaurant_users" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurant_users" TO "service_role";



GRANT ALL ON TABLE "public"."restaurants" TO "anon";
GRANT ALL ON TABLE "public"."restaurants" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurants" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."shifts" TO "anon";
GRANT ALL ON TABLE "public"."shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."shifts" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_events" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."task_executions" TO "anon";
GRANT ALL ON TABLE "public"."task_executions" TO "authenticated";
GRANT ALL ON TABLE "public"."task_executions" TO "service_role";



GRANT ALL ON TABLE "public"."task_issue_events" TO "anon";
GRANT ALL ON TABLE "public"."task_issue_events" TO "authenticated";
GRANT ALL ON TABLE "public"."task_issue_events" TO "service_role";



GRANT ALL ON TABLE "public"."task_issues" TO "anon";
GRANT ALL ON TABLE "public"."task_issues" TO "authenticated";
GRANT ALL ON TABLE "public"."task_issues" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_link_tokens" TO "anon";
GRANT ALL ON TABLE "public"."telegram_link_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_link_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."template_kit_items" TO "anon";
GRANT ALL ON TABLE "public"."template_kit_items" TO "authenticated";
GRANT ALL ON TABLE "public"."template_kit_items" TO "service_role";



GRANT ALL ON TABLE "public"."template_kits" TO "anon";
GRANT ALL ON TABLE "public"."template_kits" TO "authenticated";
GRANT ALL ON TABLE "public"."template_kits" TO "service_role";



GRANT ALL ON TABLE "public"."user_areas" TO "anon";
GRANT ALL ON TABLE "public"."user_areas" TO "authenticated";
GRANT ALL ON TABLE "public"."user_areas" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_shifts" TO "anon";
GRANT ALL ON TABLE "public"."user_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































