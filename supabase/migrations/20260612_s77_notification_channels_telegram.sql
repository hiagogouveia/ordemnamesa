-- ============================================================
-- Sprint 77 — Notification channels + Telegram link tokens
-- ============================================================
-- Fase 1 da integração com canais externos de notificação.
-- Cria a infraestrutura de VÍNCULO (não envia alertas ainda).
--
-- notification_channels: canal externo de um usuário, preparado para
--   múltiplos tipos (telegram | whatsapp | email). Escopo global por
--   usuário (restaurant_id NULL) — o chat pertence à pessoa, não ao
--   restaurante. external_id guarda o telegram chat id (string).
--
-- telegram_link_tokens: token temporário de uso único para vincular o
--   Telegram com segurança (sem vínculo por e-mail). O usuário envia
--   "/start TOKEN" ao bot da plataforma; o webhook valida e materializa
--   o canal.
--
-- RLS: por propriedade do usuário (user_id = auth.uid()). As operações
--   reais passam por API routes com service-role; as policies são defesa
--   em profundidade.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- notification_channels
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_channels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE, -- nullable: global por usuário
  channel_type  text NOT NULL CHECK (channel_type IN ('telegram','whatsapp','email')),
  external_id   text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 1 canal global por (user, tipo) quando restaurant_id IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS notification_channels_user_type_global_uniq
  ON public.notification_channels (user_id, channel_type)
  WHERE restaurant_id IS NULL;

-- Lookup reverso por chat id (futuro: roteamento de updates de entrada).
CREATE INDEX IF NOT EXISTS notification_channels_external_idx
  ON public.notification_channels (channel_type, external_id);

COMMENT ON TABLE public.notification_channels IS
  'Canais externos de notificação por usuário (telegram|whatsapp|email). restaurant_id NULL = global. external_id = chat id / phone / email.';

-- ------------------------------------------------------------
-- telegram_link_tokens
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_link_tokens_token_idx
  ON public.telegram_link_tokens (token);

COMMENT ON TABLE public.telegram_link_tokens IS
  'Tokens temporários de uso único para vincular o Telegram via "/start TOKEN". Validado pelo webhook.';

-- ------------------------------------------------------------
-- RLS — propriedade do usuário (defesa em profundidade)
-- ------------------------------------------------------------
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_channels: owner rows" ON public.notification_channels;
CREATE POLICY "notification_channels: owner rows" ON public.notification_channels
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "telegram_link_tokens: owner rows" ON public.telegram_link_tokens;
CREATE POLICY "telegram_link_tokens: owner rows" ON public.telegram_link_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;
