-- Sprint 13: User-Area assignments
-- Links users to specific organizational areas for visibility control.
-- Area membership is mandatory for activity visibility in "Minhas Atividades".

CREATE TABLE IF NOT EXISTS user_areas (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    area_id       uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE(restaurant_id, user_id, area_id)
);

ALTER TABLE user_areas ENABLE ROW LEVEL SECURITY;

-- SELECT: active restaurant members can see assignments
CREATE POLICY "user_areas: members can view"
    ON user_areas FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_users ru
            WHERE ru.restaurant_id = user_areas.restaurant_id
              AND ru.user_id = auth.uid()
              AND ru.active = true
        )
    );

-- INSERT: owner or manager only
CREATE POLICY "user_areas: owner/manager can assign"
    ON user_areas FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM restaurant_users ru
            WHERE ru.restaurant_id = user_areas.restaurant_id
              AND ru.user_id = auth.uid()
              AND ru.role IN ('owner', 'manager')
              AND ru.active = true
        )
    );

-- DELETE: owner or manager only
CREATE POLICY "user_areas: owner/manager can remove"
    ON user_areas FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_users ru
            WHERE ru.restaurant_id = user_areas.restaurant_id
              AND ru.user_id = auth.uid()
              AND ru.role IN ('owner', 'manager')
              AND ru.active = true
        )
    );

-- Index for fast lookup of areas by user
CREATE INDEX IF NOT EXISTS user_areas_user_idx
    ON user_areas(restaurant_id, user_id);

-- Index for fast lookup of users by area
CREATE INDEX IF NOT EXISTS user_areas_area_idx
    ON user_areas(area_id);
