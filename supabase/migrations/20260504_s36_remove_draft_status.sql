-- s36: Remove o conceito de 'draft' do status de checklists.
-- Estados restantes: 'active' | 'archived'.
--
-- Pré-requisitos (DML que precede esta migration, executado manualmente em
-- cada ambiente conforme política):
--   - Drafts sem tasks E sem assumptions: DELETE
--   - Drafts com tasks: UPDATE status='archived', active=false
--
-- Esta migration falha por design se ainda houver linhas com status='draft'.

DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_remaining FROM checklists WHERE status = 'draft';
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'Existem % checklists com status=draft. Migrar dados antes do ALTER.', v_remaining;
  END IF;
END $$;

ALTER TABLE checklists
  DROP CONSTRAINT IF EXISTS checklists_status_check;

ALTER TABLE checklists
  ADD CONSTRAINT checklists_status_check
  CHECK (status IN ('active', 'archived'));
