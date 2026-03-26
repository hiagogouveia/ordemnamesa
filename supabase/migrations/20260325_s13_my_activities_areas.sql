-- Sprint 13: My Activities + Areas
-- Creates the `areas` table for organizational grouping and extends `checklists`
-- with `area_id` and `target_role` for role-based task targeting.

-- ============================================================
-- 1. TABLE: areas
-- ============================================================
CREATE TABLE IF NOT EXISTS areas (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name          text NOT NULL,
    description   text,
    color         text NOT NULL DEFAULT '#13b6ec',
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE(restaurant_id, name)
);

ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

-- SELECT: all active restaurant members
CREATE POLICY "areas: members can view"
    ON areas FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_users ru
            WHERE ru.restaurant_id = areas.restaurant_id
              AND ru.user_id = auth.uid()
              AND ru.active = true
        )
    );

-- INSERT: owner or manager only
CREATE POLICY "areas: owner/manager can create"
    ON areas FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM restaurant_users ru
            WHERE ru.restaurant_id = areas.restaurant_id
              AND ru.user_id = auth.uid()
              AND ru.role IN ('owner', 'manager')
              AND ru.active = true
        )
    );

-- UPDATE: owner or manager only
CREATE POLICY "areas: owner/manager can update"
    ON areas FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_users ru
            WHERE ru.restaurant_id = areas.restaurant_id
              AND ru.user_id = auth.uid()
              AND ru.role IN ('owner', 'manager')
              AND ru.active = true
        )
    );

-- DELETE: owner only
CREATE POLICY "areas: owner can delete"
    ON areas FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_users ru
            WHERE ru.restaurant_id = areas.restaurant_id
              AND ru.user_id = auth.uid()
              AND ru.role = 'owner'
              AND ru.active = true
        )
    );

-- ============================================================
-- 2. EXTEND: checklists
-- ============================================================

-- Optional area association (null = no area)
ALTER TABLE checklists
    ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas(id) ON DELETE SET NULL;

-- Role-based visibility (defaults to 'all' → all existing checklists are unaffected)
ALTER TABLE checklists
    ADD COLUMN IF NOT EXISTS target_role text NOT NULL DEFAULT 'all'
        CHECK (target_role IN ('staff', 'manager', 'owner', 'all'));

-- ============================================================
-- 3. INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS checklists_area_id_idx
    ON checklists(area_id);

CREATE INDEX IF NOT EXISTS checklists_target_role_idx
    ON checklists(restaurant_id, target_role);
