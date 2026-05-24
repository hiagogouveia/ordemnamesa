-- Sprint 51 — Adiciona RECEIVING_PENDING_CONFIRMATION
-- Gestor é notificado quando uma expectativa nasce em status='pending'
-- (rotina recurring + manager_confirmation). Antes, ficava invisível até virar overdue.

BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'TASK_COMPLETED_WITH_NOTE',
    'NEW_TASK_ASSIGNED',
    'NEW_TASK_FOR_AREA',
    'PASSWORD_CHANGED_BY_ADMIN',
    'RECEIVING_OVERDUE',
    'RECEIVING_PENDING_CONFIRMATION'
));

COMMIT;
