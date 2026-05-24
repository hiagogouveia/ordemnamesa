-- Sprint 49 — Adiciona tipo RECEIVING_OVERDUE à tabela notifications
-- Alerta operacional quando uma expectativa de recebimento passa da janela
-- esperada sem confirmação/execução. Reaproveita a infra atual de notifications
-- (RLS por user_id, realtime habilitado em s17). Sem tabela paralela.
--
-- Preserva tipos já em uso e os introduzidos por s23.

BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'TASK_COMPLETED_WITH_NOTE',
    'NEW_TASK_ASSIGNED',
    'NEW_TASK_FOR_AREA',
    'PASSWORD_CHANGED_BY_ADMIN',
    'RECEIVING_OVERDUE'
));

COMMIT;
