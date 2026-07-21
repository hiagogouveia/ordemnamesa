-- Sprint 93c — Corrige recursão infinita nas policies de accounts / account_users.
--
-- Sintoma: QUALQUER leitura dessas duas tabelas por um client autenticado falha com
--   ERROR 42P17: infinite recursion detected in policy for relation "account_users"
--
-- Causa: a policy de SELECT de `account_users` subconsulta a PRÓPRIA `account_users`:
--
--   (user_id = auth.uid()) OR EXISTS (SELECT 1 FROM account_users owner_row WHERE ...)
--
-- Essa subquery é ela mesma submetida à policy de SELECT de `account_users`, que roda a
-- subquery de novo — recursão. E `accounts: membros veem` subconsulta `account_users`,
-- então é arrastada junto: `accounts` também fica ilegível.
--
-- Bug PRÉ-EXISTENTE (policies vêm da s28/s39), não introduzido pela s93. Passou
-- despercebido porque todo o app lê dados de conta por rotas com service_role, que
-- ignora RLS. A aba Marca (s93) foi a primeira leitura de `accounts` pelo client do
-- browser — e por isso o card "Logo do grupo" nunca carregava, e a Visão Global nunca
-- recebia a logo do grupo no self-heal.
--
-- Correção: mover o predicado para funções SECURITY DEFINER. Sendo owned por postgres
-- (BYPASSRLS), a consulta interna não reativa a policy — a recursão é cortada na raiz.
-- É o remédio canônico do Supabase para RLS auto-referente.
--
-- Os predicados são LOGICAMENTE IDÊNTICOS aos atuais — só mudou ONDE são avaliados.
-- Nada é afrouxado: hoje essas policies falham fechado (erro em toda leitura), então o
-- efeito prático é sair de "ninguém lê" para "só quem tem vínculo ativo lê".

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Predicado de vínculo ativo (qualquer papel). O de owner já existe: s93.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_account_member(aid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_users au
    WHERE au.account_id = aid
      AND au.user_id = auth.uid()
      AND au.active = true
  );
$$;

COMMENT ON FUNCTION public.is_account_member(uuid) IS
  's93c — true se o usuário da sessão tem vínculo ATIVO na account (qualquer papel). SECURITY DEFINER para não reativar a RLS de account_users e evitar recursão.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. account_users — quebra a auto-referência
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "account_users: proprio ou owner" ON public.account_users;
CREATE POLICY "account_users: proprio ou owner"
    ON public.account_users FOR SELECT
    USING (
        user_id = auth.uid()
        OR public.is_account_owner(account_id)
    );

DROP POLICY IF EXISTS "account_users: owner atualiza" ON public.account_users;
CREATE POLICY "account_users: owner atualiza"
    ON public.account_users FOR UPDATE
    USING (public.is_account_owner(account_id));

DROP POLICY IF EXISTS "account_users: owner deleta" ON public.account_users;
CREATE POLICY "account_users: owner deleta"
    ON public.account_users FOR DELETE
    USING (public.is_account_owner(account_id));

-- Mantém a semântica de bootstrap: criar o PRIMEIRO owner de uma account nova
-- continua exigindo service_role, porque ainda não existe owner para autorizar.
DROP POLICY IF EXISTS "account_users: owner insere" ON public.account_users;
CREATE POLICY "account_users: owner insere"
    ON public.account_users FOR INSERT
    WITH CHECK (public.is_account_owner(account_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. accounts — deixa de arrastar a recursão de account_users
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "accounts: membros veem" ON public.accounts;
CREATE POLICY "accounts: membros veem"
    ON public.accounts FOR SELECT
    USING (public.is_account_member(id));

DROP POLICY IF EXISTS "accounts: owner atualiza" ON public.accounts;
CREATE POLICY "accounts: owner atualiza"
    ON public.accounts FOR UPDATE
    USING (public.is_account_owner(id));

COMMIT;
