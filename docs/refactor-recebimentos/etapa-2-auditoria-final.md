# Etapa 2 — Auditoria Final de Impacto (pré-codificação)

**Projeto:** `mkwxulikizrfdupqpyrn` (nonprod).
**Estado avaliado:** schema pós-s56 + dados pós-s57.

---

## Veredito por surface

| Surface | Status | Severidade | Ação |
|---|---|---|---|
| Dashboard / KPIs | ✅ SAFE | — | nenhuma |
| Relatórios | ✅ SAFE | — | nenhuma |
| Central de Auditoria | ✅ SAFE | — | nenhuma |
| Execuções históricas (admin) | ✅ SAFE | — | nenhuma |
| `source_template_id` referências | ✅ SAFE | — | nenhuma |
| Multi-tenant RLS | ✅ SAFE | — | nenhuma |
| Materialização legacy | ⚠️ INTENCIONALMENTE DESLIGADA | aprovada Etapa 0 | nenhuma |
| Admin gestão de checklists (oculta os 4 migrados) | ⚠️ DEGRADADO ESPERADO | aprovado | documentado, resolvido na Etapa 3 |
| Receiving expectations apontando para checklist `active=false` | ⚠️ UX inconsistente | baixa | cosmético, pós-Etapa 4 |
| **Assumption `in_progress` em checklist `active=false`** | 🔴 **REGRESSÃO REAL** | **alta** | **fix antes de codar Etapa 2** |

---

## 1. Dashboard

**Arquivo:** [app/api/dashboard/route.ts](app/api/dashboard/route.ts).

**OPERATIONAL_PREDICATE:** `'checklist_type.neq.receiving,is_one_shot.eq.true'` (linha ~174). Receivings recurring nunca foram contados no dashboard — sempre foram excluídos por design. Migração s57 não afeta nada.

**Risco identificado:** ZERO. Mesma fonte é `checklist_assumptions`, mesma predicate exclusionária.

## 2. Relatórios

**Arquivo:** [lib/services/audit-service.ts](lib/services/audit-service.ts) linhas 313-321 — usa o mesmo `OPERATIONAL_PREDICATE`. Históricos de execução de rotina permanecem. Receivings já eram excluídos.

**Risco:** ZERO.

## 3. Central de Auditoria

Sem dependência em `checklists.active`. Eventos em `event_logs` independem. Histórico em `task_executions` segue queryável.

**Risco:** ZERO.

## 4. Execuções históricas

**Arquivo:** [app/api/execucoes/historico/route.ts](app/api/execucoes/historico/route.ts) — query em `task_executions` com JOIN em `checklists` SEM filtro `active=true`. Histórico inteiro acessível incluindo execuções dos 4 checklists migrados.

**Risco:** ZERO.

## 5. `source_template_id`

Grep no codebase: zero referências em queries TS/SQL. Coluna existe, mas hoje sempre NULL em todas as linhas pré-Etapa-2. Nenhum risco de comportamento inesperado.

## 6. Multi-tenant RLS

7 policies confirmadas (SQL real abaixo). Helper `is_restaurant_member` é o mesmo padrão das demais tabelas (s40+s48). Sem leaks identificáveis.

```
suppliers              | INSERT | membro pode cadastrar     | is_restaurant_member(restaurant_id)
suppliers              | SELECT | membro ve                  | is_restaurant_member(restaurant_id)
suppliers              | ALL    | owner/manager gerencia     | is_restaurant_member + ARRAY['owner','manager']
receiving_templates    | SELECT | membro ve                  | is_restaurant_member(restaurant_id)
receiving_templates    | ALL    | owner/manager gerencia     | is_restaurant_member + ARRAY['owner','manager']
receiving_template_tasks | SELECT | membro ve               | is_restaurant_member(restaurant_id)
receiving_template_tasks | ALL    | owner/manager gerencia  | is_restaurant_member + ARRAY['owner','manager']
```

**Risco:** ZERO. RLS habilitada nas 3 tabelas.

## 7. Materialização legacy

**Arquivo:** [lib/receiving/materialize.ts](lib/receiving/materialize.ts) linha 48 filtra `active=true`. Os 4 checklists migrados (active=false) não criam novas expectations. **Intencional** — desligamento gradual do fluxo legacy, aprovado na Etapa 0 e re-confirmado no plano. Não é regressão.

**Risco:** ZERO (esperado).

## 8. Admin gestão de checklists

**Arquivo:** [app/api/admin/checklists/route.ts](app/api/admin/checklists/route.ts) linha 39 filtra `active=true`. Os 4 migrados somem da tela de gestão. Aceitável: gestor passará a gerenciar via tela de modelos (Etapa 3). Durante a janela Etapa 2→3, gestor não tem acesso UI para reabrir os 4 antigos — mas as policies existem para reabrir via SQL/MCP se preciso.

**Risco:** baixo, esperado, documentado.

## 9. UX em expectation cards

Click em expectation apontando para `active=false` carrega a página de execução normalmente (hook não filtra active). Nenhum erro. UX um pouco confusa pois o "checklist" está arquivado mas a expectation está confirmada. Resolvido naturalmente na Etapa 4 quando as expectations legadas forem sumindo.

**Risco:** cosmético, ignorar agora.

---

## 🔴 REGRESSÃO REAL: assumption `in_progress` oculta no Meu Turno

### O que descobrimos via SQL

Das 7 assumptions ligadas a checklists legacy desativados, **uma está `execution_status='in_progress'`**:

| assumption_id | execution_status | assumed_at | checklist_name |
|---|---|---|---|
| `e5558553-75ed-41c8-8750-0dbaacad4201` | **in_progress** | 2026-05-24 16:11:55 | Recebimento recorrente |
| (outras 6) | done | — | — |

### Por que é regressão

[app/api/tasks/kanban/route.ts:104](app/api/tasks/kanban/route.ts) e [app/api/my-activities/route.ts:124](app/api/my-activities/route.ts) buscam `checklists` com `.eq('active', true)`. A reinclusão de Sprint 54 (linhas 117-132 e 139-154) só re-busca checklists com `is_one_shot=true` — e o legacy é one_shot=false.

Resultado: o usuário que estava com essa execução em andamento **não vê mais o card no Meu Turno**. A execução está "presa" no banco — não aparece em pendente, não aparece em executando, não aparece em concluído.

Em nonprod o impacto prático é nulo (1 registro de teste em ambiente não-produtivo). Em **produção**, se um restaurante real tiver assumption in_progress quando rodarmos a migration, isso quebra UX e isola trabalho do colaborador.

### Opções de correção

#### A) Patch nonprod imediato (limpeza pontual)
SQL: marcar a assumption como done com observação de migração.
- Pro: 30 segundos, problema sumiu no nonprod.
- Contra: NÃO resolve em produção. Quando rodarmos o backfill lá, se houver in_progress vão sumir igual.

#### B) Code fix em kanban + my-activities (recomendado)
Estender a reinclusão de Sprint 54 para também incluir checklists `active=false` que tenham assumptions in_progress hoje. Mantém o filtro `active=true` como base mas reinclui linhas que ainda têm trabalho pendente.

Diff conceitual (kanban/route.ts entre linhas 117-132):
```ts
// hoje: só reinclui is_one_shot=true se houver assumption hoje
if (knownIds...) { fetch archived quicks }

// adicionar: também reinclui qualquer checklist active=false que tenha
//            assumption in_progress hoje (independente de is_one_shot)
const { data: inProgressOrphans } = await admin.from('checklist_assumptions')
  .select('checklist_id')
  .in('restaurant_id', restaurantIds)
  .eq('execution_status', 'in_progress')
  .gte('assumed_at', startOfTodayIso);

if (inProgressOrphans?.length) {
  const ids = inProgressOrphans.map(o => o.checklist_id).filter(id => !knownIds.has(id));
  if (ids.length) {
    const { data: orphanChecklists } = await admin.from('checklists')
      .select(checklistSelect)
      .in('id', ids);
    activeChecklists.push(...(orphanChecklists ?? []));
  }
}
```

Mesma intervenção em my-activities/route.ts.

- Pro: resolve em qualquer migração futura (produção inclusive). Não toca nada estrutural. Defesa em profundidade contra "checklist desativado com execução em andamento" — útil mesmo fora do contexto de recebimento.
- Contra: 2 endpoints tocados antes de iniciar Etapa 2.

#### C) Reativar checklists legacy só onde há in_progress
SQL: `UPDATE checklists SET active=true WHERE id IN (select distinct checklist_id from in_progress legacy)`.
- Pro: zero código.
- Contra: reintroduz materialização para esse 1 caso (legacy.active=true reativa o sweeper/materialização — exatamente o que queremos desligar). Inconsistente.

### Recomendação

**Aplicar B (code fix) + A (limpeza do nonprod test data)** antes de iniciar a codificação da Etapa 2:

1. **Fix de código** em kanban + my-activities (defesa em profundidade — vai proteger qualquer migração futura).
2. **Sanity SQL no nonprod** marcando a assumption de teste como done para a UI ficar limpa durante validação manual da Etapa 2.

Justificativa: a fix B é pequena (~15 linhas em 2 arquivos), tem valor estrutural além desta migração (qualquer cenário onde um checklist é arquivado durante uma execução em andamento) e elimina o risco análogo em produção quando rodarmos o backfill lá.

---

## Validação SQL (rodada em NONPROD)

```
templates                         = 4
template_tasks                    = 9
suppliers                         = 0  (esperado, Etapa 1 não criou nada)
legacy_total                      = 4
legacy_ativos                     = 0
legacy_desativados                = 4
assumptions_legacy_preservadas    = 7  (todas acessíveis via /historico)
expectations_preservadas          = 17
task_executions_historicas (children) = 9 (tarefas dos 4 checklists legacy)
```

### Órfãos (esperado=0)
```
templates_sem_tasks               = 0 ✅
tasks_orfas                       = 0 ✅
execucoes_ligadas_a_template      = 0 ✅ (zero execuções novas, Etapa 2 não rodou)
execucoes_com_supplier            = 0 ✅
expectations_sem_checklist        = 0 ✅
tasks_em_legacy_desativados       = 9    (tasks históricas preservadas no checklist origem)
```

### Equivalência semântica do backfill (campo a campo)

Comparação dos 4 pares legacy ↔ template:

| Campo | Match em 4/4 |
|---|---|
| name | ✅ |
| area_id | ✅ |
| role_id | ✅ |
| assigned_to_user_id | ✅ |
| recurrence | ✅ |
| enforce_sequential_order | ✅ |
| description | ✅ |
| shift | ❌ legacy=`'any'` → template=`NULL` (decisão de modelagem aprovada — `shift` não usado no novo fluxo) |

Tasks: 9 pares título×ordem×requires_photo×is_critical×requires_observation com match total.

### Campos do legacy que NÃO foram copiados (auditável)

| Campo legacy | Por quê |
|---|---|
| `shift='any'` | template não usa shift (decisão aprovada) |
| `receiving_mode='recurring'` | conceito legacy — disponibilidade vem 100% da recorrência no template |
| `receiving_generation` | legacy — modelo não tem pending/confirmed |
| `supplier_name` | substituído por `supplier_id` (FK) na execução, não no template |
| `start_time` / `end_time` | template não tem janela operacional |
| `last_reset_at` | aplicável só a checklist operacional |
| `order_index` | template é catálogo, não tem ordenação de board |
| `status` (`active`) | template tem `active` próprio (booleano simples) |
| `is_one_shot` | template nunca é one-shot |
| `category` | descartado (legacy não usava de forma significativa) |

---

## Plano de fix antes de codar Etapa 2

1. **Code fix kanban/route.ts** — inclui assumptions in_progress de checklists `active=false`. ~15 linhas.
2. **Code fix my-activities/route.ts** — mesmo padrão. ~15 linhas.
3. `npx tsc --noEmit` zero erros nos arquivos tocados.
4. SQL no nonprod marcando a assumption de teste como `done` (limpeza de fixture):
   ```sql
   UPDATE checklist_assumptions
     SET execution_status='done',
         completed_at=now(),
         observation=COALESCE(observation,'') ||
                     ' [fixture nonprod: assumption órfã da migração s57; encerrada para limpar Meu Turno durante a Etapa 2]'
     WHERE id='e5558553-75ed-41c8-8750-0dbaacad4201';
   ```
5. Documentar essa fix como parte do registro da Etapa 2.

**Após esses 5 passos, prossigo com a sequência §12 (revisada) do plano técnico:** migration s58 (idempotency_key), migration s59 (RPC enxuta), helper de recorrência extraído, route handlers, hooks, validação.

Aguardo confirmação para aplicar o fix + limpeza e iniciar codificação.
