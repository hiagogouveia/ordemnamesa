-- Sprint 87: Auditoria de exportações de dados (egresso)
--
-- Tabela GENÉRICA de eventos de exportação — um único ponto de auditoria de
-- saída de dados para todos os módulos (discriminador `resource_type`). O
-- primeiro consumidor é a exportação em lote de relatórios de auditoria
-- (`resource_type = 'audit_reports'`).
--
-- Modelo de evento (LGPD/segurança): o registro é gravado no DISPATCH — o
-- momento em que o servidor libera os dados/fotos para o ator. Esse é o fato
-- auditável e é determinístico (nunca se perde, mesmo que o cliente cancele,
-- feche a aba ou fique sem memória durante a geração). O desfecho client-side
-- (`completed`/`cancelled`/`failed`) é enriquecimento best-effort via PATCH.
--
-- Colunas específicas de relatório (format, mode, filtros, documentos)
-- ficam em `metadata` para manter a tabela genuinamente genérica.

CREATE TABLE IF NOT EXISTS data_export_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid NOT NULL,
    actor_id      uuid NOT NULL,                 -- quem exportou
    resource_type text NOT NULL,                 -- ex: 'audit_reports'
    -- Agrupa as linhas de um mesmo lote (em modo global um lote cruza tenants,
    -- gerando uma linha por restaurante — auditoria por tenant permanece íntegra).
    batch_id      uuid NOT NULL,
    status        text NOT NULL DEFAULT 'dispatched'
                  CHECK (status IN ('dispatched', 'completed', 'cancelled', 'failed')),
    item_count    integer NOT NULL DEFAULT 0,    -- nº de itens desta unidade no lote
    metadata      jsonb,                         -- format, mode, filtros resolvidos, documents[]
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Leitura das exportações mais recentes por restaurante.
CREATE INDEX IF NOT EXISTS idx_data_export_events_restaurant_created
    ON data_export_events (restaurant_id, created_at DESC);

-- PATCH de desfecho localiza as linhas do lote por batch_id.
CREATE INDEX IF NOT EXISTS idx_data_export_events_batch
    ON data_export_events (batch_id);

ALTER TABLE data_export_events ENABLE ROW LEVEL SECURITY;

-- Apenas owner/manager ativo do restaurante lê os eventos (helper padrão s40).
-- INSERT/UPDATE/DELETE: sem policy → exclusivamente via service role.
CREATE POLICY "data_export_events: owner/manager le"
    ON data_export_events FOR SELECT
    TO authenticated
    USING (public.is_restaurant_member(restaurant_id, ARRAY['owner', 'manager']));
