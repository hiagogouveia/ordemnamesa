# Fix B — Encerramento Formal

**Período:** descoberto na auditoria pré-Etapa-2; aplicado na sequência.
**Status:** ✅ concluído, validado, encerrado.

---

## 1. Problema identificado

Após a migration s57 (Etapa 0), 4 checklists legacy de recebimento ficaram `active=false`. Uma das `checklist_assumptions` ligadas a esses checklists estava `execution_status='in_progress'` no momento do backfill.

Os endpoints que listam atividades para o colaborador no Meu Turno — `app/api/tasks/kanban/route.ts`, `app/api/my-activities/route.ts` e `app/api/my-activities/badge/route.ts` — buscavam `checklists` com filtro `active=true` e não tinham caminho de reincorporação para checklists arquivados com trabalho ainda em andamento.

A reincorporação existente (Sprint 54) cobria apenas `is_one_shot=true` para preservar quicks concluídos hoje. Receivings recurring legacy não eram alcançados.

## 2. Impacto potencial em produção

Sem o fix, qualquer cenário em que um checklist é arquivado enquanto há trabalho em andamento provocaria:

- Card desaparece de Meu Turno → colaborador perde acesso visual ao trabalho que iniciou.
- Card desaparece de My Activities → mesmo efeito em outra superfície.
- Badge de notificação subestima pendências → colaborador não recebe sinal de "tem algo aberto".
- Execução continua existindo no banco mas fica órfã do ponto de vista de UX.

Em produção, os cenários típicos onde isso acontece:
- Migrações (como a s57 desta refatoração).
- Gestor arquiva um checklist sem perceber que há staff com execução em andamento.
- Reorganização de áreas/roles que deslocam vínculos.

A regressão não era específica do refactor de recebimentos — era latente no codebase. A migration apenas a expôs.

## 3. Arquivos alterados

| Arquivo | Linhas adicionadas | Tipo |
|---|---|---|
| [app/api/tasks/kanban/route.ts](app/api/tasks/kanban/route.ts) | ~22 (após linha 132) | reincorporação |
| [app/api/my-activities/route.ts](app/api/my-activities/route.ts) | ~22 (após linha 154) | reincorporação |
| [app/api/my-activities/badge/route.ts](app/api/my-activities/badge/route.ts) | ~28 (refator de variável + reincorporação) | reincorporação + ajuste para `let` |

Nenhuma alteração em tipos, hooks, RLS ou schema.

## 4. Estratégia aplicada

Filosofia única replicada nos 3 endpoints:

1. **Query principal preservada:** continua `active=true AND status='active'` — comportamento default permanece intacto. Performance da rota principal não é alterada.
2. **2ª query enxuta:** busca apenas `checklist_assumptions` com `execution_status='in_progress'` no escopo do restaurante. Retorna lista de `checklist_id`.
3. **Dedup defensivo:** `Set(knownIds)` exclui IDs que já vieram pela query principal, evitando dupla contagem.
4. **Re-aplicação do filtro de escopo:** a 3ª query (busca dos detalhes dos órfãos) usa o mesmo `or(checklistFilterParts.join(','))` da query principal. Garante que um órfão só é reincorporado se ainda bate no escopo do user (área/role/usuário).
5. **Early-exit em cada nível:** se não há órfãos, se não há IDs novos, se a fetch não trouxe nada — nada é mesclado. Custo zero no caso comum.

## 5. Validações executadas

### 5.1 Type-check
`npx tsc --noEmit` — zero erros nos 3 arquivos modificados (verificado 3×: após cada fix e após o conjunto).

### 5.2 SQL no NONPROD — antes do encerramento

Para o owner `fb0eb33f` no restaurante `cfd6f6ab` com user_area `caixa`:

| Origem | Qtd | Contém fixture `6accf891`? |
|---|---|---|
| Query principal (`active=true`) | 18 | ❌ |
| Reincorporação orphan | 1 | ✅ |
| Total deduplicado (UNION) | 19 | ✅ exatamente 1× |

A simulação SQL prova que a 2ª query encontra a fixture exatamente uma vez e o dedup evita duplicação. Mesma lógica vale para kanban, my-activities e badge (queries equivalentes em forma).

### 5.3 Smoke do browser

Validado por você (3 surfaces consistentes com o estado in_progress).

## 6. Riscos remanescentes

| Risco | Severidade | Status |
|---|---|---|
| 1 query extra por request em cada um dos 3 endpoints | baixa | aceito — query é `SELECT checklist_id WHERE execution_status='in_progress'`, normalmente <10 linhas em produção, índice em assumptions já existe |
| Dashboard pode subestimar/superestimar progresso quando um checklist regular é arquivado com trabalho em andamento | baixa | métrica agregada, não rastreio individual — fora do escopo do fix |
| Tela de gestão `/admin/checklists` continua não exibindo os 4 migrados | esperado | resolvido naturalmente na Etapa 3 com tela de templates |
| Quando uma execução órfã for concluída (`execution_status='done'`), a 2ª query deixa de pegar — comportamento correto, sem regressão |  N/A | validado |
| Bug equivalente em outras rotas (PUT/PATCH/DELETE write) | nulo | write paths buscam por id sem `active=true` (auditado e documentado) |

Nenhum risco bloqueante. Fix considerado fechado.
