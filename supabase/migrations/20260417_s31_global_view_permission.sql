-- Fase 1: Adicionar campo can_view_global em account_users
-- Owner sempre tem acesso (app logic), manager precisa de permissão explícita

ALTER TABLE public.account_users
  ADD COLUMN IF NOT EXISTS can_view_global boolean NOT NULL DEFAULT false;

-- Backfill: owners sempre têm acesso global
UPDATE public.account_users SET can_view_global = true WHERE role = 'owner';
