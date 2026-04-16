-- ============================================================
-- Sprint 28 — Backfill idempotente de Accounts
-- ============================================================
-- Estratégia 1:1: uma account por restaurant existente.
-- UUIDs determinísticos (uuid_generate_v5) garantem idempotência
-- mesmo em re-execuções.
-- ============================================================

-- Safety net: extensão uuid-ossp (já instalada em Supabase padrão)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Cria accounts para restaurants órfãos (account_id NULL).
--    O id da account é derivado do id do restaurant via uuid_generate_v5.
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

-- 2. Liga cada restaurant órfão à sua account + marca como principal.
UPDATE public.restaurants r
   SET account_id = uuid_generate_v5(
                      '00000000-0000-0000-0000-000000000001'::uuid,
                      'restaurant:' || r.id::text
                    ),
       is_primary = true
 WHERE r.account_id IS NULL;

-- 3. Memberships owner idempotentes a partir do owner_id atual.
INSERT INTO public.account_users (account_id, user_id, role, active)
SELECT r.account_id, r.owner_id, 'owner', true
  FROM public.restaurants r
 WHERE r.owner_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.account_users au
      WHERE au.account_id = r.account_id
        AND au.user_id   = r.owner_id
   );

-- 4. Endurece o contrato: todo restaurant precisa pertencer a uma account.
ALTER TABLE public.restaurants ALTER COLUMN account_id SET NOT NULL;
