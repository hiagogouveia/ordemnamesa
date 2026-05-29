# Etapa 2 — Revisão Arquitetural (pré-implementação)

Análise de 5 decisões críticas levantadas. Cada seção entrega trade-off + recomendação. No final, **recomendação consolidada** que substitui partes do plano técnico original.

---

## 1. Tabela separada `receiving_templates` vs reuso de `checklists` com flag de template

### Vantagens da separação (caminho atual da s56)
- **Schema reflete o domínio:** template e execução são conceitos distintos. O schema comunica isso sem depender de convenções de filtro.
- **Impossibilidade estrutural de bug:** queries operacionais (kanban, my-activities, dashboard) nunca precisam lembrar de `WHERE is_template=false`. O esquecimento simplesmente não pode acontecer.
- **Evolução independente:** template pode ganhar campos de catalogação (categoria de mercadoria, tags, SLA esperado) sem poluir o modelo de execução. Execução pode ganhar campos operacionais (supplier_id, idempotency_key, timestamps de cada etapa) sem afetar template.
- **RLS assimétrica natural:** templates podem ser "membros leem; owner/manager escrevem" sem afetar políticas operacionais. Misturado, qualquer mudança em RLS de `checklists` precisa análise dual.
- **Archival assimétrico:** uma política futura "limpar execuções > 1 ano" pode rodar sem tocar templates.
- **Cache mobile diferenciado:** templates são dataset pequeno, estável, cacheável agressivamente (1x sync por dia). Execuções são voláteis, real-time. Separar permite estratégias distintas no offline-first.

### Desvantagens da separação
- **Duplicação inicial de colunas** (name, description, area_id, role_id, assigned_to_user_id, recurrence, recurrence_config, enforce_sequential_order) — paga uma vez na migration.
- **Duplicação de RLS** — 3 policies em 3 tabelas novas vs 0 extras se reusasse `checklists`.
- **Form/hook/types duplicados** — `TemplateForm` separado de `ChecklistForm`; `useReceivingTemplate*` separado de `useChecklist*`.
- **Backfill foi necessário** — já pago (Etapa 0, 4 registros migrados).
- **Reuso de tasks:** `receiving_template_tasks` clone parcial de `checklist_tasks` (sem `checklist_id`, com `template_id`).

### Impacto em 1 ano

| Dimensão | Separação | Reuso (flag `is_template`) |
|---|---|---|
| Nova feature em template (ex: tags) | edita 1 tabela, 1 endpoint | edita `checklists`, força N filtros condicionais nos outros endpoints |
| Bug de relatório (incluir/excluir templates) | impossível | recorrente — toda métrica precisa lembrar do filtro |
| Onboarding de novo dev | claro: 2 entidades, 2 fluxos | dual-purpose `checklists` exige nota mental constante |
| Refactor de campo operacional | seguro — não afeta templates | risco de quebrar templates |

### Impacto em APIs
- **Separação:** contratos por recurso (`/api/receiving-templates/*` vs `/api/checklists/*`). Cada endpoint tem responsabilidade única. Testes isolados.
- **Reuso:** `/api/checklists` vira polimórfico. Rotas como POST teriam que validar "se is_template=true, exigir X campos; senão exigir Y". Validações condicionais.

### Impacto em relatórios
- **Separação:** "execuções de recebimento por fornecedor" = `JOIN checklists s ON s.source_template_id IS NOT NULL`. "Modelos cadastrados" = `COUNT(receiving_templates)`. Queries naturais.
- **Reuso:** toda métrica precisa carregar o filtro de `is_template`. Esquecimento = duplo-contar em dashboard de "rotinas do dia".

### Impacto em mobile futuro
- **Separação:** sync incremental por entidade. App baixa templates 1x (`?updated_since=...`), execuções por dia. Payloads menores, conflitos de merge mais simples.
- **Reuso:** sync de `checklists` precisa diferenciar internamente sem ganho real.

### Recomendação
**Manter separação.** A desvantagem real (duplicação de boilerplate) já foi paga na s56. O ganho de manutenção e clareza ao longo de 1+ ano é claro. Custo único < benefício recorrente.

---

## 2. RPC monolítica vs Service Layer TypeScript

### A) RPC monolítica (proposta original)
**Pros:**
- Atomicidade verdadeira sem 2PC ou compensação.
- 1 round-trip ao DB ao invés de 4 (INSERT checklist + tasks + assumption + idempotency check).
- Race conditions impossíveis dentro da função (Postgres serializa).
- Idempotência via UNIQUE constraint é natural.

**Contras:**
- Lógica em PL/pgSQL — menos legível, menos testável (sem Jest), sem type-safety nativo.
- Cada mudança vira nova migration versionada.
- Stack traces ficam no log do Postgres, fora do Sentry/observabilidade do app.
- Lógica de negócio split: validação no handler, execução no RPC. Cognitive load.
- Code review e refactor mais difíceis.

### B) Service Layer TypeScript com compensação
**Pros:**
- Toda lógica em TS — type-safe, testável (Jest mock do supabase client).
- Stack traces unificados, observabilidade via Sentry/console.
- Refactor com IDE.
- Acessível para devs sem fluência em SQL.

**Contras:**
- Supabase JS **não oferece BEGIN/COMMIT cross-request**. Sem RPC, transação real é impossível.
- Compensação manual (DELETE em reverso quando algo falha) é propensa a erro: o cleanup pode falhar e deixar registros órfãos.
- Mais round-trips ao DB → maior latência.
- Race entre passos: outro processo pode ler estado parcial.
- Idempotência ainda exige UNIQUE no DB (não evita o problema, só o fato de a RPC ser desnecessária).

### C) Híbrido (recomendado)

Service Layer em TS faz:
- Validação de body + escopo do user (membership, área, role).
- Resolução de supplier_new (cria via tabela `suppliers` se necessário; commit independente — fornecedor sem execução é estado válido).
- Logging estruturado, métricas, Sentry.
- Invalidação de cache do lado server (se aplicável).

RPC enxuta `instantiate_receiving_execution` faz **apenas** o passo atômico:
1. Checa idempotency_key.
2. SELECT do template ativo.
3. INSERT checklist (com idempotency_key, FK validadas).
4. INSERT bulk checklist_tasks (snapshot do template).
5. INSERT checklist_assumption já in_progress.
6. Retorna `{ checklist_id, assumption_id, was_duplicate }`.

A RPC perde:
- Resolução de supplier (vira problema do service layer).
- Auth/permission (já no handler).
- Lookup de user_name (move para fora — passa pré-resolvido como parâmetro).

A RPC ganha:
- Foco em "transação crítica" e nada além.
- Mais fácil de revisar (40-50 linhas vs 100+).
- Testável isoladamente via `SELECT instantiate_receiving_execution(...)` em SQL.

| Aspecto | RPC monolítica (A) | Service TS puro (B) | Híbrido (C) |
|---|---|---|---|
| Atomicidade | ✅ | ❌ (compensação manual) | ✅ (apenas no passo crítico) |
| Type safety da maior parte da lógica | ❌ | ✅ | ✅ |
| Observabilidade | parcial | total | total |
| Debug | difícil | fácil | fácil (exceto na RPC) |
| Evolução | migration por mudança | deploy de código | deploy + migration só se mexer no passo crítico |
| Rollback | CREATE OR REPLACE versão anterior | redeploy | ambos |
| Auditoria | concentrada no SQL | integrada ao logging do app | integrada |
| Linhas de SQL custom | ~80 | 0 | ~40 |

### Recomendação
**C — Híbrido.** RPC enxuta para o passo transacional crítico; service layer TS para o resto. Atende "responsabilidade única" em cada camada e preserva atomicidade onde importa.

---

## 3. `idempotency_key` em coluna de `checklists` vs tabela dedicada

### A) Coluna `checklists.idempotency_key` (partial unique)
**Pros:**
- Zero overhead de tabela: 1 coluna + 1 partial index.
- Query natural: `WHERE idempotency_key = $1` direto no INSERT (ON CONFLICT).
- Sem JOIN no fluxo de dedup.
- Aderente ao padrão "simples primeiro" das memórias do projeto.

**Contras:**
- Campo de natureza "operacional/protocolo" no modelo de domínio.
- Não reaproveitável para outros endpoints futuros (cada entidade precisaria sua própria coluna).
- Sem TTL natural — chave fica indefinidamente na linha (custo irrelevante mas conceitualmente sujo).
- Sem auditoria de tentativas duplicadas (sinal valioso de UI bugs ou rede instável).

### B) Tabela dedicada `idempotency_keys`
```sql
create table idempotency_keys (
  key uuid primary key,
  operation text not null,
  user_id uuid not null,
  result_kind text not null,   -- 'checklist', 'supplier', etc.
  result_id uuid not null,
  created_at timestamptz default now()
);
-- TTL via job ou pg_cron: DELETE WHERE created_at < now() - interval '30 days'
```
**Pros:**
- Reutilizável para qualquer endpoint futuro (batch ops, billing, signup, etc.).
- TTL claro.
- Auditoria: contagem de duplicados por operação revela problemas.
- Domínio de `checklists` fica puro.

**Contras:**
- +1 tabela, +1 RLS, +1 manutenção, +1 job de TTL.
- 1 SELECT extra no fluxo (ou ON CONFLICT em 2 tabelas separadas).
- Overengineering para 1 endpoint só.

### C) `request_log` amplo
Sobreposição com Sentry/observabilidade. Custo de armazenamento alto. Fora do escopo.

### Análise de sustentabilidade

| Critério | A (coluna) | B (tabela) |
|---|---|---|
| Custo de implementação agora | ~5 linhas SQL | ~30 linhas SQL + RLS + TTL |
| Custo de manutenção 1 ano (1 endpoint) | baixo | baixo |
| Custo se virar pattern (5+ endpoints) | alto (copia-coluna) | baixo (1 tabela serve todos) |
| Risco YAGNI | baixo | médio-alto |
| Aderência ao padrão de simplicidade do projeto | alta | média |

### Recomendação
**A (coluna) — manter.** Karpathy + memória `karpathy-guidelines`: não criar abstração para hipótese futura. Se um 2º endpoint precisar de idempotência, criamos a tabela dedicada e migramos. Custo de migração futuro é baixo (script único).

Adiciono nota no comentário da coluna documentando essa decisão para que a migração futura (se acontecer) tenha contexto.

---

## 4. Remover `shift`, `start_time`, `end_time` do template

**Estado atual da s56:** template tem `shift` nullable; `start_time` e `end_time` **não foram criados** (já omitidos). Decisão restante: manter `shift` ou remover?

### Argumento para remover `shift`
- Princípio do plano original: "modelo não precisa de hora". Por extensão, talvez não precise de turno.
- Disponibilidade vem 100% da recorrência. Recorrência já permite "weekdays", "shift_days", custom — cobre os casos.
- Schema mais limpo: template é puramente "blueprint disponível quando a entrega chega".
- Form de cadastro mais simples — menos um campo, menos uma decisão para o gestor.
- Sem ambiguidade entre "shift do template" e "shift do turno corrente do usuário".

### Argumento para manter `shift`
- Permite ao gestor dizer "este recebimento só faz sentido no turno da manhã" (hortifruti chega cedo).
- Picker pode filtrar adicional por turno corrente para reduzir poluição visual.
- Custo: 1 coluna nullable, 1 filtro opcional. Baixíssimo.
- Reversível: remover depois é trivial; adicionar de volta exige migration + form change.

### Impactos da remoção

**Positivos:**
- Schema 1 coluna mais enxuto.
- Modelo conceitual mais alinhado ao plano ("modelo operacional disponível").
- Menos decisões na criação.

**Negativos:**
- Sem dimensão extra de filtro no picker. Se houver 8 templates em 4 turnos diferentes, todos aparecem o dia inteiro.
- Reintrodução futura, se virar dor, custa migration + form change + filtro novo.

### Recomendação
**Remover `shift` do template.** Alinha-se ao plano original ("modelo não precisa de hora") e à diretriz Karpathy de não adicionar abstração para caso hipotético. Picker pode oferecer ordenação/agrupamento por área (já presente) sem precisar de filtro por turno. Se a poluição virar real depois, voltamos.

Já não temos `start_time`/`end_time` — manter assim.

Ajuste: na s56 já aplicada, **deixar a coluna `shift` no schema** (já existe) mas **não exibir no form e não filtrar por ela no picker**. Removê-la fisicamente exige outra migration; deixar nullable e ignorada é equivalente operacionalmente e evita migration extra agora. Documentar como deprecated.

---

## 5. `supplier_new` no `/api/receiving/instantiate`

**Confirmado pelo user.** Mantém-se no endpoint. Service layer cria supplier via `/api/suppliers` internamente (ou direto na tabela com mesmas validações), depois chama RPC. Se RPC falhar após supplier criado: aceito — fornecedor cadastrado é estado válido, fica disponível no picker.

---

## Recomendação final consolidada

### Mudanças sobre o plano técnico original

1. **Manter separação `receiving_templates` + `receiving_template_tasks`.** (§1 confirmou.)
2. **Adotar arquitetura híbrida (RPC + service layer TS).** Substitui o "RPC monolítica" do plano original. A RPC fica responsável apenas pelo passo atômico (INSERT checklist + tasks + assumption + idempotency check). Validação de auth/escopo, criação de supplier_new, logging, métricas — tudo no route handler em TS.
3. **Manter `idempotency_key` como coluna em `checklists`** com partial unique. Comentário documentando que migração para tabela dedicada é trivial se virar pattern.
4. **Não usar `shift` no template:** sem exibir no form, sem filtrar no picker. Coluna fica no schema (já existe) marcada como deprecated no comentário (não dropar agora para evitar migration adicional sem benefício).
5. **`supplier_new` no instantiate confirmado.**

### Atualização do field mapping (§5 do plano original)

Mudanças no que era proposto:

| Campo template | Decisão | Antes |
|---|---|---|
| `shift` | ❌ não exibir, não usar | considerado opcional |

### Atualização da sequência de execução (§12 do plano original)

1. **s58 (idempotency_key column + partial unique index).** Coluna em `checklists`.
2. **s59 (RPC enxuta `instantiate_receiving_execution`).** Sem auth, sem resolução de supplier — apenas passo transacional.
3. Refator: extrair `filterChecklistsByRecurrence` para `lib/recurrence/match.ts`.
4. Route handlers:
   - `/api/receiving-templates/*` (GET list, GET id, POST, PATCH, DELETE)
   - `/api/receiving-templates/available`
   - `/api/receiving/instantiate` — orquestra: valida → resolve supplier → chama RPC → loga → responde
5. Hooks (`useReceivingTemplates*`, `useInstantiateReceiving` com `idempotency_key` gerado via `crypto.randomUUID()`).
6. Testes manuais §11 do plano original + cenários de race com idempotency.
7. Documentar em `docs/refactor-recebimentos/etapa-2-resultado.md`.

### Riscos atualizados

| Risco original | Status pós-revisão |
|---|---|
| RPC SECURITY DEFINER vetor de privesc | mitigado: lógica enxuta, sem condicionais de role |
| Helper de recorrência quebra ao extrair | sem mudança |
| PATCH replace de tasks deixa órfãs | RPC dedicada `replace_receiving_template_tasks` mantida |
| Cliente esquece idempotency_key | hook gera por default, opcional override |
| supplier_new cria mas instantiate falha | aceito como estado válido (fornecedor disponível) |
| TZ Brasil hardcoded | sem mudança |
| Lock contention em idempotency | sem mudança |

### Resposta às perguntas em aberto do plano original

1. **Template precisa de `shift`?** **Não.** Decisão de §4.
2. **Template editável por staff?** Não. Confirmado.
3. **`supplier_new` no instantiate?** Sim. Confirmado em §5.
4. **GET `/available` retorna tasks?** Só metadado + `tasks_count`. Confirmado.
5. **Histórico de quem instanciou?** Via `created_by` + `source_template_id`. Confirmado.

---

**Aguardo aprovação desta revisão consolidada antes de iniciar a sequência §12 atualizada.**
