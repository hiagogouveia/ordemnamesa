# Etapa 2 — Auditoria de compatibilidade com Etapa 3

**Foco:** validar se o backend entregue na Etapa 2 atende integralmente aos requisitos do Meu Turno novo, sem necessidade de quebrar contratos.

---

## 1. Tabela requisito × implementação

| # | Requisito | Status | Evidência / Implementação |
|---|---|---|---|
| 1 | Botão fixo "+ Novo Recebimento" | ✅ atendido | Backend pronto via `GET /api/receiving-templates/available`. UI faz o botão (Etapa 3). |
| 2 | Visibilidade por área | ✅ atendido | `/available` linha 65: `area_id.in.(<user_areas>)` no scopeParts. Templates só aparecem se user pertence à área. |
| 3 | Visibilidade por role | ✅ atendido | `/available` linha 67: `role_id.in.(<user_roles>)` no scopeParts. |
| 4 | Visibilidade por usuário específico | ✅ atendido | `/available` linha 69: `assigned_to_user_id.eq.<user.id>`. |
| 5 | Múltiplas execuções do mesmo modelo no mesmo dia | ✅ atendido | RPC não verifica unicidade por (template_id, date). PASS 3 do smoke (key A + key B no mesmo template = 2 execuções). |
| 6 | Fornecedor selecionado no momento da execução | ✅ atendido | `supplier_id` no body de `/instantiate` → `checklists.supplier_id`. Fornecedor mora na execução, não no template. |
| 7 | Fornecedor criado pelo colaborador (inline) | ✅ atendido | `supplier_new` no body; handler cria via insert; RLS `suppliers: membro pode cadastrar` (s56) permite. Em caso de conflito por nome, reusa existente. |
| 8 | Execução criada já em `in_progress` | ✅ atendido | RPC linha "INSERT INTO checklist_assumptions … execution_status='in_progress'". Validado no smoke (PASS 4). |
| 9 | Navegação direta para execução | ✅ atendido | Resposta inclui `checklist_id` e `assumption_id`. UI da Etapa 3 faz `router.push('/turno/atividade/:id/executar')`. |
| 10 | Bloco "Executando" | ✅ atendido no backend | Fix B já reincorpora `in_progress` em kanban + my-activities. Etapa 3 só precisa **separar visualmente** as assumptions in_progress no client — sem novo endpoint. |
| 11 | Modelo nunca aparece como atividade pendente | ✅ atendido estruturalmente | `receiving_templates` é tabela separada de `checklists`. Nenhuma query operacional (kanban, my-activities, badge, dashboard) consulta `receiving_templates`. **Estrutural, não dependente de flags.** |
| 12 | Execução aparece normalmente após instanciação | ✅ atendido | Execução é um `checklists` normal (active=true, status=active, checklist_type=receiving, is_one_shot=true) com assumption já criada. Entra naturalmente no kanban/my-activities pelo filtro padrão (area/role/user). |
| 13 | Recorrência usada apenas para disponibilidade do modelo | ✅ atendido | RPC NÃO copia `recurrence`/`recurrence_config` para a execução (confirmado na tabela de field mapping §5 do plano e validado no PASS 4). Helper `filterChecklistsByRecurrence` é usado em `/available` apenas. |
| 14 | Modelo continua disponível após execução | ✅ atendido | RPC não toca o template (só SELECT). Próxima chamada com nova idempotency_key cria nova execução. PASS 3 validou. |
| 15 | Ausência total de dependency em `receiving_expectations` | ✅ atendido | Grep nos 6 arquivos novos: zero referência a `receiving_expectations`, `materialize`, `mark-overdue`. RPC não escreve nem lê nesta tabela. |
| 16 | Ausência total de dependency em overdue/pending confirmation | ✅ atendido | Idem #15. RPC não tem qualquer conceito de status `pending` ou `overdue`. Execução nasce diretamente `active=true` + assumption `in_progress`. Sem notificação. |

**Resumo:** 16/16 ✅. Nada parcial. Nada não atendido.

---

## 2. Auditoria de contratos

### 2.1 Endpoints (suficiência para Etapa 3)

| Endpoint | Necessário para Etapa 3 em | Contrato estável? |
|---|---|---|
| `GET /api/receiving-templates` | tela de gestão (CRUD admin) | ✅ — array ordenado por nome com `area` e `role` embed |
| `GET /api/receiving-templates/[id]` | edição (carrega tasks) | ✅ — single ou 404 |
| `POST /api/receiving-templates` | criação | ✅ — 201 + template completo |
| `PATCH /api/receiving-templates/[id]` | edição (incl. replace tasks) | ✅ — 200 + template completo |
| `DELETE /api/receiving-templates/[id]` | arquivamento | ✅ — soft delete |
| `GET /api/receiving-templates/available` | picker do botão "+ Novo Recebimento" | ✅ — array com `tasks_count: number` |
| `POST /api/receiving/instantiate` | confirmar fornecedor + criar execução | ✅ — `{ checklist_id, assumption_id, was_duplicate }` |
| `GET /api/suppliers` (Etapa 1) | dropdown de fornecedores no modal | ✅ |
| `POST /api/suppliers` (Etapa 1) | criar fornecedor inline | ✅ — também viável via `supplier_new` no instantiate |

Cobertura completa. Nenhum endpoint adicional necessário para a Etapa 3.

### 2.2 Payloads

**`POST /api/receiving-templates`** — campos esperados:
- `restaurant_id`, `name`, `area_id`, `recurrence`, `tasks[]` (obrigatórios)
- `description`, `role_id`, `assigned_to_user_id`, `recurrence_config`, `enforce_sequential_order` (opcionais)
- Validação de tasks: 1+, title obrigatório por task.

**`POST /api/receiving/instantiate`** — campos esperados:
- `restaurant_id`, `template_id`, `idempotency_key` (UUID v4) — obrigatórios.
- `supplier_id` OU `supplier_new` (mutuamente exclusivos).
- Idempotency key é UUID-validado server-side.

**Suficiente para a UI da Etapa 3:** o modal de "Novo Recebimento" coleta `template_id` + escolha de fornecedor (existente ou novo). Gera UUID v4 client-side ao abrir o modal. Caller controla o ciclo de vida da key (não regenerar a cada clique).

### 2.3 Hooks

| Hook | Contrato | Pronto para UI |
|---|---|---|
| `useReceivingTemplates(restaurantId, includeInactive)` | array | ✅ |
| `useReceivingTemplate(restaurantId, templateId)` | single | ✅ |
| `useReceivingTemplatesAvailable(restaurantId, areaId?)` | array com `tasks_count` | ✅ — `areaId` opcional para filtro |
| `useCreateReceivingTemplate` | mutation | ✅ |
| `useUpdateReceivingTemplate` | mutation, suporta replace tasks | ✅ |
| `useArchiveReceivingTemplate` | mutation | ✅ |
| `useInstantiateReceiving` | mutation; caller fornece `idempotency_key` estável | ✅ — caller documentado |

### 2.4 Tipos

| Tipo | Onde | Suficiente |
|---|---|---|
| `ReceivingTemplate` | `lib/types/index.ts` | ✅ |
| `ReceivingTemplateTask` | `lib/types/index.ts` | ✅ |
| `Supplier` | `lib/types/index.ts` (Etapa 1) | ✅ |
| `Checklist.source_template_id`, `Checklist.supplier_id` | `lib/types/index.ts` (Etapa 0) | ✅ — Etapa 3 pode ler em qualquer card |
| `ReceivingTemplateAvailable` | `lib/hooks/use-receiving-templates.ts` (extends ReceivingTemplate + `tasks_count: number`) | ✅ |
| `InstantiateReceivingVars` / `InstantiateReceivingResult` | `lib/hooks/use-receiving-instantiate.ts` | ✅ — Result exposto para client decidir navegação pelo `was_duplicate` |

### 2.5 RPCs

| RPC | Assinatura estável? |
|---|---|
| `instantiate_receiving_execution(p_restaurant_id, p_template_id, p_supplier_id, p_user_id, p_user_name, p_idempotency_key)` | ✅ — retorna table(checklist_id, assumption_id, was_duplicate). Mudança futura exigiria nova migration. |
| `replace_receiving_template_tasks(p_template_id, p_restaurant_id, p_tasks jsonb)` | ✅ — retorna void. Atômica. |

Nenhuma RPC precisa de alteração para a Etapa 3.

---

## 3. Achados

### 🟡 Achado 1 — chave de invalidação do kanban incorreta (NÃO BLOQUEANTE)

**Onde:** `lib/hooks/use-receiving-instantiate.ts` linha 51.

**O que:** o hook invalida `["tasks-kanban", restaurant_id]`, mas o hook real do kanban (`lib/hooks/use-tasks.ts:79-80`) usa `['kanban', restaurantId, userId]`.

**Impacto:** após instantiate, o kanban do Meu Turno **não vai refetchar automaticamente** — a execução só aparece após refresh manual ou na próxima refetch por outro motivo. Para `my-activities` e `my-activities-badge` as chaves estão corretas (`['my-activities', …]`, `['my-activities-badge', …]`), confirmado em `use-my-activities.ts:22,86`.

**Classificação:** não bloqueante.
- Não corrompe dados.
- Não invalida o contrato da API.
- É 1 linha de string a trocar.
- A Etapa 3 vai necessariamente revisar invalidações ao escrever o modal/botão; será pego nesse passo.

**Recomendação:** registrar como item de implementação no início da Etapa 3 — trocar `"tasks-kanban"` por `"kanban"` em `use-receiving-instantiate.ts:51`. Se preferir corrigir agora antes do commit, é mudança de 1 linha.

### 🟢 Achado 2 — owner sem `user_areas` recebe lista vazia em `/available` (NÃO BLOQUEANTE)

**Onde:** `app/api/receiving-templates/available/route.ts` linha 64.

**O que:** se o user (mesmo owner) não tiver linha em `user_areas`, o endpoint retorna `[]` early.

**Impacto:** consistente com o resto do sistema (kanban/my-activities/badge têm o mesmo comportamento). Não é regressão; é o contrato de "user precisa estar em uma área para ver atividade operacional".

**Classificação:** não bloqueante. Documentado para ciência.

### 🟢 Achado 3 — `supplier_new` cria fornecedor mesmo se RPC falhar (NÃO BLOQUEANTE)

**Onde:** `app/api/receiving/instantiate/route.ts` linhas 92-115.

**O que:** o fluxo cria supplier antes de chamar a RPC. Se a RPC falhar, o supplier persiste no banco.

**Impacto:** intencional e documentado no plano técnico (§10). Fornecedor cadastrado é estado válido — fica disponível no picker. Nenhuma regressão.

**Classificação:** não bloqueante. Comportamento aprovado em revisão arquitetural.

### 🟢 Achado 4 — RPC `SECURITY DEFINER` sem auth interna (NÃO BLOQUEANTE)

**Onde:** ambas as RPCs.

**O que:** funções rodam com `SECURITY DEFINER` e não fazem checks de membership/escopo internamente — confiam no caller (route handler TS).

**Impacto:** intencional. Plano técnico §10 documentou. Caller (service-role) sempre valida antes de invocar. `search_path` fixo evita injection via search_path tricks.

**Classificação:** não bloqueante. Comportamento aprovado em revisão arquitetural.

### 🟢 Achado 5 — TZ Brasil hardcoded no `date_key` da assumption (NÃO BLOQUEANTE)

**Onde:** RPC `instantiate_receiving_execution` linha "v_today := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD')".

**O que:** sistema é Brasil-only hoje (confirmado em memória de projeto). Se houver expansão multi-país, parametrizar.

**Classificação:** não bloqueante. Documentado.

### 🟢 Achado 6 — Hotfix s59b aplicado direto no banco; arquivo SQL local pode ficar levemente fora de fase em fresh-deploys (NÃO BLOQUEANTE)

**Onde:** `supabase/migrations/20260529_s59_rpc_instantiate_receiving.sql`.

**O que:** o arquivo SQL local foi editado depois do `apply_migration` (linha `'any'` em vez de `NULL`). Em um fresh redeploy a partir da pasta de migrations, a versão correta é aplicada. Apenas no nonprod corrente o histórico em supabase mostra 3 chamadas (s59 + s59b + sobrescritas via CREATE OR REPLACE).

**Impacto:** zero impacto funcional. Arquivo SQL local é a fonte de verdade para deploys futuros.

**Classificação:** não bloqueante.

### 🟢 Achado 7 — Resposta de `/instantiate` é mínima (só IDs) (NÃO BLOQUEANTE)

**Onde:** `app/api/receiving/instantiate/route.ts` linha 155.

**O que:** retorna apenas `{ checklist_id, assumption_id, was_duplicate }`. UI da Etapa 3 não tem o nome do checklist, nome do supplier, etc., no payload direto — precisa buscar via outro endpoint (ou usar dados que já tem do template + supplier escolhido).

**Impacto:** UI da Etapa 3 redireciona para `/turno/atividade/:id/executar` que já carrega tudo via `useActivityExecution`. Não precisa do payload completo no response do instantiate.

**Classificação:** não bloqueante.

---

## 4. Resumo

- **Requisitos:** 16/16 atendidos.
- **Contratos:** estáveis. Etapa 3 não precisa modificar API, payloads, hooks externos, tipos ou RPCs.
- **Achados bloqueantes:** **zero**.
- **Achados não bloqueantes:** 7 (todos documentados acima).

---

## 5. Recomendação

✅ **Commit aprovado.**

A correção da chave de invalidação (Achado 1) pode ser feita como primeiro micro-fix no início da Etapa 3 (1 linha), junto com a implementação do botão "+ Novo Recebimento". Não justifica bloquear o commit.

### Mensagem de commit sugerida

```
feat(recebimentos): Etapa 2 — backend de modelos + instantiate transacional

Implementa a fundação backend do novo fluxo de Recebimentos sem tocar UI
operacional. Cria CRUD de modelos (receiving_templates), endpoint de
disponibilidade por escopo do usuário, e endpoint transacional de
instanciação que cria execução one-shot + tasks snapshot + assumption
in_progress em uma única chamada RPC.

Schema:
- s58: checklists.idempotency_key (uuid + partial unique)
- s59: RPC instantiate_receiving_execution (transacional, idempotente)
  e RPC replace_receiving_template_tasks (replace atômico)

Endpoints:
- GET/POST /api/receiving-templates
- GET/PATCH/DELETE /api/receiving-templates/[id]
- GET /api/receiving-templates/available (picker do Meu Turno)
- POST /api/receiving/instantiate (fonte de verdade do novo fluxo)

Hooks: useReceivingTemplates*, useInstantiateReceiving (caller fornece
idempotency_key).

Field mapping: tasks copiadas como snapshot (template editado depois não
retroage); recurrence/recurrence_config/shift NÃO clonados (execução é
one-shot); fornecedor mora na execução, não no template.

Validado via smoke SQL no nonprod com 6 cenários (criação, idempotência
por chave, N execuções/dia, snapshot, template arquivado retorna
TEMPLATE_NOT_AVAILABLE, cleanup).

Isolamento total do legacy: zero referência a receiving_expectations,
materialize, mark-overdue, pending confirmation. Sem feature flag —
backend é aditivo e o legacy continua operando até a Etapa 4.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## 6. Riscos remanescentes para a Etapa 3

| Risco | Severidade | Mitigação prevista |
|---|---|---|
| Chave de invalidação `'tasks-kanban'` errada (Achado 1) | baixa | corrigir como 1ª linha da Etapa 3 |
| Modal precisa gerar `idempotency_key` estável durante todo o fluxo (não regenerar a cada re-render) | baixa | hook documentado; usar `useMemo` ou `useRef` para a key |
| UI precisa diferenciar visualmente "instanciado de modelo" vs "rotina normal" no card | baixa | campo `source_template_id` no checklist permite render condicional (badge "Modelo: X" ou ícone) |
| Bloco "Executando" precisa de UX coerente em mobile | baixa | componentes do projeto seguem padrão Tailwind; colapso default fechado se >3 itens |
| `useReceivingTemplatesAvailable` re-busca a cada mudança de área no filtro do Meu Turno | baixa | staleTime 30s + key inclui areaId; refetch é barato (escopo do user) |
| Edge case: se template é arquivado entre `/available` e `/instantiate`, RPC retorna `TEMPLATE_NOT_AVAILABLE` → handler 409 | baixa | UI deve mostrar toast "Modelo indisponível, tente outro" e refetch do picker |
| Bug futuro: dois usuários instanciam o mesmo template no mesmo segundo | nenhum | UUID v4 → keys diferentes → 2 execuções distintas (intencional) |

Todos os riscos são de UI/UX da Etapa 3, não de backend. Nenhum exige rework da Etapa 2.

---

**Veredito final:** sem bloqueantes. Commit aprovado. Prosseguir para Etapa 3 após o commit.
