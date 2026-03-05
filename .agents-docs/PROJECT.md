# PROJECT.md — Ordem na Mesa
> Plano completo de implementação do SaaS. Usar como guia mestre para IAs.
> Sempre ler junto com: CONTEXT.md + PROGRESS.md

---

## 📦 O que já existe (não reimplementar)

| Módulo | Arquivos | Status |
|---|---|---|
| Auth (login/logout) | `app/(auth)/login/`, `middleware.ts` | ✅ |
| Seleção de restaurante | `app/(app)/selecionar-restaurante/` | ✅ |
| Layout admin (sidebar) | `app/(app)/layout.tsx` | ✅ |
| Zustand store | `lib/store/restaurant-store.ts` | ✅ |
| CRUD Checklists | `app/(app)/checklists/`, `app/api/checklists/` | ✅ |
| Execução STAFF turno | `app/(app)/turno/`, `app/api/execucoes/` | ✅ |
| Upload de foto evidência | `app/api/execucoes/`, Bucket `photos` | ✅ |
| Histórico STAFF | `app/(app)/historico/` | ✅ |
| Dashboard Manager | `app/(app)/dashboard/`, `app/api/dashboard/` | ✅ |
| React Query hooks | `lib/hooks/use-checklists.ts`, `use-execucoes.ts`, `use-dashboard.ts` | ✅ |
| Tipos compartilhados | `lib/types/index.ts` | ✅ |

---

## 🗄️ Schema de Banco (já aplicado — não recriar)

O `SCHEMA.sql` já está aplicado no NONPROD. Tabelas existentes:

```
users            → espelhado de auth.users via trigger
restaurants      → cadastro do restaurante (owner_id, slug, logo_url)
restaurant_users → pivot RBAC: user_id × restaurant_id × role(owner|manager|staff) × active
checklists       → templates de rotinas (shift: morning|afternoon|evening|any)
checklist_tasks  → tarefas dentro de cada checklist (requires_photo, is_critical, order)
task_executions  → registro de execução (status: done|skipped|flagged, photo_url, notes)
```

**Tabelas que PRECISAM SER CRIADAS para os próximos módulos:**

```sql
-- S6: Convites de usuário
create table public.invitations (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references public.restaurants(id),
  email          text not null,
  role           text not null check (role in ('manager', 'staff')),
  token          text unique not null default encode(gen_random_bytes(32), 'hex'),
  invited_by     uuid not null references public.users(id),
  accepted_at    timestamptz,
  expires_at     timestamptz default (now() + interval '7 days'),
  created_at     timestamptz default now()
);
alter table public.invitations enable row level security;
create policy "invitations: manager/owner vê e gerencia" on public.invitations for all
  using (exists (
    select 1 from public.restaurant_users ru
    where ru.restaurant_id = restaurant_id and ru.user_id = auth.uid()
      and ru.role in ('owner', 'manager') and ru.active = true
  ));

-- S6: Notificações in-app
create table public.notifications (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references public.restaurants(id),
  user_id        uuid not null references public.users(id),
  type           text not null, -- task_flagged | task_late | checklist_done
  title          text not null,
  body           text,
  read           boolean default false,
  execution_id   uuid references public.task_executions(id),
  created_at     timestamptz default now()
);
alter table public.notifications enable row level security;
create policy "notifications: ver proprias" on public.notifications for select
  using (user_id = auth.uid());
create policy "notifications: marcar lida" on public.notifications for update
  using (user_id = auth.uid());

-- S7: Configurações do restaurante
alter table public.restaurants
  add column if not exists timezone text default 'America/Sao_Paulo',
  add column if not exists plan     text default 'trial' check (plan in ('trial', 'basic', 'pro')),
  add column if not exists plan_expires_at timestamptz;

-- S9: Billing (Stripe)
create table public.subscriptions (
  id                   uuid primary key default uuid_generate_v4(),
  restaurant_id        uuid unique not null references public.restaurants(id),
  stripe_customer_id   text,
  stripe_subscription_id text,
  plan                 text not null check (plan in ('trial', 'basic', 'pro')),
  status               text not null, -- active | past_due | canceled | trialing
  current_period_end   timestamptz,
  created_at           timestamptz default now()
);
alter table public.subscriptions enable row level security;
create policy "subscriptions: owner vê" on public.subscriptions for select
  using (exists (
    select 1 from public.restaurant_users ru
    where ru.restaurant_id = restaurant_id and ru.user_id = auth.uid()
      and ru.role = 'owner' and ru.active = true
  ));
```

---

## 🗂️ Estrutura de Pastas Destino (estado final)

```
app/
  (auth)/
    login/page.tsx              ✅ pronto
    cadastro/page.tsx           ✅ pronto (se já existe; senão S6)
    confirmar-email/page.tsx    ✅ pronto
    convite/[token]/page.tsx    ← S6: aceitar convite via link
  (app)/
    layout.tsx                  ✅ pronto (CUIDADO: afeta tudo)
    selecionar-restaurante/     ✅ pronto
    dashboard/                  ✅ pronto
    checklists/
      page.tsx                  ✅ pronto
      [id]/
        page.tsx                ✅ pronto
        editar/page.tsx         ✅ pronto
    turno/
      page.tsx                  ✅ pronto
      tarefa/[id]/page.tsx      ✅ pronto
      tarefa/[id]/confirmacao/  ✅ pronto
    historico/
      page.tsx                  ✅ pronto
      [executionId]/page.tsx    ← S6: detalhe de execução com foto
    equipe/
      page.tsx                  ← S6: lista de membros + convitar
      [userId]/page.tsx         ← S6: perfil do colaborador
    relatorios/
      page.tsx                  ← S7: exportação CSV/PDF
    configuracoes/
      page.tsx                  ← S7: dados do restaurante
      plano/page.tsx            ← S9: assinatura/billing
  api/
    checklists/route.ts         ✅ pronto
    execucoes/route.ts          ✅ pronto
    dashboard/route.ts          ✅ pronto
    equipe/
      route.ts                  ← S6: GET/POST membros
      [userId]/route.ts         ← S6: PATCH/DELETE membro
    convites/
      route.ts                  ← S6: POST criar convite
      [token]/route.ts          ← S6: GET validar + aceitar convite
    notificacoes/
      route.ts                  ← S6: GET notificações
      [id]/route.ts             ← S6: PATCH marcar lida
    relatorios/
      execucoes/route.ts        ← S7: GET dados para CSV
    restaurante/
      route.ts                  ← S7: PATCH configurações
    webhooks/
      stripe/route.ts           ← S9: receber eventos do Stripe
    billing/
      checkout/route.ts         ← S9: criar sessão de checkout
      portal/route.ts           ← S9: portal do cliente Stripe
  (landing)/
    page.tsx                    ← S8: landing page pública (já temos visual)
    layout.tsx                  ← S8: layout sem sidebar

components/
  ui/                           ← componentes base reutilizáveis
  layout/                       ← AdminNav, ColaboradorNav, Logo ✅
  checklists/                   ← cards, forms específicos
  equipe/                       ← cards de membro, modal de convite
  relatorios/                   ← tabela exportável, gráficos

lib/
  supabase/
    client.ts                   ✅
    server.ts                   ✅
  store/
    restaurant-store.ts         ✅
    notifications-store.ts      ← S6
  hooks/
    use-checklists.ts           ✅
    use-execucoes.ts            ✅
    use-dashboard.ts            ✅
    use-equipe.ts               ← S6
    use-notificacoes.ts         ← S6
    use-relatorios.ts           ← S7
  types/
    index.ts                    ✅ (estender com novos tipos)
  email/
    templates/                  ← S6: templates Resend (convite, boas-vindas)
  pdf/
    generate-report.ts          ← S7: geração de PDF com dados

supabase/
  migrations/
    001_initial_schema.sql      ✅
    002_invitations.sql         ← S6
    003_notifications.sql       ← S6
    004_restaurant_settings.sql ← S7
    005_subscriptions.sql       ← S9
```

---

## 📋 Roadmap de Sprints — O que Falta

### S6 — Gestão de Equipe + Notificações
**Dependências:** S5 concluído ✅  
**Por que essa ordem:** Sem equipe gerenciada, não há usuários para os próximos módulos.

#### 6A — Gestão de Equipe (Manager/Owner)
**O que implementar:**

1. **Migration:** `supabase/migrations/002_invitations.sql` (tabela `invitations`)
2. **API:**
   - `app/api/equipe/route.ts` — GET (listar membros ativos), POST (criar membro direto por e-mail se usuário já existir)
   - `app/api/equipe/[userId]/route.ts` — PATCH (mudar role/active), DELETE (soft delete = active:false)
   - `app/api/convites/route.ts` — POST (criar convite, enviar e-mail via Resend)
   - `app/api/convites/[token]/route.ts` — GET (validar token), POST (aceitar + criar restaurant_user)
3. **Views:**
   - `app/(app)/equipe/page.tsx` — lista de membros com avatar, role (badge colorido), status (online/offline estimado), ações; botão "Convidar Membro" no topo
   - `app/(app)/equipe/[userId]/page.tsx` — perfil do colaborador: histórico de execuções, taxa de conformidade, tarefas críticas flagged
   - `app/(auth)/convite/[token]/page.tsx` — página pública: "Você foi convidado para X". Se não tem conta: formulário de cadastro. Se tem: botão "Aceitar e entrar"
4. **Hook:** `lib/hooks/use-equipe.ts` (React Query: membros, convidar, alterar role)
5. **E-mail (Resend):** Template de convite com link `https://app.ordemnamesa.com.br/convite/[token]`

**Tipos novos em `lib/types/index.ts`:**
```typescript
interface TeamMember {
  id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'staff';
  active: boolean;
  joined_at: string;
  user: { name: string; email: string; avatar_url?: string };
}

interface Invitation {
  id: string;
  email: string;
  role: 'manager' | 'staff';
  token: string;
  expires_at: string;
  accepted_at?: string;
}
```

#### 6B — Notificações In-App
**O que implementar:**

1. **Migration:** `supabase/migrations/003_notifications.sql` (tabela `notifications`)
2. **Trigger DB:** Quando `task_executions.status = 'flagged'` → INSERT em notifications para todos os managers/owners do restaurante
3. **API:**
   - `app/api/notificacoes/route.ts` — GET (notificações não lidas do usuário logado)
   - `app/api/notificacoes/[id]/route.ts` — PATCH `{ read: true }`
4. **Realtime:** Configurar Supabase Realtime no hook para ouvir `notifications` via `supabase.channel().on('postgres_changes'...)`
5. **UI:**
   - Sino (🔔) no header com badge de contador de não lidas
   - Dropdown/Sheet com lista de notificações; clicar leva para a execução flagged
   - `lib/hooks/use-notificacoes.ts` com polling + realtime

---

### S7 — Histórico Avançado + Relatórios Exportáveis  
**Dependências:** S6 concluído

#### 7A — Histórico com Filtros Avançados
1. **Melhorar** `app/(app)/historico/page.tsx`:
   - Filtros por: período (date range picker), colaborador (select membros), checklist, status (done/skipped/flagged)
   - Paginação Server-Side (cursor-based para performance)
   - Clique em uma execução abre `app/(app)/historico/[executionId]/page.tsx` com: detalhes da tarefa, foto evidência (signed URL do Storage), notas, quem executou
2. **API:** Atualizar `app/api/execucoes/route.ts` com query params: `?from=&to=&user_id=&checklist_id=&status=&cursor=`

#### 7B — Relatórios Exportáveis
1. **View:** `app/(app)/relatorios/page.tsx`
   - Filtros (mesmo padrão do histórico)
   - Tabela de resumo: por colaborador, por checklist, por setor
   - Gráfico visual de conformidade por semana
   - Botão "Exportar CSV" + "Exportar PDF"
2. **API:**
   - `app/api/relatorios/execucoes/route.ts` — GET com query params, retorna JSON formatado para relatório
3. **CSV:** `lib/export/to-csv.ts` — função que transforma JSON em CSV string, dispara download no browser
4. **PDF:** `lib/pdf/generate-report.ts` — usar `react-pdf` ou `jsPDF` para gerar PDF com logo, tabela, assinatura do período

---

### S8 — Configurações do Restaurante + Onboarding
**Dependências:** S6 concluído

#### 8A — Configurações
1. **Migration:** `004_restaurant_settings.sql` (adicionar `timezone`, `plan`, `plan_expires_at` em `restaurants`)
2. **View:** `app/(app)/configuracoes/page.tsx`
   - Seções: Dados Gerais (nome, logo upload), Fuso Horário, Plano atual
   - Upload de logo: para Supabase Storage bucket `logos`, atualiza `restaurants.logo_url`
3. **API:** `app/api/restaurante/route.ts` — PATCH (atualizar nome, timezone, logo_url). Apenas owner.

#### 8B — Onboarding para novos owners
1. **Flow:** Logo após cadastrar e criar restaurante, redirecionar para wizard:
   - Passo 1: "Adicione sua primeira lista de checklist" (shortcut para criar checklist)
   - Passo 2: "Convide sua equipe" (shortcut para convite)
   - Passo 3: "Está pronto! Veja o dashboard"
2. **Storage em Zustand:** Flag `onboardingCompleted` persistida no Supabase em `restaurants.settings` (JSON)

#### 8C — Landing Page Pública
1. **Layout:** `app/(landing)/layout.tsx` — sem sidebar, header de marketing
2. **View:** `app/(landing)/page.tsx` (ou `app/page.tsx` com tratamento de usuário logado)
   - Seções: Hero, Como funciona, Planos, CTA, Footer
   - O visual já existe em `designer-stich.html`, só conectar com lógica real
   - Link "Testar grátis" → `/cadastro`
   - Link "Entrar" → `/login`

---

### S9 — Billing com Stripe
**Dependências:** S8 concluído + conta Stripe configurada

#### Modelo de Planos
| Plano | Preço | Limites |
|---|---|---|
| Trial | Grátis 14 dias | 1 restaurante, 3 usuários, 1 checklist |
| Basic | R$ 97/mês | 1 restaurante, 10 usuários, checklists ilimitados |
| Pro | R$ 197/mês | 3 restaurantes, usuários ilimitados, relatórios PDF |

#### O que implementar:
1. **Migration:** `005_subscriptions.sql` (tabela `subscriptions`)
2. **Variáveis de Ambiente (adicionar ao .env):**
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_PRICE_BASIC=price_...
   STRIPE_PRICE_PRO=price_...
   ```
3. **API:**
   - `app/api/billing/checkout/route.ts` — POST: cria Stripe Checkout Session, redireciona para Stripe
   - `app/api/billing/portal/route.ts` — POST: abre Customer Portal para gerenciar assinatura
   - `app/api/webhooks/stripe/route.ts` — POST: processa eventos Stripe:
     - `checkout.session.completed` → atualizar `subscriptions` + `restaurants.plan`
     - `invoice.payment_failed` → marcar `status: past_due`, bloquear acesso
     - `customer.subscription.deleted` → marcar `status: canceled`, downgrade para trial
4. **Middleware:** Verificar plano antes de renderizar rotas premium (ex: relatórios PDF, múltiplos restaurantes)
5. **View:** `app/(app)/configuracoes/plano/page.tsx` — mostrar plano atual, botão "Fazer Upgrade", histórico de faturas

---

### S10 — Testes + Deploy Production
**Dependências:** S9 concluído

1. **Testes E2E (Playwright):**
   - Login → selecionar restaurante → executar checklist → confirmar execução com foto
   - Manager → criar checklist → publicar → verificar no painel STAFF
   - Owner → convidar membro → aceitar convite → logar como novo membro
2. **Testes de API (supertest ou Playwright API):**
   - Verificar que RLS está funcionando (usuário A não vê dados do restaurante de usuário B)
   - Verificar que SERVICE_ROLE_KEY não está exposta no bundle do cliente
3. **Migration PROD:** Aplicar todas as migrations em sequência no Supabase PROD
4. **GitHub Actions:** Verificar que CI está rodando `tsc --noEmit` + `next build`
5. **Variáveis de Ambiente Vercel:** Garantir PROD env vars corretas
6. **Checklist de segurança:**
   - Scanner de dependências (`npm audit`)
   - Sem chaves secretas no código (grep)
   - Headers de segurança no `next.config.js`

---

## 🔗 Mapa de Dependências entre Módulos

```
S1 Setup
  └─ S2 Auth + Multi-tenant
       ├─ S3 CRUD Checklists
       │    └─ S4 Execução STAFF
       │         └─ S5 Dashboard Manager ✅
       │              ├─ S6A Gestão de Equipe  ◄── PRÓXIMO
       │              ├─ S6B Notificações
       │              ├─ S7A Histórico Avançado
       │              └─ S7B Relatórios
       └─ S8A Configurações Restaurante
            ├─ S8B Onboarding
            ├─ S8C Landing Page
            └─ S9 Billing Stripe
                  └─ S10 Testes + PROD
```

---

## 💡 Decisões de Implementação para a IA

### Ao implementar qualquer sprint

1. **Ler primeiro:**  `CONTEXT.md` + `PROGRESS.md` + a seção relevante deste arquivo

2. **Antes de escrever código, declarar:**
   ```
   ARQUIVOS QUE VOU MODIFICAR: [lista]
   PODE AFETAR: [funcionalidades dependentes]
   PLANO PARA NÃO QUEBRAR: [estratégia]
   ```

3. **Padrão de API Route (sempre usar):**
   ```typescript
   // app/api/equipe/route.ts
   export async function GET(request: Request) {
     const supabase = createRouteHandlerClient({ cookies }) // usa ANON KEY
     // — OU —
     const supabase = createClient(process.env.SUPABASE_SERVICE_ROLE_KEY) // SERVICE ROLE
     
     const { data: { user } } = await supabase.auth.getUser()
     if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

     // Ler restaurant_id SEMPRE do Zustand/cookie, nunca da URL diretamente sem verificar RLS
     const restaurantId = request.headers.get('x-restaurant-id') // ou cookie
     // ... lógica ...
     return NextResponse.json({ data })
   }
   ```

4. **Padrão de React Query Hook (sempre usar):**
   ```typescript
   // lib/hooks/use-equipe.ts
   export function useEquipe(restaurantId: string) {
     return useQuery({
       queryKey: ['equipe', restaurantId],
       queryFn: () => fetch(`/api/equipe`, { headers: { 'x-restaurant-id': restaurantId } })
                        .then(r => r.json()),
       enabled: !!restaurantId,
     })
   }

   export function useConvidarMembro() {
     const queryClient = useQueryClient()
     return useMutation({
       mutationFn: (data: { email: string; role: string }) => 
         fetch('/api/convites', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
       onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipe'] }),
     })
   }
   ```

5. **Design obrigatório (tokens do Design System):**
   ```
   Fundo:    bg-[#101d22]    Surface: bg-[#16262c]
   Borda:    border-[#233f48] Texto2°: text-[#92bbc9]
   Primary:  text-[#13b6ec]  Success: text-green-500
   Warning:  text-amber-500  Error:   text-red-500
   Fontes:   font-serif (Fraunces títulos) | font-sans (DM Sans corpo)
   ```

6. **Componente padrão (estrutura mobile-first):**
   ```tsx
   // Sempre começar com layout em coluna (mobile)
   // Adicionar md:flex-row, lg:grid para desktop
   <div className="flex flex-col gap-4 md:flex-row">
     <div className="w-full md:w-1/3">...</div>
     <div className="w-full md:w-2/3">...</div>
   </div>
   ```

---

## ✅ Checklist de Entrega por Sprint (template)

Antes de declarar qualquer sprint concluído:

- [ ] `tsc --noEmit` passa sem erros
- [ ] `next build` conclui sem warnings críticos
- [ ] Testado no browser em **390px** (DevTools) e desktop
- [ ] Loading state, error state e empty state em todas as telas novas
- [ ] Dados salvos e lidos corretamente do Supabase NONPROD
- [ ] Sem `SERVICE_ROLE_KEY` exposta (grep no bundle)
- [ ] RLS verificada: usuário B não acessa dados do restaurante de usuário A
- [ ] `PROGRESS.md` atualizado com o que foi feito
- [ ] Migration SQL aplicada no NONPROD (se houver)
