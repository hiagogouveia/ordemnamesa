-- ============================================================
-- Sprint 12 — Signup: campos adicionais em restaurants + RPC
-- ============================================================

-- ── CAMPOS ADICIONAIS EM RESTAURANTS ──────────────────────
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS cnpj    text UNIQUE,
  ADD COLUMN IF NOT EXISTS phone   text,
  ADD COLUMN IF NOT EXISTS cep     text,
  ADD COLUMN IF NOT EXISTS address text;

-- ── RPC: signup_create_restaurant ─────────────────────────
-- Cria restaurante + vínculo owner em uma única transação PG.
-- SECURITY DEFINER garante execução com privilégios elevados,
-- contornando RLS sem expor service role key ao client.
-- Chamado apenas pelo endpoint /api/signup via service role.

CREATE OR REPLACE FUNCTION public.signup_create_restaurant(
  p_user_id   uuid,
  p_email     text,
  p_name      text,
  p_rest_name text,
  p_rest_slug text,
  p_cnpj      text DEFAULT NULL,
  p_phone     text DEFAULT NULL,
  p_cep       text DEFAULT NULL,
  p_address   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid;
BEGIN
  -- Garantir row em public.users (trigger on_auth_user_created já faz isso,
  -- mas upsert como safety net caso haja race condition marginal)
  INSERT INTO public.users (id, email, name)
  VALUES (p_user_id, p_email, p_name)
  ON CONFLICT (id) DO NOTHING;

  -- Criar restaurante (atômico com restaurant_users abaixo)
  INSERT INTO public.restaurants (name, slug, owner_id, cnpj, phone, cep, address)
  VALUES (p_rest_name, p_rest_slug, p_user_id, p_cnpj, p_phone, p_cep, p_address)
  RETURNING id INTO v_restaurant_id;

  -- Criar vínculo owner
  INSERT INTO public.restaurant_users (restaurant_id, user_id, role, active)
  VALUES (v_restaurant_id, p_user_id, 'owner', true);

  RETURN v_restaurant_id;
END;
$$;

-- Revogar acesso público; apenas service_role pode executar
REVOKE ALL ON FUNCTION public.signup_create_restaurant(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_create_restaurant(uuid, text, text, text, text, text, text, text, text) TO service_role;
