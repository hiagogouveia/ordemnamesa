-- admin-notifications: notificações administrativas por e-mail (novos leads)
-- Sprint 87 - destinatários geridos pelo Control Hub + outbox com retry/dedup
--
-- Modelagem relacional: recipients (destinatários) + subscriptions (inscrições por
-- evento) + outbox (fila de envio, dedup e auditoria). Global (não tenant-scoped).
-- RLS enabled sem políticas para anon/authenticated → acesso só via service_role.

-- ============================================================================
-- 1. admin_notification_recipients — destinatários geridos pelo painel
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_notification_recipients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    email text NOT NULL
        CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    label text,
    active boolean NOT NULL DEFAULT true,

    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Impede duplicidade de destinatário (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notification_recipients_email
    ON public.admin_notification_recipients (lower(email));

ALTER TABLE public.admin_notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_admin_notification_recipients_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_notification_recipients_set_updated_at
    ON public.admin_notification_recipients;
CREATE TRIGGER admin_notification_recipients_set_updated_at
    BEFORE UPDATE ON public.admin_notification_recipients
    FOR EACH ROW EXECUTE FUNCTION public.set_admin_notification_recipients_updated_at();

-- ============================================================================
-- 2. admin_notification_subscriptions — inscrições por evento (1 linha/evento)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_notification_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id uuid NOT NULL
        REFERENCES public.admin_notification_recipients(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Não inscreve o mesmo destinatário 2× no mesmo evento.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notification_subscriptions_recipient_event
    ON public.admin_notification_subscriptions (recipient_id, event_type);
-- Lookup do enqueue: destinatários por evento.
CREATE INDEX IF NOT EXISTS idx_admin_notification_subscriptions_event
    ON public.admin_notification_subscriptions (event_type);

ALTER TABLE public.admin_notification_subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. admin_notification_outbox — fila de envio (dedup, retry, auditoria)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_notification_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    event_type text NOT NULL,
    dedup_key text NOT NULL,
    recipient_email text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,

    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sent','failed')),
    attempts int NOT NULL DEFAULT 0,
    max_attempts int NOT NULL DEFAULT 5,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),

    last_error text,
    provider_message_id text,
    sent_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dedup: no máximo 1 e-mail por evento+entidade+destinatário.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notification_outbox_dedup
    ON public.admin_notification_outbox (event_type, dedup_key, recipient_email);
-- Varredura do cron por pendências elegíveis.
CREATE INDEX IF NOT EXISTS idx_admin_notification_outbox_status_next
    ON public.admin_notification_outbox (status, next_attempt_at);

ALTER TABLE public.admin_notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_admin_notification_outbox_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_notification_outbox_set_updated_at
    ON public.admin_notification_outbox;
CREATE TRIGGER admin_notification_outbox_set_updated_at
    BEFORE UPDATE ON public.admin_notification_outbox
    FOR EACH ROW EXECUTE FUNCTION public.set_admin_notification_outbox_updated_at();
