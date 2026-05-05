-- s37: Corrige default da coluna checklists.status.
--
-- Após s36, o CHECK passou a aceitar apenas ('active','archived'),
-- mas o default residual era 'draft' — qualquer INSERT que omitisse
-- o status disparava erro 23514 (check_violation).
--
-- Esta migration alinha o default ao novo domínio.

ALTER TABLE checklists
  ALTER COLUMN status SET DEFAULT 'active';
