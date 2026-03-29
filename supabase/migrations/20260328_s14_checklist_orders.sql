-- Sprint 14: Board view per-shift ordering for Checklist Management

CREATE TABLE IF NOT EXISTS checklist_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  checklist_id  uuid NOT NULL REFERENCES checklists(id)  ON DELETE CASCADE,
  shift         text NOT NULL CHECK (shift IN ('morning', 'afternoon', 'evening')),
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(checklist_id, shift)
);

ALTER TABLE checklist_orders ENABLE ROW LEVEL SECURITY;

-- SELECT: todos os membros ativos do restaurante podem ver as ordens
CREATE POLICY "checklist_orders: members can view"
    ON checklist_orders FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_users ru
            WHERE ru.restaurant_id = checklist_orders.restaurant_id
              AND ru.user_id = auth.uid()
              AND ru.active = true
        )
    );

-- INSERT: apenas owner ou manager
CREATE POLICY "checklist_orders: owner/manager can insert"
    ON checklist_orders FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM restaurant_users ru
            WHERE ru.restaurant_id = checklist_orders.restaurant_id
              AND ru.user_id = auth.uid()
              AND ru.role IN ('owner', 'manager')
              AND ru.active = true
        )
    );

-- UPDATE: apenas owner ou manager
CREATE POLICY "checklist_orders: owner/manager can update"
    ON checklist_orders FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_users ru
            WHERE ru.restaurant_id = checklist_orders.restaurant_id
              AND ru.user_id = auth.uid()
              AND ru.role IN ('owner', 'manager')
              AND ru.active = true
        )
    );

-- DELETE: apenas owner (cascade cuida das deleções de checklists)
CREATE POLICY "checklist_orders: owner can delete"
    ON checklist_orders FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_users ru
            WHERE ru.restaurant_id = checklist_orders.restaurant_id
              AND ru.user_id = auth.uid()
              AND ru.role = 'owner'
              AND ru.active = true
        )
    );

-- Índices para performance
CREATE INDEX IF NOT EXISTS checklist_orders_restaurant_shift_idx
    ON checklist_orders(restaurant_id, shift);

CREATE INDEX IF NOT EXISTS checklist_orders_checklist_id_idx
    ON checklist_orders(checklist_id);
