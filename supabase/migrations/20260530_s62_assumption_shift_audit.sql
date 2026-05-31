-- Sprint 62 — Auditoria de turno na execução (req #10)
-- Ao registrar a execução de uma rotina (checklist_assumptions), preservar um
-- snapshot do turno envolvido, para que o histórico permaneça auditável mesmo
-- que o colaborador seja movido de turno ou o turno da rotina mude depois.
--
--   assumption_shift_id        -> turno da rotina no momento da assunção.
--   assumption_user_shift_ids  -> turnos do colaborador naquele momento.
--
-- Decisão de modelagem (baixa duplicação): snapshot direto na própria linha de
-- execução, em vez de tabela de histórico dedicada. assumption_shift_id usa FK
-- com ON DELETE SET NULL (turno excluído não apaga a execução). Já
-- assumption_user_shift_ids é um array puro de uuid SEM FK — é um snapshot
-- histórico imutável; não deve "seguir" alterações futuras de user_shifts.
-- Ambas nullable: rows legadas e a RPC de receiving (s59) permanecem válidas.

BEGIN;

ALTER TABLE public.checklist_assumptions
  ADD COLUMN IF NOT EXISTS assumption_shift_id uuid NULL
    REFERENCES public.shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assumption_user_shift_ids uuid[] NULL;

COMMENT ON COLUMN public.checklist_assumptions.assumption_shift_id IS
  'Snapshot: shift_id da rotina no momento em que foi assumida (NULL = rotina global ou row legada).';
COMMENT ON COLUMN public.checklist_assumptions.assumption_user_shift_ids IS
  'Snapshot: turnos (shifts.id) do colaborador no momento da assunção. Array puro, sem FK (histórico imutável).';

COMMIT;
