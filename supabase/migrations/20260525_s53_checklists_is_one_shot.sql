-- Sprint 53: instâncias descartáveis (one-shot) de checklist
--
-- Marca checklists criados ad-hoc para uso único — primeiro caso de uso é
-- "Recebimento rápido" no Meu Turno, mas o nome é genérico para reuso futuro
-- em tarefas emergenciais, contingências, manutenção corretiva etc.
--
-- One-shot é um checklist real (com tasks, assumption, executions, audit).
-- O que muda é a visibilidade: queries que listam templates/rotinas filtram
-- is_one_shot=false por padrão; opt-in via include_one_shot=true.

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS is_one_shot boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.checklists.is_one_shot IS
  'Se true, este checklist é uma instância descartável (criada ad-hoc, executada uma vez e auto-arquivada). Não aparece em listagens de templates/rotinas por padrão. Histórico preservado via checklist_assumptions.';

-- Index para acelerar filtros .eq(is_one_shot, false) em /api/receiving/templates
-- e /api/checklists GET. Partial index (only false) mantém o índice pequeno.
CREATE INDEX IF NOT EXISTS checklists_is_one_shot_false_idx
  ON public.checklists (restaurant_id)
  WHERE is_one_shot = false;
