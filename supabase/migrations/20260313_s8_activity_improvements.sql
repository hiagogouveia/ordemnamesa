-- Sprint 8: Activity Experience Improvements
-- Adds time window, custom recurrence, and assumption tracking

-- Janela de horário na atividade
ALTER TABLE checklists ADD COLUMN IF NOT EXISTS start_time TEXT; -- formato HH:mm
ALTER TABLE checklists ADD COLUMN IF NOT EXISTS end_time TEXT;   -- formato HH:mm

-- Config de recorrência personalizada (usado quando recurrence = 'custom')
ALTER TABLE checklists ADD COLUMN IF NOT EXISTS recurrence_config JSONB;

-- Tabela para registrar quem assumiu cada atividade por dia
CREATE TABLE IF NOT EXISTS checklist_assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  date_key TEXT NOT NULL,        -- formato YYYY-MM-DD
  assumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(checklist_id, date_key) -- uma assumption por atividade por dia
);

ALTER TABLE checklist_assumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant members can view assumptions"
  ON checklist_assumptions FOR SELECT
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Staff can insert assumptions"
  ON checklist_assumptions FOR INSERT
  WITH CHECK (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid()
  ));
