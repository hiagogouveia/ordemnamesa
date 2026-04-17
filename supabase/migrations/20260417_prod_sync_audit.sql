-- ============================================================
-- PRODUÇÃO — Script de Sincronização NONPROD → PROD
-- ============================================================
-- Data: 2026-04-17
-- Autor: Auditoria automatizada
--
-- Este script aplica TODAS as diferenças encontradas entre
-- NONPROD e PROD, na ordem correta de dependências.
--
-- ⚠️  EXECUTAR EM TRANSAÇÃO (BEGIN/COMMIT) — Supabase Dashboard
--     já envolve queries em transação automática.
--
-- ⚠️  FAZER BACKUP ANTES DE EXECUTAR.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- FASE 1: CRIAÇÃO DE TABELAS (sem dependências externas)
-- ════════════════════════════════════════════════════════════

-- 1.1 — Tabela accounts (tenant de topo)
CREATE TABLE IF NOT EXISTS public.accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  plan_id     uuid NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 1.2 — Tabela account_users (vínculo user ↔ account)
CREATE TABLE IF NOT EXISTS public.account_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('owner','manager')),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  can_view_global boolean NOT NULL DEFAULT false,
  UNIQUE (account_id, user_id)
);

-- Índices de account_users
CREATE INDEX IF NOT EXISTS account_users_user_idx
  ON public.account_users (user_id) WHERE active = true;

CREATE INDEX IF NOT EXISTS account_users_account_idx
  ON public.account_users (account_id) WHERE active = true;

-- ════════════════════════════════════════════════════════════
-- FASE 2: COLUNAS NOVAS EM TABELAS EXISTENTES
-- ════════════════════════════════════════════════════════════

-- 2.1 — restaurants: account_id (inicialmente NULL para backfill)
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS account_id  uuid NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS is_primary  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz NULL;

-- 2.2 — checklists: colunas de linhagem para replicação
ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS source_checklist_id uuid NULL
    REFERENCES public.checklists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS root_source_checklist_id uuid NULL
    REFERENCES public.checklists(id) ON DELETE SET NULL;

-- ════════════════════════════════════════════════════════════
-- FASE 3: BACKFILL (preencher dados antes de endurecer constraints)
-- ════════════════════════════════════════════════════════════

-- Extensão necessária para UUIDs determinísticos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3.1 — Criar uma account para cada restaurant existente (1:1)
--        UUID determinístico garante idempotência em re-execuções
INSERT INTO public.accounts (id, name)
SELECT
  uuid_generate_v5(
    '00000000-0000-0000-0000-000000000001'::uuid,
    'restaurant:' || r.id::text
  ) AS id,
  COALESCE(NULLIF(r.name, ''), 'Account') AS name
FROM public.restaurants r
WHERE r.account_id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 3.2 — Vincular cada restaurant à sua account + marcar como primário
UPDATE public.restaurants r
   SET account_id = uuid_generate_v5(
                      '00000000-0000-0000-0000-000000000001'::uuid,
                      'restaurant:' || r.id::text
                    ),
       is_primary = true
 WHERE r.account_id IS NULL;

-- 3.3 — Criar memberships de owner na account_users
INSERT INTO public.account_users (account_id, user_id, role, active, can_view_global)
SELECT r.account_id, r.owner_id, 'owner', true, true
  FROM public.restaurants r
 WHERE r.owner_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.account_users au
      WHERE au.account_id = r.account_id
        AND au.user_id   = r.owner_id
   );

-- ════════════════════════════════════════════════════════════
-- FASE 4: ENDURECER CONSTRAINTS (após backfill garantir dados)
-- ════════════════════════════════════════════════════════════

-- 4.1 — restaurants.account_id → NOT NULL
ALTER TABLE public.restaurants ALTER COLUMN account_id SET NOT NULL;

-- 4.2 — CNPJ: trocar unique simples por unique parcial (ativos)
ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_cnpj_key;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_cnpj_active_unique
  ON public.restaurants (cnpj)
  WHERE cnpj IS NOT NULL AND active = true;

-- 4.3 — Apenas 1 restaurant primário por account ativa
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_one_primary_per_account
  ON public.restaurants (account_id)
  WHERE is_primary = true AND active = true;

-- ════════════════════════════════════════════════════════════
-- FASE 5: ÍNDICES DE PERFORMANCE
-- ════════════════════════════════════════════════════════════

-- checklists: busca por root_source para idempotência de replicação
CREATE INDEX IF NOT EXISTS checklists_root_source_idx
  ON public.checklists (restaurant_id, root_source_checklist_id)
  WHERE root_source_checklist_id IS NOT NULL;

-- task_executions: dashboard por restaurant + range de data
CREATE INDEX IF NOT EXISTS idx_task_executions_restaurant_executed
  ON public.task_executions (restaurant_id, executed_at);

-- shifts: filtro por restaurant + ativos
CREATE INDEX IF NOT EXISTS idx_shifts_restaurant_active
  ON public.shifts (restaurant_id)
  WHERE active = true;

-- restaurant_users: otimizar RLS subqueries
CREATE INDEX IF NOT EXISTS idx_restaurant_users_userid_active
  ON public.restaurant_users (user_id, restaurant_id)
  WHERE active = true;

-- ════════════════════════════════════════════════════════════
-- FASE 6: RLS — HABILITAR + POLICIES
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_users  ENABLE ROW LEVEL SECURITY;

-- ── accounts ──
DROP POLICY IF EXISTS "accounts: membros veem"   ON public.accounts;
DROP POLICY IF EXISTS "accounts: owner atualiza" ON public.accounts;

CREATE POLICY "accounts: membros veem"
  ON public.accounts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.account_users au
     WHERE au.account_id = accounts.id
       AND au.user_id    = auth.uid()
       AND au.active     = true
  ));

CREATE POLICY "accounts: owner atualiza"
  ON public.accounts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.account_users au
     WHERE au.account_id = accounts.id
       AND au.user_id    = auth.uid()
       AND au.role       = 'owner'
       AND au.active     = true
  ));

-- ── account_users ──
DROP POLICY IF EXISTS "account_users: proprio ou owner" ON public.account_users;
DROP POLICY IF EXISTS "account_users: owner insere"     ON public.account_users;
DROP POLICY IF EXISTS "account_users: owner atualiza"   ON public.account_users;
DROP POLICY IF EXISTS "account_users: owner deleta"     ON public.account_users;

CREATE POLICY "account_users: proprio ou owner"
  ON public.account_users FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.account_users owner_row
       WHERE owner_row.account_id = account_users.account_id
         AND owner_row.user_id    = auth.uid()
         AND owner_row.role       = 'owner'
         AND owner_row.active     = true
    )
  );

CREATE POLICY "account_users: owner insere"
  ON public.account_users FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.account_users owner_row
     WHERE owner_row.account_id = account_users.account_id
       AND owner_row.user_id    = auth.uid()
       AND owner_row.role       = 'owner'
       AND owner_row.active     = true
  ));

CREATE POLICY "account_users: owner atualiza"
  ON public.account_users FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.account_users owner_row
     WHERE owner_row.account_id = account_users.account_id
       AND owner_row.user_id    = auth.uid()
       AND owner_row.role       = 'owner'
       AND owner_row.active     = true
  ));

CREATE POLICY "account_users: owner deleta"
  ON public.account_users FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.account_users owner_row
     WHERE owner_row.account_id = account_users.account_id
       AND owner_row.user_id    = auth.uid()
       AND owner_row.role       = 'owner'
       AND owner_row.active     = true
  ));

-- ── restaurants: policies aditivas para account ──
DROP POLICY IF EXISTS "restaurants: membro da account insere"  ON public.restaurants;
DROP POLICY IF EXISTS "restaurants: owner da account atualiza" ON public.restaurants;

CREATE POLICY "restaurants: membro da account insere"
  ON public.restaurants FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.account_users au
     WHERE au.account_id = restaurants.account_id
       AND au.user_id    = auth.uid()
       AND au.active     = true
  ));

CREATE POLICY "restaurants: owner da account atualiza"
  ON public.restaurants FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.account_users au
     WHERE au.account_id = restaurants.account_id
       AND au.user_id    = auth.uid()
       AND au.role       = 'owner'
       AND au.active     = true
  ));

-- ════════════════════════════════════════════════════════════
-- FASE 7: ATUALIZAR FUNÇÃO replicate_checklists
-- ════════════════════════════════════════════════════════════
-- A função já existe em PROD (com fix min(uuid)), mas precisa
-- ser recriada para garantir consistência com NONPROD.
-- Já inclui o fix de min(uuid)::text::uuid.

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

    SELECT array_agg(DISTINCT c.restaurant_id)
      INTO v_src_rids
      FROM public.checklists c
     WHERE c.id = ANY(p_checklist_ids);

    IF coalesce(array_length(v_src_rids, 1), 0) = 0 THEN
        RAISE EXCEPTION 'Checklists de origem não encontrados' USING ERRCODE = 'P0002';
    END IF;

    v_all_rids := v_src_rids || p_target_restaurant_ids;

    -- CORREÇÃO: min(uuid) não existe → cast para text antes de agregar.
    SELECT count(DISTINCT r.account_id), min(r.account_id::text)::uuid
      INTO v_acct_count, v_account
      FROM public.restaurants r
     WHERE r.id = ANY(v_all_rids);

    IF v_acct_count IS NULL OR v_acct_count <> 1 THEN
        RAISE EXCEPTION 'Todas as unidades devem pertencer à mesma account'
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
$$;

REVOKE EXECUTE ON FUNCTION public.replicate_checklists(uuid[], uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.replicate_checklists(uuid[], uuid[]) TO authenticated;

-- ════════════════════════════════════════════════════════════
-- FASE 8: LOG DE MIGRAÇÃO
-- ════════════════════════════════════════════════════════════
INSERT INTO public.migration_logs (action)
VALUES ('prod_sync_nonprod_accounts_replication_performance_globalview');

-- ════════════════════════════════════════════════════════════
-- FIM DO SCRIPT
-- ════════════════════════════════════════════════════════════
