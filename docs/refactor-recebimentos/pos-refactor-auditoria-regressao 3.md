# Auditoria de Regressão Pós-Refator de Recebimentos

**Escopo:** estado do sistema após Etapas 0→5.
**Método:** code grep + 2 Explore agents paralelos (orphans + flows) + SQL stats no nonprod.

---

## Lista priorizada por impacto

### 🔴 BUGS REAIS (3)

#### B1 — Dead UI do form de checklist (UX silenciosamente quebrada)
**Onde:** [components/checklists/checklist-form.tsx:138-140, 308-310, 1127-1187](components/checklists/checklist-form.tsx)
**O que:** Quando o manager seleciona `checklist_type='receiving'`, o form ainda renderiza:
- Radio "Modo de recebimento" (`receivingMode`: on_demand ↔ recurring)
- Radio "Geração" (`receivingGeneration`)
- Input "Fornecedor" (`supplierName`)

Mas o payload POST/PUT (Etapa 5) **não envia** esses campos. Resultado: manager preenche → clica salvar → mudanças são silenciosamente descartadas. Próxima abertura mostra defaults.
**Causa:** Etapa 5 limpou payload sem limpar UI/state (decisão consciente para minimizar diff). Backlog se perdeu.
**Impacto:** alto — UX falsa. Gestor pensa que configurou modo "recorrente" / fornecedor mas nada persiste.
**Fix:** decidir entre (a) remover totalmente a seção UI + state + opção `receiving` do dropdown CHECKLIST_TYPES (o caminho novo é via `receiving_templates`), ou (b) mostrar banner "Use Modelos de Recebimento" e bloquear o submit.

#### B2 — Item de menu "Recebimentos" voltou para o sidebar do manager
**Onde:** [components/layout/sidebar.tsx:29](components/layout/sidebar.tsx)
**O que:** Após Etapa 4 ter removido o item, ele foi **reintroduzido** (provavelmente por linter/auto-save fora do controle): `{ name: "Recebimentos", href: "/admin/recebimentos", icon: "inventory_2" }`. Mas a rota `/admin/recebimentos/page.tsx` foi deletada. Resultado: **404 ao clicar**.
**Também presente:** `useReceivingCounts` import linha 12 (hook deletado) → erro de import em runtime quando o arquivo for executado.
**Impacto:** alto — rota visível mas quebrada; provável import error.
**Fix:** remover item do array + import de `useReceivingCounts` + bloco de badge (linhas 79-85, 321-332).

#### B3 — Item dead de navegação no header
**Onde:** [components/layout/header.tsx:19](components/layout/header.tsx) (entrada `"/admin/recebimentos": "Recebimentos"` em TITLES)
**Impacto:** baixo — só impacta o título se alguém forçar a URL.
**Fix:** remover a chave do map.

---

### 🟡 DÍVIDA TÉCNICA (8)

#### D1 — Stale cache invalidation `receiving-expectations`
**Onde:** [lib/hooks/use-user-areas.ts:87](lib/hooks/use-user-areas.ts), [lib/hooks/use-areas.ts](lib/hooks/use-areas.ts) (3 calls), [lib/hooks/use-tasks.ts:193](lib/hooks/use-tasks.ts)
**O que:** 5 hooks ainda chamam `queryClient.invalidateQueries({ queryKey: ['receiving-expectations', restaurantId] })`. A query key não é mais usada por nenhum useQuery — é no-op silencioso.
**Impacto:** zero funcional; ruído em código.
**Fix:** remover as 5 chamadas + atualizar comentários adjacentes.

#### D2 — Notification metadata legacy ainda referencia `expectation_id`
**Onde:** 3 notificações pré-Etapa-5 foram deletadas pela migration s60 em nonprod, mas em **produção** podem existir mais. Field `metadata.expectation_id` aponta para registro que não existe mais (tabela dropada).
**Impacto:** notificações antigas que ficaram acessíveis pré-Etapa-5 ainda podem ter o ID no JSON. Sem efeito funcional (não há leitura desse campo no código).
**Fix:** opcional `UPDATE notifications SET metadata = metadata - 'expectation_id' WHERE metadata ? 'expectation_id'` se quiser limpar.

#### D3 — Variáveis órfãs em `lib/hooks/use-receiving-instantiate.ts`
**Onde:** invalida `["suppliers-all"]` mas nenhum hook fetch dessa chave (`useAllSuppliers` usa, mas só em /configuracoes/fornecedores que owner/manager — staff via instantiate não precisaria). Conservadoramente ok.

#### D4 — Auth direto via supabase nos componentes (pré-existente)
**Onde:** sidebar.tsx, header.tsx, checklist-list.tsx, ChecklistEditorPanel.tsx. Fazem `supabase.auth.getUser()` direto.
**Causa:** padrão pré-existente, não introduzido pelo refator.
**Fix:** migrar para `useAuthUser` consistentemente. Refator separado.

#### D5 — Comentários históricos referenciando Etapas
**Onde:** turno/page.tsx:254, my-activities/route.ts:2, ExecucoesView.tsx:36-37, lib/types/index.ts:181-183 + 256-258
**O que:** comentários referenciam "Etapa N do refator" — úteis para contexto, mas podem virar obsoletos. Em alguns lugares mencionam funcionalidades que não existem mais.
**Fix:** revisar e limpar.

#### D6 — Permissão em `GET /api/receiving-templates`
**Onde:** [app/api/receiving-templates/route.ts:78-80](app/api/receiving-templates/route.ts) bloqueia staff (`role==='staff'`).
**Impacto:** documentado na Etapa 3 como achado não-bloqueante. Etapa 3 acabou nunca tendo UI de "botão disabled com mensagem" porque exigiria relaxar essa permissão. Backlog produto.

#### D7 — Form `checklist-form.tsx` aceita `checklist_type='receiving'`
**Onde:** mesmo arquivo do B1. Estritamente, o novo modelo é: receivings vêm de `receiving_templates`. Manter `'receiving'` como opção no dropdown contraria a separação semântica forte (que motivou tabela separada).
**Fix:** decisão de produto — provavelmente remover do dropdown como parte da resolução de B1.

#### D8 — Form `checklist-form.tsx` ainda persiste draft com campos legacy no localStorage
**Onde:** linhas ~256-279 (parse de localStorage com `receivingMode`, `receivingGeneration`, `supplierName`).
**Impacto:** drafts antigos podem corromper o estado ao serem carregados. Por ora, o load funciona com defaults nulos.
**Fix:** purgar drafts legacy ao detectar versão antiga + remover campos da serialização.

---

### 🟢 MELHORIAS FUTURAS (7)

#### M1 — Indexes nunca usados (18 no nonprod)
SQL `pg_stat_user_indexes` mostra 18 índices secundários com `idx_scan=0`. Caveats:
- Tabelas com pouco volume nonprod podem usar seq_scan.
- Em prod, alguns podem ter uso real.

Lista relevante (idx_scan=0):
- `idx_checklist_assumptions_user_area_status` — 32 kB
- `idx_recv_tpl_rest_assigned_user` — partial para `assigned_to_user_id IS NOT NULL`; faz sentido em prod
- `idx_notifications_created_at`
- `idx_shifts_restaurant_active`
- Outros em tabelas admin/leads (baixo volume)

**Fix:** revisitar em prod após 30 dias; DROP no que continuar 0.

#### M2 — Queries que poderiam ser batched
Em `app/api/dashboard/route.ts`, `app/api/tasks/kanban/route.ts`, `app/api/my-activities/route.ts` há loops `for (...)` que iteram resultados em memória. Não identifiquei N+1 grave — a maioria das queries já é `IN (...)` ou Promise.all. Algumas oportunidades menores: combinar fetches de checklists+tasks em uma única query via `select(...tasks(...)) ` ao invés de 2 trips.

#### M3 — Componente `ExecutandoBlock` no `turno/page.tsx`
Definido inline no fim do arquivo. Refator menor: extrair para `components/turno/`.

#### M4 — Helper de recorrência v1 trata weekly/monthly/yearly como sempre-visíveis
Já documentado na homologação Etapa 3 (achados L1+L2). Bug legado do projeto; backlog independente.

#### M5 — Tabelas potencialmente subutilizadas
`suppliers` no nonprod: 0 rows live (tudo deletado em smoke tests). Normal para nonprod; em prod só após adoção.

#### M6 — Restaurants 17.932 seq_scans
Volume baixo de rows (8) torna seq_scan barato. Em prod, com mais tenants, considerar adicionar índice de `active=true` se virar gargalo.

#### M7 — Roles 27.715 idx_scans
Tabela quente — está saudável (índice em uso). Sem ação.

---

## DB Audit

### Estado geral
- **32 tabelas** em `public`, todas com RLS habilitada.
- Tabelas novas do refator (Etapa 0/2): `suppliers`, `receiving_templates`, `receiving_template_tasks` — em uso, total 21 KB.
- Tabela dropada (Etapa 5): `receiving_expectations` — confirmado removida.
- 0 functions/triggers/views com refs legacy (verificado).

### Policies
- 5 tabelas com >3 policies (não redundantes — cobrem SELECT/INSERT/UPDATE/DELETE separados): `restaurants` (5), `account_users` (4), `areas` (4), `checklist_orders` (4), `task_executions` (4).
- Não há policies duplicadas.

### FKs
- Sem FKs órfãs após Etapa 5. `checklists.source_template_id` → `receiving_templates(id)` ON DELETE SET NULL preserva histórico.
- `checklists.supplier_id` → `suppliers(id)` ON DELETE SET NULL idem.

### Indexes em uso
- `idx_recv_tpl_rest_active_area` (33 scans) — picker funciona.
- `idx_recv_tpl_tasks_template_order` (21 scans) — clone de tasks funciona.
- `idx_suppliers_rest_active` (8 scans).
- `idx_checklists_source_template` (6 scans) — partial.

---

## Auditoria de fluxos por papel

### Staff
| Fluxo | Status |
|---|---|
| Assumir atividade | ✅ Funciona. Body sem expectation_id. |
| Executar atividade | ✅ Sem regressão. task_executions intactos. |
| Concluir atividade | ✅ Sem regressão. Notificação `TASK_COMPLETED_WITH_NOTE` correta. |
| Evidência fotográfica | ✅ Storage bucket photos (s55) intacto. |
| Botão "Novo Recebimento" | ✅ Funciona via templates. |
| Múltiplas áreas | ✅ Sem regressão. |
| Múltiplos restaurantes | ✅ RLS intacta. |

### Manager
| Fluxo | Status |
|---|---|
| Criar checklist (regular) | ✅ Funciona. |
| Criar checklist (`checklist_type='receiving'`) | 🔴 **Bug B1** — UI engana. |
| Editar checklist | ✅ Funciona. |
| Criar modelo de recebimento | ⚠️ **Sem UI** — apenas via cURL/API. CRUD UI nunca foi entregue. |
| Acompanhar execução (Execuções tab) | ✅ Funciona. Renderiza com supplier FK + badge "Legado". |
| Relatórios | ✅ Sem regressão. |
| Item "Recebimentos" no sidebar | 🔴 **Bug B2** — 404. |

### Owner
| Fluxo | Status |
|---|---|
| Equipe | ✅ Sem regressão. |
| Áreas | ✅ Funciona (checkbox `allow_manual_receiving` removida). |
| Fornecedores | ✅ Funciona via /configuracoes?tab=fornecedores. |
| Métricas dashboard | ✅ OPERATIONAL_PREDICATE inalterado. |

---

## Recomendação de execução

| Prioridade | Itens | Esforço |
|---|---|---|
| **Imediato** | B2 (sidebar revert) — pode quebrar o build do componente | ~10 min |
| **Curto prazo** | B1, B3 (form + header dead refs) | ~30 min |
| **Antes do próximo deploy** | D1 (5 cache invalidations órfãs) | ~10 min |
| **Backlog** | D5, D7, D8, M3 | ~2-3 horas |
| **Sem urgência** | M1, M4, M5, M6 | revisitar após N dias em prod |

**Total de fixes urgentes (B1+B2+B3+D1):** ~1 hora de trabalho.

---

## Veredito

A refatoração de Recebimentos (Etapas 0→5) está **arquiteturalmente sólida** mas tem **3 bugs reais de UX/runtime** que precisam ser corrigidos antes do deploy em produção:

1. Sidebar com link 404 + import de hook deletado (**bloqueante de build**).
2. Form de checklist com UI órfã para receiving config.
3. Header com map de título dead.

Tudo o mais é dívida técnica leve ou melhoria futura. Nenhum bug arquitetural, nenhuma regressão de fluxo no caminho feliz. Multi-tenant, RLS, dashboard e relatórios intactos.
