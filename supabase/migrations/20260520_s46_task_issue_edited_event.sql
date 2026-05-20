-- Sprint 46: permitir evento 'edited' em task_issue_events
-- Necessário para registrar quando o autor da ocorrência edita description/photos
-- enquanto status='open'.

ALTER TABLE public.task_issue_events
  DROP CONSTRAINT IF EXISTS task_issue_events_event_type_check;

ALTER TABLE public.task_issue_events
  ADD CONSTRAINT task_issue_events_event_type_check
  CHECK (event_type IN ('created','status_changed','comment_added','resolved','reopened','edited'));
