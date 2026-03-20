-- Sprint 11 fix: adiciona 'custom' ao constraint de recorrência
-- O Sprint 8 adicionou recurrence_config para recorrências customizadas
-- mas esqueceu de atualizar o constraint para incluir 'custom' como valor válido

ALTER TABLE checklists DROP CONSTRAINT checklists_recurrence_check;

ALTER TABLE checklists
  ADD CONSTRAINT checklists_recurrence_check
  CHECK (recurrence IN ('none','daily','weekly','monthly','yearly','weekdays','custom'));
