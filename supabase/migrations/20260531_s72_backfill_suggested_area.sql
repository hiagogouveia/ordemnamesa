-- ============================================================
-- Sprint 72 — Backfill de suggested_area_label (rotinas transversais)
-- ============================================================
-- As 4 rotinas gerenciais/transversais não pertencem a uma zona física.
-- Mapeamento operacional aprovado: gestão/compliance -> Administração;
-- coordenação de turno -> Geral. Melhora tanto a provisão de áreas dos
-- Kits quanto o auto-match da importação unitária. Idempotente.
-- ============================================================

BEGIN;

UPDATE public.checklist_templates
   SET suggested_area_label = 'Administração', updated_at = now()
 WHERE slug IN ('vigilancia-sanitaria','controle-pragas','controle-cmv')
   AND (suggested_area_label IS DISTINCT FROM 'Administração');

UPDATE public.checklist_templates
   SET suggested_area_label = 'Geral', updated_at = now()
 WHERE slug = 'passagem-turno'
   AND (suggested_area_label IS DISTINCT FROM 'Geral');

COMMIT;
