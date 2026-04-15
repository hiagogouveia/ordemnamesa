-- s27: Reverte checklists ativos sem tasks para rascunho.
-- Checklists sem tasks são invisíveis no turno (skip em turno/page.tsx) e não
-- são executáveis. Passam a exigir ao menos 1 task para publicação.

UPDATE checklists
SET status = 'draft'
WHERE status = 'active'
  AND id NOT IN (SELECT checklist_id FROM checklist_tasks);
