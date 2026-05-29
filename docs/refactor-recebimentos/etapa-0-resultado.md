# Etapa 0 — Resultado em NONPROD

**Projeto:** `mkwxulikizrfdupqpyrn` (nonprod-ordemnamesa)
**Data:** 2026-05-28
**Migrations aplicadas:** `s56_receiving_templates_and_suppliers`, `s57_backfill_receiving_templates`

---

## 1. Integridade das superfícies operacionais

Mudanças foram exclusivamente **aditivas em schema** + 4 linhas em `checklists` marcadas `active=false`. Nenhuma coluna, função, policy ou índice existente foi removido. Nenhuma query atual quebra: todas as superfícies que usam `checklists` já filtram por `active=true` (confirmado em [app/api/tasks/kanban/route.ts:104](app/api/tasks/kanban/route.ts#L104) e em [lib/receiving/materialize.ts](lib/receiving/materialize.ts)).

| Superfície | Comportamento esperado pós-backfill | Status |
|---|---|---|
| **Meu Turno — aba Rotinas** | Sem mudança visível (legacy checklists já não apareciam aqui) | OK |
| **Meu Turno — aba Recebimentos** | 17 expectations pré-existentes ainda visíveis (4 para hoje); **novas materializações cessam** porque `materializeReceivingForToday` filtra `active=true` | OK (intencional) |
| **Dashboard / contadores** | Contam `receiving_expectations` e `checklist_assumptions` — histórico preservado | OK |
| **Relatórios** | Idem | OK |
| **Sweeper de overdue** | Continua rodando; as 4 confirmed de hoje viram overdue se ninguém assumir até o fim da janela. Isso é comportamento legacy — será desligado na Etapa 4 | OK |
| **Histórico** | `checklist_assumptions` ligadas aos 4 legacy permanecem acessíveis (7 assumptions encontradas no nonprod). FK preservada (não há ON DELETE cascade involvido) | OK |

> **Janela de transição esperada:** entre Etapa 0 e Etapa 3 (rollout do novo picker), o cadastro de NOVO recebimento recorrente fica inacessível em nonprod. Quem precisar registrar um recebimento em nonprod nesse intervalo usa o botão "Recebimento Rápido" atual.

---

## 2. Inventário do backfill (NONPROD)

**4 checklists legacy desativados → 4 templates criados → 9 template_tasks copiadas. 0 suppliers (esperado, Etapa 1).**

| Restaurante | Nome | Área | Checklist legacy (active=false) | Template novo (active=true) | Tasks |
|---|---|---|---|---|---|
| `cfd6f6ab…b23a` | recebimento 2 CAIXA | `56e782a0…fc94c` | `7ca5b462-7985-4878-8c9a-09a92d64155e` | `cdecc5dc-96d5-4d06-98cc-211c10008864` | 2 |
| `cfd6f6ab…b23a` | recebimento 3 CAIXA (cópia) | `56e782a0…fc94c` | `32f24d9d-481c-4dcf-8e76-1fce468af6dc` | `025d1913-d0b9-4993-8d65-92ad9736b58b` | 2 |
| `cfd6f6ab…b23a` | recebimento ADM | `56e782a0…fc94c` | `e49ff477-88a3-417b-ba7c-f52e5c36ffc5` | `7a21dcdd-a157-404e-a947-335c5f5bc53e` | 3 |
| `cfd6f6ab…b23a` | Recebimento recorrente | `851c86c4…0359f` | `6accf891-b9b6-4cb3-9edb-550c68c9f395` | `f31211f7-7186-4e48-ad78-2d4ef9b30f17` | 2 |

Notas:
- Todos tinham `shift='any'` no legacy — mapeado para `NULL` no template (significa "disponível em qualquer turno", aplicado pelo picker via recorrência).
- Todos `recurrence='daily'`, sem `recurrence_config`.
- Nenhum tinha `role_id` ou `assigned_to_user_id` (sem restrição de escopo além da área).

**Sanity check final (rodada em nonprod):**
```
templates=4  template_tasks=9  suppliers=0
legacy_active=0  legacy_deactivated=4
expectations_pre_existentes=17 (todas status=confirmed; 4 com expected_date=CURRENT_DATE)
assumptions_em_checklists_legacy=7 (preservadas)
```

---

## 3. Como reverter (rollback)

O rollback é seguro porque o backfill **não destruiu** nada — apenas adicionou linhas em tabelas novas e marcou `active=false` em 4 linhas existentes.

### 3.1 Rollback apenas do backfill (s57)
Reativa os checklists legacy e descarta os templates copiados. Útil se quisermos voltar ao comportamento antigo sem dropar as tabelas.

```sql
BEGIN;

-- 1. Reativa checklists legacy que tinham sido desativados pelo s57
UPDATE public.checklists c
SET active = true
WHERE c.checklist_type = 'receiving'
  AND c.receiving_mode = 'recurring'
  AND c.active = false
  AND EXISTS (
    SELECT 1 FROM public.receiving_templates t
    WHERE t.restaurant_id = c.restaurant_id
      AND t.name = c.name
      AND t.area_id = c.area_id
  );

-- 2. Remove templates criados pelo backfill (CASCADE limpa template_tasks)
DELETE FROM public.receiving_templates t
WHERE EXISTS (
  SELECT 1 FROM public.checklists c
  WHERE c.checklist_type = 'receiving'
    AND c.receiving_mode = 'recurring'
    AND c.restaurant_id = t.restaurant_id
    AND c.name = t.name
    AND c.area_id = t.area_id
);

COMMIT;
```

> **Atenção:** se na época do rollback já existirem **execuções** com `source_template_id` apontando para esses templates, o DELETE seta esses ponteiros para NULL (ON DELETE SET NULL na FK em `checklists.source_template_id`). O histórico da execução em si é preservado, mas perde-se o link para o modelo de origem. No NONPROD atual isso não se aplica — não há execuções vinculadas ainda.

### 3.2 Rollback total (s56 + s57)
Volta o estado para antes da Etapa 0 inteira. **Aceita só enquanto não houver dependência de `supplier_id` ou `source_template_id` em produção.**

```sql
BEGIN;
-- Primeiro o rollback de s57 (acima)
-- ... (script da seção 3.1) ...

-- Depois drop das tabelas e colunas novas
ALTER TABLE public.checklists
  DROP COLUMN IF EXISTS source_template_id,
  DROP COLUMN IF EXISTS supplier_id;

DROP TABLE IF EXISTS public.receiving_template_tasks;
DROP TABLE IF EXISTS public.receiving_templates;
DROP TABLE IF EXISTS public.suppliers;

DROP FUNCTION IF EXISTS public.tg_receiving_templates_updated_at();

COMMIT;
```

### 3.3 Verificação pós-rollback
Após qualquer rollback, rodar:
```sql
SELECT count(*) FROM checklists WHERE checklist_type='receiving' AND receiving_mode='recurring' AND active=true;
```
Esperado: voltar para o número original de checklists legacy ativos (4 no NONPROD).
