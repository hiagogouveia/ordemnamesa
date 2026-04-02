-- Sprint 23: Adiciona tipo PASSWORD_CHANGED_BY_ADMIN à tabela notifications
-- Necessário para notificar colaborador quando o owner redefine sua senha

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'TASK_COMPLETED_WITH_NOTE',
    'NEW_TASK_ASSIGNED',
    'NEW_TASK_FOR_AREA',
    'PASSWORD_CHANGED_BY_ADMIN'
));
