# Ordem na Mesa — MASTER v3.1
> Stack definitiva · Next.js + Supabase · Web App Mobile-First · 2026
> ⚠️ ARRASTAR ESTE ARQUIVO + PROGRESS.md NO INÍCIO DE CADA SESSÃO COM IA

---

## 1. O Produto

Sistema de organização operacional interna para restaurantes.
Resolve: caos de papel, falta de evidência de execução, desgaste de liderança.

**É:**
- Checklists digitais por turno
- Registro obrigatório de evidências (foto)
- Histórico auditável de execuções
- Painel do gestor em tempo real
- Multi-restaurante, multi-usuário

**Não é:**
- PDV ou sistema de pedidos
- Gestão de delivery / ERP / RH

---

## 2. Modelo de Produto — Web App (como Notion)

O Ordem na Mesa funciona como o Notion: **um único produto web** acessível pelo
browser no celular e no computador. Não há app nativo nesta fase.

| Acesso | Tecnologia | Para quem |
|---|---|---|
| Web App (mobile browser) | Next.js 14 — tela 390px | STAFF executa checklists no celular |
| Web App (desktop browser) | Next.js 14 — tela larga | MANAGER/OWNER gerencia e analisa |
| Backend | Supabase | Serve tudo |

**Por que essa decisão:**
- Entrega valor imediato sem precisar de App Store / Play Store
- STAFF acessa pelo celular via browser — mesma experiência que um app nativo
- MANAGER usa no computador para relatórios e configurações
- Quando validado, o app nativo (React Native) usa o mesmo backend sem reescrever nada
- Referência: Notion, Linear, Figma — todos web-first, app nativo veio depois

**App nativo (React Native + Expo) → Fase 2, após validação com clientes reais.**

---

## 3. Stack — NÃO DESVIAR

| Camada | Tecnologia |
|---|---|
| Web App | Next.js 14 App Router + TypeScript |
| Estilo | Tailwind CSS v3 |
| Estado | React Query + Zustand |
| Backend | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Email | Resend |
| Pagamentos | Stripe (Test Mode na Fase 1) |
| CI/CD | GitHub Actions |
| Deploy | Vercel |

**Fase 2 (após validação):** React Native + Expo usando o mesmo Supabase.

---

## 4. Repositório e Ambientes

```
GitHub: https://github.com/hiagogouveia/ordemnamesa

main    → Vercel PROD    → Supabase PROD
develop → Vercel NONPROD → Supabase NONPROD
```

**Estrutura do projeto:**
```
ordemnamesa/
  app/                   ← Next.js 14 App Router
    (auth)/              ← login, cadastro
    (app)/               ← área autenticada (todo o produto)
      dashboard/
      checklists/
      execucao/
      historico/
      equipe/
      configuracoes/
    api/                 ← API routes (SERVICE_ROLE_KEY aqui)
  components/
  lib/
    supabase/
      client.ts          ← browser
      server.ts          ← server components / actions
  supabase/
    migrations/          ← arquivos .sql versionados
  docs/                  ← MASTER.md, PROGRESS.md, SCHEMA.sql
  .github/
    workflows/
```

---

## 5. Variáveis de Ambiente

### NONPROD — apps/web (branch develop)
```env
NEXT_PUBLIC_SUPABASE_URL=https://mkwxulikizrfdupqpyrn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rd3h1bGlraXpyZmR1cHFweXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MjQyOTUsImV4cCI6MjA4NjQwMDI5NX0.i8p_tHyL2Q_u4jaoYsJaNhTXxsk9e7oKV7Lgv-4juIo
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rd3h1bGlraXpyZmR1cHFweXJuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDgyNDI5NSwiZXhwIjoyMDg2NDAwMjk1fQ.YuVkyheVZEQLdxcBwo_rIRw3ITjDDXUoeyzwgFkvP-8
RESEND_API_KEY=re_MooAfBbE_7tEXxBvHvkeFmNYWs7N5XGdk
```

### PROD — apps/web (branch main)
```env
NEXT_PUBLIC_SUPABASE_URL=https://buucddacymkybkrszcqy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1dWNkZGFjeW1reWJrcnN6Y3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MjQxNjgsImV4cCI6MjA4NjQwMDE2OH0.p0wnsOmdcS7bllQrKLFqL_9YK7iVo5U42ggkz_vbnY8
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1dWNkZGFjeW1reWJrcnN6Y3F5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDgyNDE2OCwiZXhwIjoyMDg2NDAwMTY4fQ.v0yhG40s27I7fRm07cIuC_v8X_HtgJqs_iicy4HPiCA
RESEND_API_KEY=re_MooAfBbE_7tEXxBvHvkeFmNYWs7N5XGdk
```

> ⚠️ REGRA: SUPABASE_SERVICE_ROLE_KEY nunca no browser.
> Apenas em API routes do Next.js (app/api/).

> App nativo (React Native) — Fase 2. Env vars do Expo serão adicionadas aqui quando chegar o momento.

---

## 6. Design System

```
Fundo principal  : #101d22
Superfície cards : #16262c
Bordas           : #233f48
Texto secundário : #92bbc9
Primária (ciano) : #13b6ec
Primária hover   : #0d9fd4
Sucesso          : #22c55e
Aviso            : #f59e0b
Erro             : #ef4444

Fonte títulos    : Fraunces (serif)
Fonte corpo/UI   : DM Sans
Fonte mono/dados : DM Mono
```

**Mobile-first obrigatório:** toda UI pensada para 390px antes de qualquer breakpoint.
Referência visual completa: `docs/brand-identity.html`

---

## 7. Modelo de Dados (PostgreSQL + RLS)

### users
| Coluna | Tipo |
|---|---|
| id | uuid PK (= auth.users.id) |
| email | text unique |
| name | text |
| avatar_url | text |
| created_at | timestamptz |

### restaurants
| Coluna | Tipo |
|---|---|
| id | uuid PK |
| name | text |
| slug | text unique |
| owner_id | uuid FK → users |
| logo_url | text |
| active | boolean |
| created_at | timestamptz |

### restaurant_users (pivot RBAC)
| Coluna | Tipo |
|---|---|
| id | uuid PK |
| restaurant_id | uuid FK |
| user_id | uuid FK |
| role | text: owner / manager / staff |
| active | boolean |
| joined_at | timestamptz |
| left_at | timestamptz (null = ativo) |

### checklists
| Coluna | Tipo |
|---|---|
| id | uuid PK |
| restaurant_id | uuid FK |
| name | text |
| shift | text: morning / afternoon / evening / any |
| active | boolean |
| created_by | uuid FK → users |
| created_at | timestamptz |

### checklist_tasks
| Coluna | Tipo |
|---|---|
| id | uuid PK |
| checklist_id | uuid FK |
| restaurant_id | uuid FK (denormalizado para RLS) |
| title | text |
| description | text |
| requires_photo | boolean |
| is_critical | boolean |
| order | integer |

### task_executions
| Coluna | Tipo |
|---|---|
| id | uuid PK |
| restaurant_id | uuid FK (denormalizado) |
| task_id | uuid FK |
| checklist_id | uuid FK (denormalizado) |
| user_id | uuid FK |
| executed_at | timestamptz |
| photo_url | text (Storage: /photos/{restaurant_id}/{execution_id}/{filename}) |
| status | text: done / skipped / flagged |
| notes | text |

---

## 8. RBAC — Permissões por Papel

Todo acesso é via web app. A experiência muda pelo tamanho da tela, não por produto diferente.

| Papel | Tela mobile (celular) | Tela desktop (computador) |
|---|---|---|
| STAFF | Executa checklists do turno, envia foto, vê histórico pessoal | — (não usa no computador) |
| MANAGER | Acompanha alertas e progresso do dia | Dashboard, relatórios, gestão de checklists e equipe |
| OWNER | Tudo do MANAGER | Tudo do MANAGER + configurações do restaurante e usuários |

---

## 9. Regras Inegociáveis

1. Usuário GLOBAL. Restaurante é CONTEXTO.
2. Todo dado tem `restaurant_id` obrigatório.
3. RLS em TODAS as tabelas — nunca desativar.
4. Seleção de restaurante: sempre manual, nunca automática.
5. Remover funcionário = `active: false`. Nunca deletar usuário.
6. `SERVICE_ROLE_KEY` apenas em `app/api/` do Next.js. Nunca no cliente.
7. `ANON_KEY` pode estar no cliente — é pública por design do Supabase.
8. Mobile-first: UI funciona com uma mão, em ambiente barulhento.

---

## 10. Plano de Sprints — Fase 1 (Web App)

| Sprint | Foco | Critério de conclusão |
|---|---|---|
| **S1** | Setup & Schema | Projeto Next.js criado. Schema com RLS no Supabase NONPROD. Deploy na Vercel. |
| **S2** | Auth + Multi-tenant | Login/cadastro. Seleção de restaurante. RBAC funcionando. |
| **S3** | Checklists (gestão) | CRUD completo de checklists — criar, editar, publicar, arquivar tarefas. |
| **S4** | Execução (STAFF mobile) | STAFF abre checklist no celular, executa tarefas, envia foto. Mobile-first. |
| **S5** | Dashboard (MANAGER) | Métricas em tempo real, alertas de não conformidade, histórico com filtros. |
| **S6** | Exportação e relatórios | Exportar CSV/PDF, histórico auditável completo. |
| **S7** | Landing page | Página pública de apresentação do produto. |
| **S8** | Entrega Morumbi | Testes reais com equipe. Onboarding. Ajustes de UX. |

**Fase 2 (após validação):** App nativo React Native + Expo usando o mesmo Supabase.

> ⚠️ Não avançar sem validar o critério do sprint anterior.