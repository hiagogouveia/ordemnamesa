-- 20260317_s9_add_enforce_sequential_order.sql
BEGIN;

ALTER TABLE public.checklists 
ADD COLUMN enforce_sequential_order BOOLEAN NOT NULL DEFAULT false;

COMMIT;
