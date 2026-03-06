-- ============================================================
-- Sprint 6 — Turnos, Funções e Compras
-- ============================================================

-- ── SHIFTS (turnos) ────────────────────────────────────────
CREATE TABLE shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  days_of_week int[] NOT NULL DEFAULT '{}',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── ROLES (funções/áreas) ──────────────────────────────────
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#13b6ec',
  max_concurrent_tasks integer NOT NULL DEFAULT 1,
  can_launch_purchases boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── USER_ROLES ─────────────────────────────────────────────
CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(restaurant_id, user_id, role_id)
);

-- ── USER_SHIFTS ────────────────────────────────────────────
CREATE TABLE user_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  shift_id uuid NOT NULL REFERENCES shifts(id),
  created_at timestamptz DEFAULT now()
);

-- ── PURCHASE_LISTS ─────────────────────────────────────────
CREATE TABLE purchase_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  created_by uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','closed')),
  target_role_ids uuid[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz DEFAULT now(),
  closed_at timestamptz
);

-- ── PURCHASE_ITEMS ─────────────────────────────────────────
CREATE TABLE purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_list_id uuid NOT NULL REFERENCES purchase_lists(id),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  quantity numeric,
  unit text CHECK (unit IN ('kg','g','L','ml','un','cx')),
  brand text,
  notes text,
  checked boolean DEFAULT false,
  checked_by uuid REFERENCES users(id),
  checked_at timestamptz,
  has_problem boolean DEFAULT false,
  problem_notes text
);

-- ── ALTERAÇÕES EM TABELAS EXISTENTES ──────────────────────
ALTER TABLE checklist_tasks
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES roles(id),
  ADD COLUMN IF NOT EXISTS checklist_type text DEFAULT 'regular'
    CHECK (checklist_type IN ('regular','opening','closing','receiving'));

ALTER TABLE task_executions
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- Atualizar CHECK de status em task_executions para incluir 'doing'
ALTER TABLE task_executions
  DROP CONSTRAINT IF EXISTS task_executions_status_check;
ALTER TABLE task_executions
  ADD CONSTRAINT task_executions_status_check
  CHECK (status IN ('done','skipped','flagged','doing'));

-- ── RLS ───────────────────────────────────────────────────
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

-- shifts
CREATE POLICY "shifts_select" ON shifts FOR SELECT
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users
    WHERE user_id = auth.uid() AND active = true
  ));
CREATE POLICY "shifts_write" ON shifts FOR ALL
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users
    WHERE user_id = auth.uid() AND active = true
    AND role IN ('owner','manager')
  ));

-- roles
CREATE POLICY "roles_select" ON roles FOR SELECT
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users
    WHERE user_id = auth.uid() AND active = true
  ));
CREATE POLICY "roles_write" ON roles FOR ALL
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users
    WHERE user_id = auth.uid() AND active = true
    AND role IN ('owner','manager')
  ));

-- user_roles
CREATE POLICY "user_roles_select" ON user_roles FOR SELECT
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users
    WHERE user_id = auth.uid() AND active = true
  ));
CREATE POLICY "user_roles_write" ON user_roles FOR ALL
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users
    WHERE user_id = auth.uid() AND active = true
    AND role IN ('owner','manager')
  ));

-- user_shifts
CREATE POLICY "user_shifts_select" ON user_shifts FOR SELECT
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users
    WHERE user_id = auth.uid() AND active = true
  ));
CREATE POLICY "user_shifts_write" ON user_shifts FOR ALL
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users
    WHERE user_id = auth.uid() AND active = true
    AND role IN ('owner','manager')
  ));

-- purchase_lists
CREATE POLICY "purchase_lists_select" ON purchase_lists FOR SELECT
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users
    WHERE user_id = auth.uid() AND active = true
  ));
CREATE POLICY "purchase_lists_write" ON purchase_lists FOR ALL
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users
    WHERE user_id = auth.uid() AND active = true
    AND role IN ('owner','manager')
  ));

-- purchase_items (todos os membros podem marcar itens)
CREATE POLICY "purchase_items_select" ON purchase_items FOR SELECT
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users
    WHERE user_id = auth.uid() AND active = true
  ));
CREATE POLICY "purchase_items_write" ON purchase_items FOR ALL
  USING (restaurant_id IN (
    SELECT restaurant_id FROM restaurant_users
    WHERE user_id = auth.uid() AND active = true
  ));
