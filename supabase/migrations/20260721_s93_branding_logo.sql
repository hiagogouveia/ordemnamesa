-- Sprint 93 — White-label parcial: logo por restaurante/filial
--
-- Contexto: `restaurants.logo_url` já existia e já era LIDA em 4 call-sites
-- (selecionar-restaurante, PDF de rotinas, PDF de auditoria, /api/my-restaurants),
-- mas nunca foi ESCRITA — não havia UI de upload. 0 de 9 restaurantes têm logo.
--
-- Duas decisões desta migration:
--
-- 1) PERSISTIMOS O PATH DO STORAGE, NÃO A URL COMPLETA.
--    PROD e NONPROD são projetos Supabase distintos. Uma URL completa embute o host
--    do projeto, então restaurar um dump de PROD em NONPROD faria o NONPROD servir
--    imagens do bucket de PROD — vazamento cross-ambiente silencioso. Com path puro,
--    a URL é montada em runtime a partir de NEXT_PUBLIC_SUPABASE_URL.
--    Bônus: validar "este path é do meu tenant" vira um startsWith, sem parsear
--    URL controlada pelo cliente.
--
-- 2) EXPAND/CONTRACT, NÃO RENAME.
--    Migration e deploy do app não são atômicos (app-prod.yml). Um RENAME COLUMN que
--    chegasse antes do deploy faria /api/my-restaurants dar 500 em `select logo_url`,
--    quebrando o fluxo de login/seleção em produção. Portanto: ADICIONAMOS logo_path
--    e deixamos logo_url intocada e morta. O DROP vem numa migration de limpeza na
--    sprint seguinte, depois do deploy estabilizar.
--
-- Cascata de marca (resolvida na aplicação, lib/branding/resolve.ts):
--    restaurants.logo_path → accounts.logo_path → /logo-icon.png (plataforma)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Colunas
-- ─────────────────────────────────────────────────────────────────────────────

-- Path relativo dentro do bucket 'brand', ex.:
--   {account_id}/{restaurant_id}/logo-{hash8}.png
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS logo_path text;

-- Logo do GRUPO. Fallback das filiais que não tiverem logo própria e única marca
-- possível na Visão Global (onde não existe filial única). Ex.:
--   {account_id}/account/logo-{hash8}.png
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS logo_path text;

COMMENT ON COLUMN public.restaurants.logo_path IS
  's93 — path no bucket ''brand'' (NÃO url). URL montada em runtime por lib/branding/storage.ts.';
COMMENT ON COLUMN public.accounts.logo_path IS
  's93 — logo do grupo; fallback das filiais sem logo própria e marca da Visão Global.';
COMMENT ON COLUMN public.restaurants.logo_url IS
  's93 — DEPRECADA (nunca foi escrita). Substituída por logo_path. DROP previsto na s94.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Predicado de autorização — espelha is_restaurant_member (s78)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Branding é operação de dono da CONTA, não da unidade: quem sobe a logo do grupo
-- não está agindo sobre um restaurant_id específico. Por isso o predicado é por
-- account, e não reaproveita is_restaurant_member.

CREATE OR REPLACE FUNCTION public.is_account_owner(aid uuid)
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
      AND au.role = 'owner'
  );
$$;

COMMENT ON FUNCTION public.is_account_owner(uuid) IS
  's93 — true se o usuário da sessão é owner ATIVO da account. Usado nas policies do bucket ''brand''.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Bucket 'brand'
-- ─────────────────────────────────────────────────────────────────────────────
--
-- PÚBLICO, por decisão consciente. Logo é ativo de marca de baixa sensibilidade,
-- exibido a todo o staff. Signed URL quebraria a CDN, o next/image e a geração de
-- PDF (que embute a imagem como data URL). O isolamento multi-tenant é garantido em
-- duas camadas que continuam valendo:
--   a) ESCRITA — as policies abaixo só permitem gravar sob o próprio account_id;
--   b) DESCOBERTA — o path só chega ao cliente via restaurants/accounts, protegidos
--      por RLS. Um restaurante nunca vê a referência da logo de outro.
--
-- SVG fica FORA do allowlist de propósito: (a) SVG em bucket público é vetor de XSS
-- (pode conter <script>); (b) @react-pdf/renderer não renderiza SVG em <Image>, o que
-- quebraria os PDFs em silêncio. O upload normaliza tudo para PNG no client.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand',
  'brand',
  true,
  5242880,                                              -- 5 MB (teto de ENTRADA, pré-normalização)
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Policies de escrita — mesma forma das policies do bucket 'photos' (s78)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O 1º segmento do path é SEMPRE o account_id, justamente para a RLS conseguir
-- validar o tenant sem consultar nenhuma outra tabela. O regex de UUID impede que
-- um path malformado (ou com '..') passe pelo cast.
--
-- Não há policy de SELECT: bucket público é servido pelo endpoint /object/public/
-- sem passar por RLS.

DROP POLICY IF EXISTS "Account owners can upload brand assets" ON storage.objects;
CREATE POLICY "Account owners can upload brand assets"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'brand'
        AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND public.is_account_owner(((storage.foldername(name))[1])::uuid)
    );

DROP POLICY IF EXISTS "Account owners can update brand assets" ON storage.objects;
CREATE POLICY "Account owners can update brand assets"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'brand'
        AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND public.is_account_owner(((storage.foldername(name))[1])::uuid)
    );

DROP POLICY IF EXISTS "Account owners can delete brand assets" ON storage.objects;
CREATE POLICY "Account owners can delete brand assets"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'brand'
        AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND public.is_account_owner(((storage.foldername(name))[1])::uuid)
    );

COMMIT;
