# Fix B — Relatório de aplicação

**Escopo:** Defesa em profundidade contra assumptions `in_progress` em checklists `active=false`.
**Aplicado em:** 2 arquivos. **Identificado em:** 3 sites (1 adicional reportado para decisão).

---

## 1. Diff resumido (aplicado)

### `app/api/tasks/kanban/route.ts` (após linha 132)

```diff
+        // Defesa em profundidade: assumptions in_progress órfãs (checklist
+        // active=false e não é one-shot). Acontece quando um checklist é
+        // arquivado enquanto há trabalho em andamento (migrações, decisão
+        // de gestor). Sem essa reincorporação a execução fica invisível.
+        const { data: inProgressOrphans } = await adminSupabase
+            .from('checklist_assumptions')
+            .select('checklist_id')
+            .in('restaurant_id', restaurantIds)
+            .eq('execution_status', 'in_progress');
+        if (inProgressOrphans && inProgressOrphans.length > 0) {
+            const knownIds = new Set(activeChecklists.map((c: { id: string }) => c.id));
+            const orphanIds = Array.from(new Set(
+                inProgressOrphans.map((a: { checklist_id: string }) => a.checklist_id)
+            )).filter((id) => !knownIds.has(id));
+            if (orphanIds.length > 0) {
+                const { data: orphanChecklists } = await adminSupabase
+                    .from('checklists')
+                    .select(checklistSelect)
+                    .in('id', orphanIds)
+                    .or(checklistFilterParts.join(','));
+                if (orphanChecklists && orphanChecklists.length > 0) {
+                    activeChecklists = [...activeChecklists, ...orphanChecklists];
+                }
+            }
+        }
```

### `app/api/my-activities/route.ts` (após linha 154)

Mesma estrutura, ajustada para o contexto single-restaurant (sem `.in()`):

```diff
+        // Defesa em profundidade: reincorpora checklists com assumptions
+        // in_progress mesmo quando active=false. Cobre cenários onde um
+        // checklist foi arquivado durante uma execução em andamento
+        // (migrações, decisão de gestor). Sem isso, o trabalho fica órfão.
+        const { data: inProgressOrphans } = await adminSupabase
+            .from('checklist_assumptions')
+            .select('checklist_id')
+            .eq('restaurant_id', restaurant_id)
+            .eq('execution_status', 'in_progress');
+        if (inProgressOrphans && inProgressOrphans.length > 0) {
+            const knownIds = new Set(checklists.map((c: { id: string }) => c.id));
+            const orphanIds = Array.from(new Set(
+                inProgressOrphans.map((a: { checklist_id: string }) => a.checklist_id)
+            )).filter((id) => !knownIds.has(id));
+            if (orphanIds.length > 0) {
+                const { data: orphanChecklists } = await adminSupabase
+                    .from('checklists')
+                    .select(checklistSelect)
+                    .in('id', orphanIds)
+                    .or(checklistFilterParts.join(','));
+                if (orphanChecklists && orphanChecklists.length > 0) {
+                    checklists = [...checklists, ...orphanChecklists];
+                }
+            }
+        }
```

**Resultado tsc:** zero erros nos dois arquivos.

---

## 2. Validação SQL no NONPROD — fixture `e5558553`

### A. Estado atual da fixture (confirmado)
```
assumption e5558553-75ed-41c8-8750-0dbaacad4201
  execution_status = in_progress
  assumed_at = 2026-05-24 16:11:55
  user_id = fb0eb33f… (owner)
  checklist 6accf891… "Recebimento recorrente"
    active=false  status=active  checklist_type=receiving
    is_one_shot=false  area_id=851c86c4 ("caixa")
    assigned_to_user_id=null  role_id=null
```

### B. Membership confirmada
```
user fb0eb33f… é owner do restaurante cfd6f6ab…
e tem vínculo em user_areas com area_id=851c86c4 ("caixa")
→ checklistFilterParts inclui `area_id.in.(851c86c4,…)`
→ orphan match: TRUE
```

### C. Simulação da reincorporação (query equivalente ao fix)
A query SQL que simula exatamente a 2ª busca do fix retornou 4 checklists:

| id | name | active | matched by |
|---|---|---|---|
| `6accf891…` | **Recebimento recorrente** | **false** | area_id ∈ user_areas → **alvo da reincorporação** |
| `0accbea6…` | Atividade COm FOTO 2 | true | assigned_to_user_id |
| `ccca729a…` | administrativo | true | assigned_to_user_id |
| `2b8c079a…` | teste atividade com foto | true | assigned_to_user_id |

Os 3 últimos já vinham pela 1ª query (active=true) → filtrados pelo `!knownIds.has(id)` no fix.
**Apenas `6accf891` (a fixture) é efetivamente reincorporado.**

### D. Verificações que ficam para o smoke manual no browser

| # | Cenário | Como validar |
|---|---|---|
| 1 | Card aparece em Meu Turno | `npm run dev` + login owner + abrir `/turno` |
| 2 | Card aparece em /my-activities | mesma sessão |
| 3 | Card abre execução | clicar no card → `/turno/atividade/6accf891…` carrega tasks |
| 4 | Pode ser concluído | finalizar tasks + complete → 200 |
| 5 | Não duplica (1ª + reincorporação) | dedup por knownIds — só 1 card no DOM |
| 6 | Não reaparece após conclusão | `execution_status='done'` → fora do filtro `in_progress` da reincorporação |

> Não consigo executar o smoke do browser por aqui — preciso de você ligando o dev server. SQL confirma o caminho.

---

## 3. Grep amplo: `.eq('active', true)` operando em `checklists`

Filtrei TODOS os `from('checklists')` e classifiquei cada `.eq('active', true)`:

### Tabela completa (classificação por risco)

| Arquivo:linha | Contexto | Tabela | Risco | Notas |
|---|---|---|---|---|
| [app/api/tasks/kanban/route.ts:104](app/api/tasks/kanban/route.ts) | Listagem Meu Turno (kanban) | `checklists` | ✅ **CORRIGIDO** | fix B aplicado |
| [app/api/my-activities/route.ts:124](app/api/my-activities/route.ts) | Listagem My Activities | `checklists` | ✅ **CORRIGIDO** | fix B aplicado |
| [app/api/my-activities/badge/route.ts:65](app/api/my-activities/badge/route.ts) | **Badge de pendências (contador no sino/menu)** | `checklists` | 🟡 **MESMO PADRÃO — não corrigido ainda** | precisa decisão |
| [app/api/dashboard/route.ts:180](app/api/dashboard/route.ts) | Dashboard KPIs | `checklists` | ✅ SAFE | `OPERATIONAL_PREDICATE` exclui receivings; reincorporação Sprint 54 de quicks já presente. Receivings recurring legados nunca contaram aqui. |
| [app/api/admin/checklists/route.ts:39](app/api/admin/checklists/route.ts) | Lista gestão admin | `checklists` | ⚠️ DEGRADADO ESPERADO | gestor não vê migrados — resolvido na Etapa 3 com tela de templates |
| [app/api/checklists/route.ts:66](app/api/checklists/route.ts) | Lista pra board de gestão | `checklists` | ⚠️ DEGRADADO ESPERADO | mesmo motivo |
| [app/api/checklists/route.ts:268](app/api/checklists/route.ts) | Verificação de nome único | `checklists` | ✅ SAFE | write path — intencional |
| [app/api/checklists/[id]/route.ts:46](app/api/checklists/[id]/route.ts) | GET edit | `checklists` | ✅ SAFE | edit não faz sentido em archived (gestor reativa via PATCH) |
| [app/api/checklists/[id]/route.ts:324](app/api/checklists/[id]/route.ts) | PUT/PATCH | `checklists` | ✅ SAFE | mesmo |
| [app/api/checklists/[id]/route.ts:389](app/api/checklists/[id]/route.ts) | DELETE | `checklists` | ✅ SAFE | write |
| [app/api/checklists/auto-prioritize/route.ts:82](app/api/checklists/auto-prioritize/route.ts) | Lista para prioritização | `checklists` | ✅ SAFE | rotinas auto-priorizadas só fazem sentido em active=true |
| [app/api/checklists/reorder/route.ts:53](app/api/checklists/reorder/route.ts) | Reorder UI | `checklists` | ✅ SAFE | board de gestão, não toca arquivados |
| [app/api/checklists/[id]/tasks/reorder/route.ts:50](app/api/checklists/[id]/tasks/reorder/route.ts) | Reorder tasks | `checklists` | ✅ SAFE | write |
| [app/api/checklists/[id]/assume/route.ts:](app/api/checklists/[id]/assume/route.ts) | Assume endpoint | (`restaurant_users`, não checklists) | ✅ SAFE | fetch direto por id, sem active filter no checklist |
| [app/api/checklists/[id]/complete/route.ts:](app/api/checklists/[id]/complete/route.ts) | Complete endpoint | (`restaurant_users`, não checklists) | ✅ SAFE | mesmo |
| [app/api/notifications/route.ts:99](app/api/notifications/route.ts) | Block alerts (gestor) | `checklists` (by id, sem active filter) | ✅ SAFE | só busca nomes |
| [app/api/relatorios/route.ts:72](app/api/relatorios/route.ts) | Relatórios | `restaurant_users` | ✅ SAFE | membership, não checklists |
| [app/api/relatorios/[assumptionId]/route.ts:60](app/api/relatorios/[assumptionId]/route.ts) | Relatório por assumption | `restaurant_users` | ✅ SAFE | mesmo |
| [app/api/execucoes/route.ts:40,106](app/api/execucoes/route.ts) | Lista execuções do dia | `restaurant_users` | ✅ SAFE | membership |
| [lib/hooks/use-activity-execution.ts:28](lib/hooks/use-activity-execution.ts) | Tela de execução individual | `checklists` (by id, sem active filter) | ✅ SAFE | abre archived sem problema |
| [lib/analytics/queries.ts:57](lib/analytics/queries.ts) | Métricas internas | `checklists` (sem active filter) | ✅ SAFE | conta tudo |
| [app/api/receiving-expectations/route.ts](app/api/receiving-expectations/route.ts) | Materialização legacy | `checklists` | ⚠️ INTENCIONAL | Etapa 4 desliga |
| [app/api/receiving-expectations/materialize/route.ts](app/api/receiving-expectations/materialize/route.ts) | Materialize | `checklists` | ⚠️ INTENCIONAL | Etapa 4 desliga |
| [app/api/receiving-expectations/mark-overdue/route.ts](app/api/receiving-expectations/mark-overdue/route.ts) | Sweeper overdue | `checklists` | ⚠️ INTENCIONAL | Etapa 4 desliga |
| [app/api/receiving-expectations/counts/route.ts](app/api/receiving-expectations/counts/route.ts) | Contagem legacy | `checklists` | ⚠️ INTENCIONAL | Etapa 4 desliga |
| [app/api/receiving/templates/route.ts](app/api/receiving/templates/route.ts) | Picker legacy | `checklists` | ⚠️ TRANSITÓRIO | Substituído por `/api/receiving-templates/available` na Etapa 2 |
| [app/api/receiving/quick/route.ts](app/api/receiving/quick/route.ts) | Quick legacy | `restaurant_users` + `areas` | ✅ SAFE | escopo, não read crítico |
| [app/api/receiving/quick/history/route.ts](app/api/receiving/quick/history/route.ts) | Histórico quicks | `checklists` | ✅ SAFE | one-shots arquivados são alvo intencional |

### Outras tabelas com `.eq('active', true)` (não checklists)

Aprox. 70+ ocorrências, todas em:
- `restaurant_users` (membership)
- `areas`, `roles`, `shifts`, `units`, `accounts`
- `user_areas`, `user_roles`, `user_shifts`
- `suppliers` (novo, intencional — soft-delete)
- `task_issues`, `notifications` (subscribers)

Nenhuma dessas representa risco de "ocultação de trabalho em andamento". São filtros de membership/escopo onde `active=false` significa "membro/área desativada" e o filtro é intencional.

---

## 4. Sites adicionais que merecem fix B

### 🟡 `app/api/my-activities/badge/route.ts:65` — único achado novo

**O que faz:** retorna `{ pending: N }` — número de checklists com tasks pendentes para o staff logado. Alimenta o badge vermelho de notificação no sino/menu.

**O risco análogo:** se o usuário tem trabalho `in_progress` em um checklist `active=false`, o badge **não conta** essa rotina como pendente. O usuário não vê o sinal visual de que tem algo aberto.

**Severidade vs kanban/my-activities:** menor. Kanban/my-activities ocultam a CARD (impede execução). Badge só erra o NÚMERO. Mas o sintoma para o user real é semelhante: "eu lembro que tinha algo aberto, mas o sistema não me mostra mais".

**Fix necessário:** mesma forma. Após linha 67, adicionar reincorporação por `inProgressOrphans` (idêntico ao kanban). ~15 linhas.

### Outros sites — não precisam

- Dashboards/relatórios excluem receivings via `OPERATIONAL_PREDICATE`. Sem risco no contexto desta migração. Se um futuro projeto arquivar um checklist `regular` com trabalho em andamento, o dashboard *de progresso* pode ficar levemente fora — mas é métrica agregada, não rastreio individual. Aceito.
- Tela de gestão admin (`/admin/checklists`): degradação intencional, resolvida na Etapa 3.
- Endpoints write (assume/complete/PUT/DELETE): fetch direto por id sem filtro active. Continuam funcionando para archived. Sem risco.
- Hook de execução individual: idem.

---

## 5. Recomendação

1. **Aplicar fix B também em `my-activities/badge/route.ts`** — coerência arquitetural e proteção total do staff. ~15 linhas, baixo risco. Recomendo aplicar **antes** de encerrar a fixture do nonprod, para que o smoke valide os 3 sites de uma vez.
2. **Smoke manual** com o fixture vivo:
   - `rm -rf .next && npm run dev`
   - Login como owner `fb0eb33f…` no nonprod
   - Abrir `/turno` → confirmar que "Recebimento recorrente" aparece no bloco de pendentes/em-andamento
   - Abrir `/my-activities` → confirmar que aparece
   - Clicar no card → confirmar que abre execução normalmente
   - Conferir badge (se houver) → contagem deve incluir a rotina
   - Concluir a execução → confirmar que sai das listagens e não reaparece
3. **Após smoke ok**, encerrar a fixture com o SQL planejado e seguir para a Etapa 2 (sequência §12 do plano técnico aprovado).
4. **Não retroagir nos sites "DEGRADADO ESPERADO"** (admin/checklists list). Eles serão substituídos pela tela de templates na Etapa 3.

---

**Aguardo:**
- decisão sobre estender fix B para `my-activities/badge`;
- resultado do smoke manual no browser (kanban + my-activities + badge se estender);
- depois disso, autoriza encerrar fixture e iniciar codificação da Etapa 2.
