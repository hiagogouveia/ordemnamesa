-- ============================================================
-- Sprint 28 — RLS de Accounts / Account_Users
-- ============================================================
-- Políticas de segurança aditivas. Não removemos policies
-- existentes em `restaurants`: as novas cobrem mutações que
-- envolvem `account_id` e convivem com as existentes baseadas
-- em `restaurant_users`.
-- ============================================================

ALTER TABLE public.accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_users  ENABLE ROW LEVEL SECURITY;

-- ── ACCOUNTS ────────────────────────────────────────────────
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

-- ── ACCOUNT_USERS ───────────────────────────────────────────
DROP POLICY IF EXISTS "account_users: proprio ou owner"       ON public.account_users;
DROP POLICY IF EXISTS "account_users: owner insere"           ON public.account_users;
DROP POLICY IF EXISTS "account_users: owner atualiza"         ON public.account_users;
DROP POLICY IF EXISTS "account_users: owner deleta"           ON public.account_users;

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

-- ── RESTAURANTS: políticas aditivas amarrando mutação à account ──
DROP POLICY IF EXISTS "restaurants: membro da account insere"    ON public.restaurants;
DROP POLICY IF EXISTS "restaurants: owner da account atualiza"   ON public.restaurants;

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
