# Etapa 5 — Resultado

**Escopo:** remoção definitiva do schema legado de Recebimentos.

---

## Commits

| # | Hash | Descrição |
|---|---|---|
| 1 | `50ae9c9` | Code cleanup TS pré-DROP (19 arquivos) |
| 2 | (este) | Migration s60 — DROP schema |

## Migration aplicada

**`20260529_s60_drop_receiving_legacy.sql`** — aplicada em nonprod (`mkwxulikizrfdupqpyrn`) via MCP.

Ações (em uma transação):
1. `DELETE FROM notifications WHERE type IN ('RECEIVING_OVERDUE','RECEIVING_PENDING_CONFIRMATION')` — 3 linhas removidas.
2. `DROP CONSTRAINT notifications_type_check` + recria sem os tipos legacy.
3. `DROP TABLE receiving_expectations CASCADE` — remove tabela + 4 FKs out + 4 indexes + 3 policies RLS.
4. `DROP CONSTRAINT checklists_receiving_mode_chk, checklists_receiving_generation_chk` + `DROP COLUMN receiving_mode, receiving_generation, supplier_name` em checklists.
5. `DROP COLUMN allow_manual_receiving` em areas.

## Queries de validação

### A) Drop completo
```sql
SELECT
  (SELECT to_regclass('public.receiving_expectations') IS NULL) AS table_dropped,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='checklists'
      AND column_name IN ('receiving_mode','receiving_generation','supplier_name')) AS legacy_cols_remaining,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='areas'
      AND column_name = 'allow_manual_receiving') AS area_flag_remaining,
  (SELECT count(*) FROM notifications WHERE type LIKE 'RECEIVING_%') AS legacy_notifs_remaining,
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conname='notifications_type_check') AS new_check_def;
```

**Resultado:** { table_dropped=true, legacy_cols_remaining=0, area_flag_remaining=0, legacy_notifs_remaining=0, new_check_def="CHECK ((type = ANY (ARRAY[..., sem RECEIVING_*])))" }

### B) Etapa 2 features intactas
```sql
SELECT
  (SELECT count(*) FROM receiving_templates) AS templates,
  (SELECT count(*) FROM receiving_template_tasks) AS template_tasks,
  (SELECT count(*) FROM suppliers) AS suppliers,
  (SELECT array_agg(proname) FROM pg_proc WHERE proname IN ('instantiate_receiving_execution','replace_receiving_template_tasks')) AS rpcs_alive,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('receiving_templates','receiving_template_tasks','suppliers')) AS new_policies;
```

**Resultado:** { templates=4, template_tasks=9, suppliers=0, rpcs_alive=[instantiate_receiving_execution, replace_receiving_template_tasks], new_policies=7 }

### C) Build TS
`npx tsc --noEmit` → 13 erros, **todos pré-existentes em arquivos não tocados**. Zero erros novos.

## Riscos residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| Form `checklist-form.tsx` ainda mostra UI de receiving_mode/supplier_name (state local sem persistência) | Baixa (UX) | Backlog: limpar UI (escopo de produto, não de schema). User submete → campos ignorados pela API. |
| Notificações antigas com `metadata.expectation_id` no realm de usuários | Nula | As 3 já foram deletadas. Em produção: equivalente. |
| Restaurante que ainda referenciava `/admin/recebimentos` (link salvo) | Baixa | 404. Etapa 4 já removeu link do sidebar. |

## Ordem de deploy para produção

1. Merge da PR Etapa 5 em `develop` → CI aplica TS em nonprod (s60 já aplicada no nonprod via MCP).
2. PR `develop → main` → após aprovação humana.
3. Antes do deploy do app em prod, **fazer snapshot** das mesmas 4 tabelas via `pg_dump` específico:
   - `receiving_expectations` (N linhas — depende do tenant)
   - `notifications` filtrando `RECEIVING_*`
   - `checklists` com colunas legacy preenchidas
   - `areas` com `allow_manual_receiving=true`
4. Aplicar s60 em produção via MCP **antes** do deploy do código novo (cuidado: o code antigo na produção SELECTs as colunas — após DROP, retornam erro 500. Logo, ordem certa é: deploy do código novo → aplicar s60 imediatamente em seguida, com janela mínima).
5. Smoke: `/turno`, `/configuracoes`, criar/editar checklist, criar/editar área, instantiate receiving via /api/receiving/instantiate.

## Rollback

| Falha | Reversão |
|---|---|
| Código TS quebrado pós-merge | `git revert` + redeploy do app |
| Migration falha em prod | Re-criar via `CREATE TABLE`/`ADD COLUMN` recuperando definição das migrations s48-s52. **Dados perdidos** salvo se houver snapshot pré-migration |
| Notification types precisam voltar | Re-add no CHECK; dados das 3 originais não voltam sem snapshot |

**Snapshot pré-migration mandatório em produção.**
