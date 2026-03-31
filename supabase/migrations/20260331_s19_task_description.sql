-- Sprint 19: Adiciona campo de descrição opcional às tasks de checklist
ALTER TABLE checklist_tasks
    ADD COLUMN IF NOT EXISTS description TEXT NULL;
