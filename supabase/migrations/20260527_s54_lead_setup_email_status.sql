-- Sprint 42: persist setup-email delivery status on leads
-- Allows admin panel to show a persistent badge ("pending / sent / failed")
-- and supports a resend action without polluting other tables.

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS setup_email_sent_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS setup_email_last_error text NULL;

COMMENT ON COLUMN public.leads.setup_email_sent_at IS
    'Timestamp do último envio bem-sucedido do e-mail de setup (definir senha) após aprovação. NULL = nunca enviado com sucesso.';
COMMENT ON COLUMN public.leads.setup_email_last_error IS
    'Razão do último erro ao tentar enviar o e-mail de setup (NULL quando o último envio foi bem-sucedido).';
