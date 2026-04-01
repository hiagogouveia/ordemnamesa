-- Sprint 21: Adicionar assignment_type para desacoplar atribuição de área/colaborador
-- Permite três modos: 'area' (equipe da área), 'user' (colaborador específico), 'all' (todos)

ALTER TABLE checklists
ADD COLUMN IF NOT EXISTS assignment_type TEXT NOT NULL DEFAULT 'all';

-- Constraint para valores válidos
ALTER TABLE checklists
ADD CONSTRAINT checklists_assignment_type_check
CHECK (assignment_type IN ('area', 'user', 'all'));

-- Backfill: derivar assignment_type dos dados existentes
UPDATE checklists
SET assignment_type = CASE
    WHEN assigned_to_user_id IS NOT NULL THEN 'user'
    WHEN area_id IS NOT NULL THEN 'area'
    ELSE 'all'
END;

-- Índice parcial para queries de atribuição no kanban/my-activities
CREATE INDEX IF NOT EXISTS idx_checklists_assignment_type
ON checklists (restaurant_id, assignment_type)
WHERE active = true AND status = 'active';
