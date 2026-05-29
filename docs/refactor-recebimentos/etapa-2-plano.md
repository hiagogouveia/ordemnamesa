# Etapa 2 — Plano Técnico

**Escopo:** CRUD de modelos de recebimento + endpoint de instanciação de execução. Backend completo do novo fluxo, sem tocar em UI operacional (Meu Turno) e sem reusar nenhum endpoint legado.

---

## 1. Princípios de design

1. **Isolamento total do legado.** Nenhum endpoint novo lê, escreve ou aciona `receiving_expectations`, `materialize.ts`, `mark-overdue`, ou `confirm/cancel`. O legado continua existindo (Etapa 0 deixou intacto) mas é "código morto" do ponto de vista do novo fluxo.
2. **Snapshot, não referência.** Tasks são *copiadas* do template para `checklist_tasks` no momento da instanciação. Mudar o template depois NÃO altera execuções existentes. Apagar template NÃO derruba execuções (`ON DELETE SET NULL` em `checklists.source_template_id`, configurado em s56).
3. **Execução nasce limpa.** Sem `recurrence`, sem `receiving_mode`, sem `receiving_generation`, sem `start_time`/`end_time`, sem janela, sem alerta — uma vez instanciada, é uma atividade one-shot indistinguível de qualquer rotina concluindo agora.
4. **Atomicidade real via RPC.** Toda a instanciação (checklist + tasks + assumption) roda dentro de uma única função Postgres → transação verdadeira, não compensação manual.
5. **Idempotência por `idempotency_key`.** Cliente gera UUID por intenção de clique; servidor deduplica. Resolve clique duplo, retry de rede, refresh durante criação.

---

## 2. Mudança de schema (mini-migration s58)

Adições necessárias para suportar idempotência. **Aditivo, não destrutivo.**

```sql
-- s58_checklists_idempotency.sql

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS idempotency_key uuid NULL;

-- Idempotência por chave em execuções one-shot. Partial unique evita custo em
-- linhas legadas (NULL) e permite ON CONFLICT direto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_checklists_idempotency_key
  ON public.checklists (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.checklists.idempotency_key IS
  'UUID gerado pelo cliente para deduplicar criação de execuções (clique duplo, retry, refresh). Aplicável apenas a execuções one-shot.';
```

---

## 3. Endpoints

### 3.1 `GET /api/receiving-templates`
**Quem chama:** tela de gestão (owner/manager) + telas auxiliares.
**Query params:** `restaurant_id` (obrig.), `include_inactive=true|false` (default false).
**Permissão:** owner/manager (staff bate em `/available` em vez disso).
**Resposta:**
```ts
ReceivingTemplate[]  // sem tasks no list, busca por id se precisar
```
**Ordem:** `name ASC`.

### 3.2 `GET /api/receiving-templates/[id]`
**Permissão:** membro do restaurante (template é "público" dentro do tenant — staff também pode ver tasks pra preview).
**Resposta:**
```ts
ReceivingTemplate & { tasks: ReceivingTemplateTask[] }
```

### 3.3 `POST /api/receiving-templates`
**Permissão:** owner/manager.
**Body:**
```ts
{
  restaurant_id: string;
  name: string;                      // required
  description?: string;
  area_id: string;                   // required
  role_id?: string;
  assigned_to_user_id?: string;
  shift?: 'morning' | 'afternoon' | 'evening' | null;
  recurrence: 'daily' | 'weekly' | ...;  // required, default 'daily'
  recurrence_config?: RecurrenceConfig;
  enforce_sequential_order?: boolean;
  tasks: Array<{
    title: string;                   // required
    description?: string;
    order: number;
    requires_photo?: boolean;
    is_critical?: boolean;
    requires_observation?: boolean;
    type?: 'boolean'|'date'|'number'|'rating';
    max_photos?: number;
    task_config?: TaskConfig;
  }>;
}
```
**Validação:**
- `name.trim()` não-vazio.
- `area_id` existe e pertence ao restaurante.
- `role_id`, `assigned_to_user_id` (se enviados) existem e pertencem ao restaurante.
- `tasks.length >= 1`; cada task com title não-vazio.
- `recurrence` no enum válido.
- Conflito de nome único por restaurante? **Não.** Templates podem ter nomes repetidos (ex: "Hortifruti" em duas áreas distintas).
**Resposta:** `ReceivingTemplate & { tasks: [...] }`, status 201.

### 3.4 `PATCH /api/receiving-templates/[id]`
**Permissão:** owner/manager.
**Body:** mesmos campos do POST, todos opcionais. **Importante:** se `tasks` for enviado, faz **replace total** (DELETE tasks antigas + INSERT novas via RPC). Se `tasks` ausente, tasks ficam intactas.
**Edita template ≠ edita execuções passadas.** Execuções já criadas têm snapshot próprio em `checklist_tasks` — não são tocadas.

### 3.5 `DELETE /api/receiving-templates/[id]`
**Permissão:** owner/manager.
**Comportamento:** soft-delete (`active=false`). Execuções já criadas continuam funcionando. Pode ser reativado via PATCH `{ active: true }`.

### 3.6 `GET /api/receiving-templates/available`
**Quem chama:** botão "+ Novo Recebimento" no Meu Turno.
**Query params:** `restaurant_id` (obrig.), `date` (opcional, default = hoje em TZ Brasil), `area_id` (opcional para filtrar por área ativa do filtro).
**Permissão:** qualquer membro autenticado.
**Lógica de visibilidade (escopo do user):**
1. `template.active = true`.
2. Recorrência bate com `date` (usa `filterChecklistsByRecurrence` ou helper equivalente — ver §6).
3. Escopo (em ordem de especificidade):
   - Se `assigned_to_user_id` preenchido → match `user.id`.
   - Senão, se `role_id` preenchido → user precisa ter esse role (`user_roles`).
   - Senão → user precisa pertencer à área (`user_areas`).
   - Owner/manager **não tem bypass** — segue mesma regra (alinhado ao restante do sistema).
4. Filtro adicional por `area_id` query param (se enviado, só templates daquela área).
**Resposta:**
```ts
Array<ReceivingTemplate & { tasks_count: number }>
```
`tasks_count` é hint para UI sem precisar carregar tasks no picker.

### 3.7 `POST /api/receiving/instantiate` ⭐ (nova fonte de verdade)
**Quem chama:** colaborador após escolher modelo + fornecedor no Meu Turno.
**Body:**
```ts
{
  restaurant_id: string;
  template_id: string;
  supplier_id?: string;          // exclusivo com supplier_new
  supplier_new?: {               // cria supplier antes de instanciar
    name: string;
    cnpj?: string;
  };
  idempotency_key: string;       // UUID v4 gerado pelo cliente (obrig.)
}
```
**Permissão:** qualquer membro autenticado. Mesmo escopo de `/available` aplicado server-side (defesa em profundidade).
**Resposta:**
```ts
{
  checklist_id: string;
  assumption_id: string;
  was_duplicate: boolean;        // true se idempotency_key já existia
}
```
HTTP 201 se nova, 200 se duplicate.

---

## 4. RPC Postgres (transação real)

Função `instantiate_receiving_execution` faz tudo num único `BEGIN/COMMIT` implícito (função plpgsql).

```sql
CREATE OR REPLACE FUNCTION public.instantiate_receiving_execution(
  p_restaurant_id   uuid,
  p_template_id     uuid,
  p_supplier_id     uuid,        -- NULL se sem fornecedor
  p_user_id         uuid,        -- staff que está executando
  p_idempotency_key uuid
)
RETURNS TABLE (
  checklist_id   uuid,
  assumption_id  uuid,
  was_duplicate  boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_checklist  uuid;
  v_existing_assumption uuid;
  v_new_checklist       uuid;
  v_new_assumption      uuid;
  v_template            public.receiving_templates%ROWTYPE;
  v_today               date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  -- 1. Idempotency check: chave já consumida?
  SELECT c.id INTO v_existing_checklist
  FROM public.checklists c
  WHERE c.idempotency_key = p_idempotency_key
    AND c.restaurant_id = p_restaurant_id;

  IF v_existing_checklist IS NOT NULL THEN
    SELECT a.id INTO v_existing_assumption
    FROM public.checklist_assumptions a
    WHERE a.checklist_id = v_existing_checklist
    LIMIT 1;

    RETURN QUERY SELECT v_existing_checklist, v_existing_assumption, true;
    RETURN;
  END IF;

  -- 2. Snapshot do template (SELECT já lock-aware o suficiente — template
  --    não deve mudar durante a tx; PATCH paralelo no template não afeta
  --    esta cópia porque já estamos lendo uma versão consistente).
  SELECT * INTO v_template
  FROM public.receiving_templates
  WHERE id = p_template_id
    AND restaurant_id = p_restaurant_id
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_AVAILABLE' USING ERRCODE = 'P0002';
  END IF;

  -- 3. INSERT checklist (execução one-shot)
  INSERT INTO public.checklists (
    restaurant_id, name, description,
    shift, status, active, created_by, created_at,
    checklist_type, is_one_shot,
    area_id, role_id, assigned_to_user_id,
    enforce_sequential_order,
    source_template_id, supplier_id,
    idempotency_key
  )
  VALUES (
    p_restaurant_id, v_template.name, v_template.description,
    NULL, 'active', true, p_user_id, now(),
    'receiving', true,
    v_template.area_id, v_template.role_id, v_template.assigned_to_user_id,
    v_template.enforce_sequential_order,
    v_template.id, p_supplier_id,
    p_idempotency_key
  )
  RETURNING id INTO v_new_checklist;

  -- 4. Clona tasks (SNAPSHOT — única fonte de verdade dali em diante)
  INSERT INTO public.checklist_tasks (
    checklist_id, restaurant_id, title, description, "order",
    requires_photo, is_critical, requires_observation,
    type, max_photos, task_config
  )
  SELECT
    v_new_checklist, p_restaurant_id, tt.title, tt.description, tt."order",
    tt.requires_photo, tt.is_critical, tt.requires_observation,
    tt.type, tt.max_photos, tt.task_config
  FROM public.receiving_template_tasks tt
  WHERE tt.template_id = p_template_id
  ORDER BY tt."order";

  -- 5. Cria assumption já in_progress
  INSERT INTO public.checklist_assumptions (
    restaurant_id, checklist_id, user_id, user_name,
    date_key, assumed_at, execution_status
  )
  SELECT
    p_restaurant_id, v_new_checklist, p_user_id,
    COALESCE(u.raw_user_meta_data->>'name', u.email, 'Colaborador'),
    v_today, now(), 'in_progress'
  FROM auth.users u
  WHERE u.id = p_user_id
  RETURNING id INTO v_new_assumption;

  RETURN QUERY SELECT v_new_checklist, v_new_assumption, false;
END;
$$;
```

Notas:
- `SECURITY DEFINER` permite que o service role do route handler chame, e a função opera com permissões plenas. **Auth/permission check fica 100% no route handler** (verificar membership, escopo, template ativo).
- Se INSERT em checklists falhar por race em `idempotency_key` (concorrente), o `UNIQUE` constraint dispara `23505`. O handler captura, reconsulta e retorna `was_duplicate=true`.
- Toda a função roda como uma única transação. Erro em qualquer ponto → rollback automático (sem compensação manual).

---

## 5. Field mapping (CRITICAL — auditável)

### Template → Execution checklist

| Campo template | Vai para execution? | Como |
|---|---|---|
| `id` | ❌ | execução tem id próprio |
| `restaurant_id` | ✅ | mesmo valor |
| `name` | ✅ | copiado direto |
| `description` | ✅ | copiado |
| `area_id` | ✅ | copiado (define escopo do card) |
| `role_id` | ✅ | copiado (preserva escopo) |
| `assigned_to_user_id` | ✅ | copiado |
| `shift` | ❌ | execução tem `shift=NULL` (sem agenda) |
| `recurrence` | ❌ | execução one-shot, sem recorrência |
| `recurrence_config` | ❌ | idem |
| `enforce_sequential_order` | ✅ | comportamento de tasks preservado |
| `active` | — | execução nasce `active=true` (literal) |
| `created_by` | ❌ | execução: `created_by = user_id` do staff que clicou |
| `created_at` | ❌ | execução: `now()` |

### Campos legacy do checklist que **NÃO existem** no template (e portanto NÃO entram na execução)
- `receiving_mode` — não cloned (legacy)
- `receiving_generation` — não cloned (legacy)
- `supplier_name` (text livre) — substituído por `supplier_id` (FK)
- `start_time` / `end_time` — sem horário operacional
- `last_reset_at` — N/A em one-shot

### Campos da execução **novos** (criados na instanciação, não vêm do template)

| Campo | Valor |
|---|---|
| `checklist_type` | `'receiving'` (literal) |
| `is_one_shot` | `true` (literal) |
| `source_template_id` | `template.id` (link de origem) |
| `supplier_id` | passed via API (FK) |
| `idempotency_key` | passed via API (UUID) |
| `status` | `'active'` |

### Template task → Checklist task

| Campo template_task | Vai? |
|---|---|
| `title` | ✅ |
| `description` | ✅ |
| `order` | ✅ |
| `requires_photo` | ✅ |
| `is_critical` | ✅ |
| `requires_observation` | ✅ |
| `type` | ✅ |
| `max_photos` | ✅ |
| `task_config` | ✅ |
| `template_id` | ❌ (substituído por `checklist_id`) |
| `restaurant_id` | ✅ |

Não há `role_id`/`assigned_to_user_id` em template_task → execução nasce sem essas restrições por task (mesma decisão do quick receiving atual).

---

## 6. `filterChecklistsByRecurrence` — reuso

O helper já existe em `lib/receiving/materialize.ts` (usado pela materialização legada). Não tocaremos no arquivo legacy. Vamos:
- **Opção A (preferida):** extrair o helper puro para `lib/recurrence/match.ts` (movimento de código sem alterar lógica), e ambos lados usam.
- **Opção B:** duplicar a lógica em `lib/receiving-templates/availability.ts`.

Vou pela **A** — fonte única de verdade. Refator mecânico, sem impacto operacional.

Input do helper: `{ recurrence, recurrence_config, shift }` + data. Funciona para template (mesmo shape).

---

## 7. Estratégia anti-duplicação (matriz de cenários)

| Cenário | Como o sistema responde |
|---|---|
| **Clique duplo no botão "Confirmar"** | Cliente gera `idempotency_key` UNA vez ao abrir o modal. Os dois POSTs carregam mesma key → segundo cai no UNIQUE, retorna `was_duplicate=true` com mesmo `checklist_id`. UI mostra "Recebimento já registrado", navega para execução. |
| **Retry automático do browser (timeout/rede)** | Idem: a key foi reutilizada na 2ª tentativa. |
| **Refresh durante a request** | Se a request chegou ao servidor antes do refresh, execução foi criada → ao voltar, user vê em "Executando". Se não chegou, key não foi consumida e nova tentativa funciona normal. |
| **Modal fechado antes do response** | Mesma coisa: execução pode ter sido criada. Aparecerá no bloco "Executando" no Meu Turno (mesmo sem o redirect que o modal faria). |
| **Dois usuários distintos no mesmo modelo no mesmo segundo** | Keys diferentes → 2 execuções diferentes (correto — mesmo modelo pode produzir N execuções por dia, mesmo simultâneas). |
| **Template arquivado entre `/available` e `/instantiate`** | RPC encontra `active=false` → RAISE `TEMPLATE_NOT_AVAILABLE`. Handler retorna HTTP 409 com mensagem clara → UI sugere refetch do picker. |
| **Supplier arquivado entre fetch e instanciate** | FK ainda válida, INSERT funciona. Execução fica com supplier arquivado vinculado (correto — histórico). |
| **Template editado durante instanciação** | RPC lê o template em snapshot dentro da tx; INSERT de tasks roda no mesmo instante. Mesmo se um PATCH paralelo commitou antes, o SELECT inicial pegou versão consistente (Read Committed default). Pior caso: novo template tem tasks A, B, C; PATCH muda pra A, B, D; instanciação pode pegar A, B, C ou A, B, D (qualquer um — ambos são "consistentes"). Pode-se hardenizar com SELECT FOR SHARE se virar problema, mas overhead desnecessário pra um caso raro. |
| **Idempotency key reusada após N dias (colisão prática zero com UUIDv4)** | UNIQUE index garante consistência. Se acontecesse: 2º request retorna o 1º execution. Aceitável. |

---

## 8. Estratégia de invalidação React Query

### Após `POST /api/receiving-templates` (create)
```
invalidate ['receiving-templates', restaurantId]
invalidate ['receiving-templates-available', restaurantId, ...]
```

### Após `PATCH /api/receiving-templates/[id]`
```
invalidate ['receiving-templates', restaurantId]
invalidate ['receiving-template', templateId]
invalidate ['receiving-templates-available', restaurantId, ...]
```
**Não invalidar** queries operacionais (kanban, my-activities) — execuções passadas não mudam.

### Após `DELETE` (archive)
```
invalidate ['receiving-templates', restaurantId]
invalidate ['receiving-templates-available', restaurantId, ...]
```

### Após `POST /api/receiving/instantiate`
```
invalidate ['tasks-kanban', restaurantId, userId]    // execução aparece em Meu Turno
invalidate ['my-activities', restaurantId, userId]   // contador do dia
invalidate ['assumptions-in-progress', userId]       // bloco "Executando" (Etapa 3)
invalidate ['suppliers', restaurantId]               // se supplier_new foi criado
```
**Não invalidar** `receiving-templates*` — o template em si não mudou.

`was_duplicate=true` → mesmo cliente já invalidou tudo no primeiro request; segunda invalidação é no-op.

---

## 9. Arquivos novos / tocados

**Migration:**
- `supabase/migrations/20260528_s58_checklists_idempotency.sql` (coluna + unique partial)
- Aplicação via `mcp__supabase__apply_migration` no nonprod.

**RPC:**
- Definida na mesma migration s58 ou em s59 dedicada — recomendo separar em s59 pra facilitar rollback isolado da função.
  - `supabase/migrations/20260528_s59_rpc_instantiate_receiving.sql`

**Backend (route handlers):**
- `app/api/receiving-templates/route.ts` — GET (list), POST (create)
- `app/api/receiving-templates/[id]/route.ts` — GET (detail), PATCH (edit), DELETE (archive)
- `app/api/receiving-templates/available/route.ts` — GET disponíveis hoje
- `app/api/receiving/instantiate/route.ts` — POST instanciar
- (refator) `lib/recurrence/match.ts` — extração do helper hoje em `lib/receiving/materialize.ts` (movimento puro, sem alterar comportamento legado)

**Hooks (sem UI ainda):**
- `lib/hooks/use-receiving-templates.ts` — `useReceivingTemplates`, `useReceivingTemplate`, `useReceivingTemplatesAvailable`, `useCreateReceivingTemplate`, `useUpdateReceivingTemplate`, `useArchiveReceivingTemplate`
- `lib/hooks/use-receiving-instantiate.ts` — `useInstantiateReceiving` (mutation com idempotency_key gerada pelo caller)

**Tipos:** já existem (Sprint 56 adicionou `ReceivingTemplate`, `ReceivingTemplateTask`, `Supplier`). Talvez adicionar:
- `ReceivingTemplateAvailable = ReceivingTemplate & { tasks_count: number }`
- `InstantiateResponse = { checklist_id: string; assumption_id: string; was_duplicate: boolean }`

**NÃO tocados nesta etapa:**
- `app/(app)/turno/page.tsx` — Meu Turno fica para Etapa 3.
- `app/(app)/admin/recebimentos/*` — fica para Etapa 4.
- `components/checklists/checklist-form.tsx` — form de checklist fica para Etapa 5.
- `lib/receiving/materialize.ts` — legacy intacto (só refator puro do helper de recorrência, sem alterar comportamento).
- Qualquer endpoint `/api/receiving-expectations/*` — intocados.

---

## 10. Riscos e mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| **RPC `SECURITY DEFINER` virar vetor de privilege escalation** | Alta | Função NÃO executa lógica de permissão. Auth/scope check inteiramente no route handler antes do RPC. RPC só faz INSERTs determinísticos com inputs já validados. Search_path fixado. |
| **`auth.users.raw_user_meta_data->>'name'` ausente → assumption sem user_name** | Baixa | Fallback `COALESCE(name, email, 'Colaborador')` no RPC. |
| **Helper de recorrência (`filterChecklistsByRecurrence`) quebra ao extrair** | Média | Refator é movimento puro: copia função, ajusta imports nos 2 callers, roda tsc. Não altera assinatura nem lógica. |
| **`PATCH` template com replace de tasks deixa orfãs em meio-caminho** | Média | RPC dedicada `replace_receiving_template_tasks(template_id, tasks[])`: DELETE + INSERT na mesma transação. |
| **Cliente esquece de enviar `idempotency_key`** | Média | Handler retorna 400 com mensagem clara. Hook `useInstantiateReceiving` sempre gera via `crypto.randomUUID()` — caller não precisa fornecer. |
| **`supplier_new` cria fornecedor mas instanciação falha depois** | Média | Solução simples: criar supplier ANTES de chamar o RPC, no handler. Se RPC falhar, o supplier fica criado (não é destruído). Aceito: fornecedor sem execução é estado válido (gestor cadastrou e está disponível). |
| **TZ Brasil hardcoded no RPC (`America/Sao_Paulo`)** | Baixa | Sistema é Brasil-only hoje. Documentado no comentário. Se virar multi-país, parametrizar. |
| **Idempotency unique constraint causa lock contention sob carga alta** | Baixa | Partial unique tem custo desprezível para volume esperado. Postgres lida bem com `ON CONFLICT`. |
| **Template arquivado durante migração da Etapa 3 deixa execuções "órfãs visualmente"** | Baixa | UI da Etapa 3 mostra `supplier.name` e `source_template_id` apenas para link de auditoria; nome do checklist já foi snapshot, então UX não quebra. |
| **Race em PATCH template + instantiate paralelo** | Baixa | Documentado em §7. Snapshot read garante consistência por execução. Não vale otimização extra. |

---

## 11. Plano de validação

1. **Migration s58 + s59** aplicada em nonprod via MCP.
2. **`npx tsc --noEmit`** zerado nos arquivos novos.
3. **Testes manuais (cURL ou hook em página dummy)** ordenados:
   - POST template (1 fornecedor + 3 tasks) → 201.
   - GET templates list → vê o template criado.
   - GET template/[id] → vê tasks na ordem.
   - GET available com user staff de outra área → não vê (escopo).
   - GET available com user staff da área → vê.
   - POST instantiate com idempotency_key X → 201, checklist + tasks + assumption no DB. Validar via SQL.
   - POST instantiate com MESMA idempotency_key X → 200, `was_duplicate=true`, mesmo `checklist_id`.
   - PATCH template alterando nome + tasks → execução anterior não afetada (validar tasks na execução vs novas no template).
   - DELETE template → `active=false`. POST instantiate com template arquivado → 409 `TEMPLATE_NOT_AVAILABLE`.
   - PATCH `{ active: true }` → reativa.
4. **RLS cross-tenant:** instantiate com user de restaurante A tentando template de restaurante B → 403 no handler (validation explícita) ou 409 (template not found).
5. **Validar não-regressão do legacy:** confirmar que `/api/receiving-expectations` continua respondendo, que materialização ainda funciona para os 0 templates restantes (não restam após backfill). Smoke em Meu Turno do nonprod.

---

## 12. Sequência de execução proposta

1. Criar/aplicar migration s58 (idempotency_key).
2. Criar/aplicar migration s59 (RPC `instantiate_receiving_execution` + RPC de replace tasks).
3. Extrair `filterChecklistsByRecurrence` para `lib/recurrence/match.ts`. Ajustar import em `materialize.ts`. tsc + grep para confirmar nada quebrou.
4. Criar route handlers `/api/receiving-templates/*` (5 handlers).
5. Criar route handler `/api/receiving/instantiate`.
6. Criar hooks.
7. Tipos auxiliares.
8. Validar via SQL os 10 cenários do §11.
9. Documentar resultado em `docs/refactor-recebimentos/etapa-2-resultado.md` (similar ao da Etapa 0).

---

## 13. Perguntas em aberto antes de codar

1. **Template precisa de `shift` (manhã/tarde/noite)?** Hoje no schema ele é nullable. Plano original disse "modelo não precisa ter hora". Se virar útil pro filtro do picker, mantemos. Proposta: manter nullable, usar quando o gestor quiser restringir disponibilidade por turno (além da recorrência).
2. **Template pode ser editado por staff?** Não. Apenas owner/manager (já consistente com policies do s56).
3. **`supplier_new` no instantiate ou força criar via `/api/suppliers` antes?** Proposta: aceitar `supplier_new` no instantiate por UX mobile (1 passo a menos). Cria via Supplier API internamente no handler antes de chamar o RPC.
4. **GET `/available` deve retornar tasks junto ou só metadado?** Proposta: só metadado + `tasks_count`. Picker mostra nome, área, supplier hint, qtd de tasks. Tasks completas só ao instanciar (ou se UI quiser preview, busca por id).
5. **Histórico de quem instanciou qual template?** Já temos via `checklists.created_by` + `source_template_id`. Suficiente para relatório futuro sem campos extras.

---

**Pronto para revisão.** Aguardo aprovação ou ajustes antes de iniciar a codificação na ordem do §12.
