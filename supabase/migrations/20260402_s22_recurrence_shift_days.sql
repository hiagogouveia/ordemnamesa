-- Sprint 22: Corrigir modelagem de recorrência
-- Problema: recurrence='none' causa comportamento implícito (aparece todos os dias)
-- Solução: remover 'none', adicionar 'shift_days', vincular turnos via shift_type

-- 1. Adicionar shift_type na tabela shifts (mapeia para checklist.shift)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_type text
  CHECK (shift_type IN ('morning', 'afternoon', 'evening'));

-- 2. Auto-popular shift_type baseado no nome existente
UPDATE shifts SET shift_type = 'morning'
  WHERE shift_type IS NULL AND (
    lower(name) LIKE '%manhã%' OR lower(name) LIKE '%manha%' OR lower(name) LIKE '%morning%'
    OR lower(name) LIKE '%abertura%' OR lower(name) LIKE '%café%' OR lower(name) LIKE '%cafe%'
  );

UPDATE shifts SET shift_type = 'afternoon'
  WHERE shift_type IS NULL AND (
    lower(name) LIKE '%tarde%' OR lower(name) LIKE '%afternoon%'
    OR lower(name) LIKE '%almoço%' OR lower(name) LIKE '%almoco%'
  );

UPDATE shifts SET shift_type = 'evening'
  WHERE shift_type IS NULL AND (
    lower(name) LIKE '%noite%' OR lower(name) LIKE '%evening%'
    OR lower(name) LIKE '%jantar%' OR lower(name) LIKE '%fechamento%'
  );

-- 3. Migrar dados: 'none' → 'daily' (preserva comportamento real atual)
UPDATE checklists SET recurrence = 'daily' WHERE recurrence = 'none' OR recurrence IS NULL;

-- 4. Trocar CHECK constraint: remover 'none', adicionar 'shift_days'
ALTER TABLE checklists DROP CONSTRAINT IF EXISTS checklists_recurrence_check;
ALTER TABLE checklists ADD CONSTRAINT checklists_recurrence_check
  CHECK (recurrence IN ('daily','weekly','monthly','yearly','weekdays','custom','shift_days'));

-- 5. Alterar DEFAULT para 'daily'
ALTER TABLE checklists ALTER COLUMN recurrence SET DEFAULT 'daily';
