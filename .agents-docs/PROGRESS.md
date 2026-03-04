# PROGRESS.md — Ordem na Mesa
> ⚠️ ARRASTAR ESTE ARQUIVO + MASTER.md NO INÍCIO DE CADA SESSÃO COM IA
> Atualizar ao fim de cada sessão de desenvolvimento.

---

## Status Atual

| | |
|---|---|
| **Sprint atual** | S4 — Gestão de Execuções e Staff Mobile |
| **Atualizado em** | Hoje |
| **Ambiente ativo** | develop → Supabase NONPROD |

---

## Concluído

- [x] Criar estrutura do projeto Next.js (root)
- [x] Aplicar SCHEMA.sql no Supabase NONPROD
- [x] Configurar projeto com Supabase client
- [x] Criar workflow de CI/CD para Vercel deploy
- [x] Tela de login no app mobile
- [x] Tela de login no painel web
- [x] Seleção de restaurante após login
- [x] Zustand store (restaurant-store)
- [x] Proteção de rotas no middleware
- [x] API de Logout
- [x] Validação de RBAC do usuário no restaurante selecionado

---

## Em Andamento / Concluídos Recentes

- [x] Layout do Painel com Sidebar e Header
- [x] CRUD de checklists (API e Views)
- [x] Gestão de tarefas (Drag and Drop)
- [x] Publicar checklists

---

### Sprint 4: Execução de Checklists (STAFF no navegador mobile)
**Status:** 🟩 CONCLUÍDO (100%)
**Objetivo:** STAFF acessa o sistema pelo celular, vê os checklists do turno, executa cada tarefa, tira foto como evidência nas tarefas críticas, e conclui.
**Entregáveis:**
- ✅ View `app/(app)/turno/page.tsx` com Cards e Barra de Progresso Circular/Linear animada
- ✅ View `app/(app)/turno/tarefa/[id]/page.tsx` com input the foto blob/HTML5 p/ Bukcet 'photos' e Enums críticos.
- ✅ View `app/(app)/turno/tarefa/[id]/confirmacao/page.tsx` estornando ou firmando no cache React Query.
- ✅ View `app/(app)/historico/page.tsx` exibindo últimas execuções formatadas.
- ✅ Server Actions (GET, POST, DELETE Execucoes) integradas ao Storage (Supabase).
- ✅ Bloqueio das Rotas Mobile se Role != staff | Bloqueio das Rotas WebAdmin se Role == staff.

---

## A Fazer (Próximos)

- [ ] Gestão da Equipe (Convidar e gerenciar cargos)

---

## Decisões Tomadas
- App Server Migration: Vercel deploy integrado via Github
- Imagens do app/Staff: Supabase Storage Bucket com validação `png|jpg`.
- Front-end Cache: Utilizado `useMutation` no novo model de React Query com Invalidate cache em substituição ao router refresh bruto primitivo do NextJS.

---

## Links

| | URL |
|---|---|
| GitHub | https://github.com/hiagogouveia/ordemnamesa |
| Supabase PROD | https://supabase.com/dashboard/project/buucddacymkybkrszcqy |
| Supabase NONPROD | https://supabase.com/dashboard/project/mkwxulikizrfdupqpyrn |
| Vercel PROD | *(preencher após 1º deploy)* |
| Vercel NONPROD | *(preencher após 1º deploy)* |
