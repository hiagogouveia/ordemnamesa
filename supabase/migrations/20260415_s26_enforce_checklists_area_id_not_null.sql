-- Sprint 26: garantir que todo checklist pertence a uma área
--
-- Pré-requisitos já executados em produção:
--   1. Limpeza de órfãos (area_id IS NULL) em todos os restaurantes
--   2. Validações no POST/PUT /api/checklists exigindo area_id
--   3. Validação no form frontend ao publicar
--
-- Esta constraint é a última camada de defesa contra checklists sem área.

-- Safe-guard defensivo: se por algum motivo ainda houver órfãos, aborta com mensagem clara
DO $$
DECLARE
    orfao_count integer;
BEGIN
    SELECT COUNT(*) INTO orfao_count FROM checklists WHERE area_id IS NULL;
    IF orfao_count > 0 THEN
        RAISE EXCEPTION 'Migration abortada: % checklist(s) ainda com area_id NULL. Limpe antes de aplicar.', orfao_count;
    END IF;
END $$;

ALTER TABLE checklists ALTER COLUMN area_id SET NOT NULL;
