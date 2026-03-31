# Ordem na Mesa — Claude Code Guide

## Projeto

SaaS de gestão operacional para restaurantes. Permite que donos/gerentes criem checklists, escalas de turno, listas de compras e acompanhem a execução pela equipe em tempo real. Multi-tenant (cada restaurante é um tenant isolado por `restaurant_id`).

## Stack

| Camada       | Tecnologia                                                   |
| ------------ | ------------------------------------------------------------ |
| Framework    | **Next.js 15** (App Router, `output: "standalone"`)          |
| UI           | **React 19**, **Tailwind CSS 4**, componentes próprios em `components/ui/` |
| State        | **Zustand** (restaurant store), **TanStack React Query** (server state) |
| Drag & Drop  | **dnd-kit** (core + sortable)                                |
| Backend/DB   | **Supabase** (Auth, Postgres, Storage, RLS)                  |
| Deploy       | Docker standalone → OCI (infra Terraform)                    |
| Linguagem    | **TypeScript** (strict não habilitado, mas preferimos tipar) |

## Estrutura do Projeto

```
app/
  (app)/              # Rotas autenticadas (layout com sidebar)
    admin/            # Telas de gerente/owner
    colaborador/      # Telas do staff
    checklists/       # Board de gestão de checklists
    turno/            # Execução de turno
    compras/          # Listas de compras
    my-activities/    # Minhas atividades do dia
    equipe/           # Gestão de equipe
    dashboard/        # Dashboard principal
    configuracoes/    # Configurações do restaurante
  (auth)/             # Login, signup, recuperação
  api/                # Route handlers (REST-like)
  blog/               # Landing page blog (público)

components/
  ui/                 # Componentes reutilizáveis (button, modal, filter-dropdown, etc.)
  layout/             # AppLayout, Sidebar, Header, AdminNav, ColaboradorNav
  checklists/         # Componentes específicos de checklists
  landing/            # Landing page components
  turno/              # Componentes de execução de turno

lib/
  hooks/              # Custom hooks (use-checklists, use-areas, use-equipe, etc.)
  store/              # Zustand stores (restaurant-store)
  supabase/           # Clientes Supabase (client.ts, server.ts, storage.ts)
  types/              # TypeScript interfaces (index.ts)
  utils/              # Utilitários diversos
  sort/               # Lógica de ordenação

supabase/
  migrations/         # Migrations SQL numeradas por sprint (20260XXX_sNN_*.sql)
```

## Convenções

### Código
- **Idioma**: UI e variáveis de negócio em **português** (nomes de campos, labels). Código técnico (funções, hooks, tipos) em **inglês**.
- **Componentes**: Functional components com arrow functions. Sem class components.
- **Hooks**: Prefixo `use-` no arquivo, `use` no export. Um hook por arquivo em `lib/hooks/`.
- **Tipos**: Centralizados em `lib/types/index.ts`. Interfaces com PascalCase.
- **API routes**: `app/api/<recurso>/route.ts` com handlers GET/POST/PUT/DELETE/PATCH.
- **Imports**: Usar `@/` alias para paths absolutos.
- **Sem testes automatizados** no momento. Validar com `npm run build` (TypeScript + Next.js).

### Banco de Dados (Supabase)
- Toda query filtra por `restaurant_id` — RLS garante isolamento multi-tenant.
- Migrations nomeadas: `YYYYMMDD_sNN_descricao.sql` (sNN = sprint number).
- Usar `supabase.from('tabela')` com client do `lib/supabase/client.ts` (browser) ou `lib/supabase/server.ts` (server components / route handlers).
- Supabase MCP está disponível para aplicar migrations e executar SQL.

### Git
- Branch principal: `main`. Desenvolvimento em `develop`.
- Commits em português, prefixados: `feat()`, `fix()`, `refactor()`, `chore()`.
- Um commit por feature/fix lógico.

## Domínio / Regras de Negócio

### Entidades principais
- **Restaurant**: Tenant. Todo dado pertence a um restaurante.
- **Checklist**: Rotina operacional com tarefas. Tem turno (morning/afternoon/evening), status, recorrência, área, e pode ter ordem sequencial obrigatória.
- **ChecklistTask**: Tarefa dentro de um checklist. Pode exigir foto e ser crítica.
- **ChecklistAssumption**: Registro de execução de um checklist por um colaborador num dia.
- **Area**: Agrupamento lógico de checklists (ex: Cozinha, Salão). Tem `priority_mode` (auto/manual).
- **Shift**: Turno real com horários e dias da semana.
- **Role**: Cargo (ex: Cozinheiro, Garçom). Tem cor e limite de tarefas simultâneas.
- **PurchaseList / PurchaseItem**: Listas de compras com itens verificáveis.
- **MyActivity**: View agregada de atividades do dia para o colaborador logado.

### Papéis de usuário
- **owner**: Dono do restaurante. Acesso total.
- **manager**: Gerente. Cria checklists, gerencia equipe.
- **staff**: Colaborador. Executa tarefas do turno.

### Fluxo principal
1. Owner/Manager cria checklists com tarefas → associa a turno, área e cargo
2. Colaborador abre "Meu Turno" → vê checklists do dia/turno
3. Colaborador assume checklist → executa tarefas em ordem → marca conclusão
4. Manager acompanha progresso no dashboard e relatórios

## Autenticação & Middleware

- `middleware.ts` na raiz protege rotas baseado em auth status e role do usuário (owner/manager → admin, staff → colaborador).
- API routes usam Bearer token via headers + `supabase.auth.getUser()`.
- Operações admin usam `SUPABASE_SERVICE_ROLE_KEY` (server-side only).

## Deploy

| Ambiente    | Infra                          | Workflow                          |
| ----------- | ------------------------------ | --------------------------------- |
| Production  | **Vercel** (auto from `main`)  | `.github/workflows/deploy-web.yml` |
| Non-prod    | **OCI VM** (Docker + Traefik)  | `.github/workflows/app-nonprod.yml` |

Docker: multi-stage build, node:20-alpine, standalone output, health checks.

## Comandos

```bash
npm run dev          # Dev server (localhost:3000)
npm run build        # Build de produção (valida TS + ESLint)
npm run lint         # ESLint
npx tsc --noEmit     # Type-check sem build
```

## Ao implementar features

1. **Leia antes de alterar** — entenda o código existente, hooks relacionados e o schema do banco.
2. **Siga os padrões** — olhe como features similares foram implementadas (ex: se vai criar um hook, veja `use-checklists.ts` como referência).
3. **Migrations** — novas tabelas/colunas precisam de migration SQL. Use o padrão `YYYYMMDD_sNN_descricao.sql`.
4. **Valide com build** — rode `npm run build` antes de considerar a feature pronta.
5. **Não quebre multi-tenant** — toda query deve filtrar por `restaurant_id`.
