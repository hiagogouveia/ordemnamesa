-- Sprint 20: Tabela de auditoria de ações administrativas
-- Registra ações como alteração de senha de colaboradores pelo owner

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid NOT NULL,
    actor_id uuid NOT NULL,         -- quem executou a ação
    target_user_id uuid NOT NULL,   -- usuário afetado
    action text NOT NULL,           -- ex: 'password_changed'
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Apenas owner/manager ativo do restaurante pode ler os logs
CREATE POLICY "owner_manager_read_audit_log"
ON admin_audit_log FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM restaurant_users ru
        WHERE ru.restaurant_id = admin_audit_log.restaurant_id
          AND ru.user_id = auth.uid()
          AND ru.role IN ('owner', 'manager')
          AND ru.active = true
    )
);

-- INSERT apenas via service role (sem policy de insert para authenticated/anon)
