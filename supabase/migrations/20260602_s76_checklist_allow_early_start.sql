-- 20260602_s76_checklist_allow_early_start.sql
-- Opção opcional por rotina: permitir iniciar antes do start_time da janela de horário.
-- Default false mantém o comportamento padrão (rotina bloqueada antes do start_time).
BEGIN;

ALTER TABLE public.checklists
ADD COLUMN IF NOT EXISTS allow_early_start BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.checklists.allow_early_start IS
  'Se true, permite iniciar a rotina antes do start_time (janela de horário). Default false mantém o bloqueio padrão.';

COMMIT;
