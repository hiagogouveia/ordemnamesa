-- Sprint 83 — Backfill de task_executions.checklist_assumption_id
--
-- Contexto: o vínculo execução ↔ assumption passou a ser explícito (a coluna
-- `checklist_assumption_id` é preenchida na criação da execução). Linhas históricas ainda
-- preservadas têm a coluna NULL e eram associadas pela Auditoria via janela temporal
-- (checklist_id, user_id, executed_at ∈ [assumed_at, completed_at + 48h]).
--
-- Esta migration consolida essas linhas preservadas no vínculo canônico, replicando a MESMA
-- heurística de janela UMA ÚNICA VEZ. Execuções que não casam com nenhuma assumption permanecem
-- NULL (são exatamente as que a Auditoria nunca casou — não inventamos vínculo).
--
-- Observações:
--  * Idempotente (só toca linhas com checklist_assumption_id IS NULL).
--  * Múltiplas assumptions no mesmo dia: escolhe a assumption com o maior assumed_at que seja
--    <= executed_at (a sessão "ativa" no momento da execução), evitando casamento arbitrário.
--  * restaurant_id sempre no join — nunca cruza tenant.
--  * NÃO recupera dados já deletados; apenas associa o que ainda existe.

UPDATE task_executions te
SET checklist_assumption_id = sub.assumption_id
FROM (
    SELECT te2.id AS exec_id, ca.id AS assumption_id
    FROM task_executions te2
    JOIN LATERAL (
        SELECT ca.id, ca.assumed_at
        FROM checklist_assumptions ca
        WHERE ca.checklist_id  = te2.checklist_id
          AND ca.user_id       = te2.user_id
          AND ca.restaurant_id = te2.restaurant_id
          AND te2.executed_at >= ca.assumed_at
          AND te2.executed_at <= COALESCE(ca.completed_at, ca.assumed_at + interval '48 hours')
        ORDER BY ca.assumed_at DESC
        LIMIT 1
    ) ca ON TRUE
    WHERE te2.checklist_assumption_id IS NULL
      AND te2.executed_at IS NOT NULL
) sub
WHERE te.id = sub.exec_id;
