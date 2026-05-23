-- s47: hotfix drift RU↔AU + owner sempre global
-- Backfill universal de account_users a partir de restaurant_users + invariante owner.can_view_global=true.
-- Idempotente e aditivo (não deleta nem reativa linhas existentes).

-- A) Backfill universal: RU(owner|manager, active=true) sem AU correspondente
INSERT INTO public.account_users (account_id, user_id, role, active, can_view_global)
SELECT r.account_id, ru.user_id,
       CASE WHEN BOOL_OR(ru.role='owner') THEN 'owner' ELSE 'manager' END AS role,
       true,
       CASE WHEN BOOL_OR(ru.role='owner') THEN true ELSE false END AS can_view_global
  FROM public.restaurant_users ru
  JOIN public.restaurants r ON r.id = ru.restaurant_id
 WHERE ru.active = true
   AND ru.role IN ('owner','manager')
   AND NOT EXISTS (
     SELECT 1 FROM public.account_users au
      WHERE au.account_id = r.account_id
        AND au.user_id  = ru.user_id
        AND au.active   = true
   )
 GROUP BY r.account_id, ru.user_id
ON CONFLICT (account_id, user_id) DO NOTHING;

-- B) Corrigir owners com flag false
UPDATE public.account_users
   SET can_view_global = true
 WHERE role = 'owner' AND can_view_global = false;

-- C) Invariante via CHECK constraint (nome explícito)
ALTER TABLE public.account_users
  DROP CONSTRAINT IF EXISTS account_users_owner_must_view_global;
ALTER TABLE public.account_users
  ADD CONSTRAINT account_users_owner_must_view_global
  CHECK (role <> 'owner' OR can_view_global = true);
