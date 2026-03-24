-- Migration: Segurança de roles em restaurant_users
-- Substitui a política FOR ALL (owner/manager) por políticas granulares.
-- Impede escalada de privilégio mesmo via acesso direto ao banco (PostgREST / SDK com user token).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Remover política ampla existente
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "restaurant_users: owner/manager gerencia" ON public.restaurant_users;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. INSERT
--    - Owner pode inserir qualquer role
--    - Manager pode inserir apenas staff
-- ────────────────────────────────────────────────────────────────────────────
CREATE POLICY "restaurant_users: owner insere"
  ON public.restaurant_users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.restaurant_id = restaurant_users.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.role = 'owner'
        AND ru.active = true
    )
  );

CREATE POLICY "restaurant_users: manager insere staff"
  ON public.restaurant_users FOR INSERT
  WITH CHECK (
    restaurant_users.role = 'staff'
    AND EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.restaurant_id = restaurant_users.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.role = 'manager'
        AND ru.active = true
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 3. UPDATE
--    - Owner pode atualizar qualquer linha
--    - Manager pode atualizar apenas active/inactive de staff
--      (WITH CHECK garante que role não muda)
-- ────────────────────────────────────────────────────────────────────────────
CREATE POLICY "restaurant_users: owner atualiza"
  ON public.restaurant_users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.restaurant_id = restaurant_users.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.role = 'owner'
        AND ru.active = true
    )
  );

CREATE POLICY "restaurant_users: manager atualiza staff"
  ON public.restaurant_users FOR UPDATE
  USING (
    restaurant_users.role = 'staff'
    AND EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.restaurant_id = restaurant_users.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.role = 'manager'
        AND ru.active = true
    )
  )
  WITH CHECK (restaurant_users.role = 'staff');

-- ────────────────────────────────────────────────────────────────────────────
-- 4. DELETE — somente owner
-- ────────────────────────────────────────────────────────────────────────────
CREATE POLICY "restaurant_users: owner deleta"
  ON public.restaurant_users FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_users ru
      WHERE ru.restaurant_id = restaurant_users.restaurant_id
        AND ru.user_id = auth.uid()
        AND ru.role = 'owner'
        AND ru.active = true
    )
  );
