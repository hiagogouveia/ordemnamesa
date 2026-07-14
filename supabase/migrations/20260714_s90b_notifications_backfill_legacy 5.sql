-- Sprint 90b — Backfill do payload tipado nas notificações LEGADAS (pré-s90)
--
-- Só faz o que dá para reconstruir COM CERTEZA. Nada é inventado.
--
-- `TASK_COMPLETED_WITH_NOTE` é o único tipo legado com dado aproveitável: o s17
-- gravava metadata = {checklist_id, checklist_name, completed_by_name,
-- completed_by_user_id}. O que faltava para o deep-link era o `date_key` — e ele é
-- derivável do `created_at` convertido para o FUSO DO RESTAURANTE (coluna
-- restaurants.timezone, existente desde o s73).
--
-- Sem este backfill, essas linhas cairiam no renderer de "desconhecida" (legíveis,
-- porém não clicáveis), porque o parser exige `date_key` para poder navegar.
--
-- Os demais tipos legados (NEW_TASK_ASSIGNED, NEW_TASK_FOR_AREA, PASSWORD_CHANGED_BY_ADMIN)
-- NÃO têm o que reconstruir: nunca tiveram related_id nem metadata útil. Seguem
-- renderizáveis pelo registry (têm ícone e texto) e simplesmente não navegam — que é
-- o comportamento correto, e já era o de fato (o clique neles nunca fez nada).
--
-- Idempotente: só toca linhas com payload ainda vazio.
-- ROLLBACK: UPDATE public.notifications SET payload = '{}'::jsonb, group_key = NULL
--           WHERE type = 'TASK_COMPLETED_WITH_NOTE' AND payload_version = 1;

BEGIN;

WITH resolved AS (
    SELECT
        n.id,
        n.metadata ->> 'checklist_id'          AS checklist_id,
        n.metadata ->> 'checklist_name'        AS checklist_name,
        n.metadata ->> 'completed_by_name'     AS completed_by_name,
        n.metadata ->> 'completed_by_user_id'  AS completed_by_user_id,
        -- O dia em que a notificação nasceu, no fuso do restaurante — não no do servidor.
        to_char(
            (n.created_at AT TIME ZONE COALESCE(r.timezone, 'America/Sao_Paulo')),
            'YYYY-MM-DD'
        ) AS date_key
    FROM public.notifications n
    JOIN public.restaurants r ON r.id = n.restaurant_id
    WHERE n.type = 'TASK_COMPLETED_WITH_NOTE'
      AND n.metadata ? 'checklist_id'
      AND COALESCE(n.payload, '{}'::jsonb) = '{}'::jsonb   -- idempotência
)
UPDATE public.notifications n
SET
    payload = jsonb_build_object(
        'checklist_id',            resolved.checklist_id,
        'checklist_assumption_id', NULL,   -- não era gravado; o destino resolve por (checklist_id, date_key)
        'date_key',                resolved.date_key,
        'completed_by_user_id',    COALESCE(resolved.completed_by_user_id, ''),
        'checklist_name',          COALESCE(resolved.checklist_name, ''),
        'completed_by_name',       COALESCE(resolved.completed_by_name, ''),
        -- `title`/`description` da linha já estão preenchidos e são o que a UI mostra;
        -- o excerpt só seria usado para RE-renderizar, o que não fazemos no legado.
        'excerpt',                 ''
    ),
    payload_version = 1,
    group_key = 'note:' || resolved.checklist_id || ':' || resolved.date_key
FROM resolved
WHERE n.id = resolved.id;

COMMIT;
