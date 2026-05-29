# Etapa 5 — Snapshot pré-migration (NONPROD)

**Projeto Supabase:** `mkwxulikizrfdupqpyrn` (nonprod-ordemnamesa).
**Data:** 2026-05-29.
**Propósito:** registro auditável dos dados legados que serão removidos pela migration s60.

---

## Contagens

| Item | Quantidade |
|---|---|
| `receiving_expectations` | 17 |
| `notifications` (RECEIVING_PENDING_CONFIRMATION) | 3 |
| `notifications` (RECEIVING_OVERDUE) | 0 |
| `checklists` com `receiving_mode` preenchido | 8 |
| `areas` com `allow_manual_receiving=true` | 3 |

## receiving_expectations (17 linhas)

Restaurante único: `cfd6f6ab-a3cc-4697-9ee5-31e7d70bf23a` (Gouveia Pizzaria).
Janela: 2026-05-24 a 2026-05-28.
Status: 17 confirmed, 0 outros. 5 linkadas a assumption (execução real), 12 órfãs.

IDs:
- b0eddb4e (2026-05-24, 20:00-22:00, sem assumption)
- 489f15c0 (2026-05-24, 20:00-22:00, sem assumption)
- 3d465ecf (2026-05-25, 20:00-22:00, sem assumption)
- bc297046 (2026-05-25, 20:00-22:00, sem assumption)
- df810467 (2026-05-25, sem janela, assumption=10006b48...)
- 82f1fe5f (2026-05-26, sem janela, sem assumption)
- 45655ddf (2026-05-26, 20:00-22:00, sem assumption)
- 6d83021d (2026-05-26, sem janela, assumption=dde252b4...)
- a1caf261 (2026-05-26, 20:00-22:00, assumption=87c391a4...)
- d2813bbf (2026-05-27, 20:00-22:00, sem assumption)
- 0ff7173b (2026-05-27, 20:00-22:00, sem assumption)
- 779c7652 (2026-05-27, sem janela, sem assumption)
- c42d926c (2026-05-27, sem janela, assumption=5d1212e2...)
- f6f3af8c (2026-05-28, sem janela, sem assumption)
- 22330808 (2026-05-28, 20:00-22:00, sem assumption)
- 375cb354 (2026-05-28, sem janela, sem assumption)
- 96e47e77 (2026-05-28, 20:00-22:00, assumption=da95601b...)

## notifications RECEIVING_PENDING_CONFIRMATION (3 linhas)

Todas criadas em 2026-05-24T15:01:43, restaurante cfd6f6ab, mesma expectation_id (4a8016bf).

| id | user_id | read |
|---|---|---|
| caa83808 | 8ada2b8c | false |
| 1377e970 | 070c5462 | true |
| eae68233 | fb0eb33f | true |

## checklists com colunas legacy (8 linhas) — todas active=false

| id | name | restaurant_id | receiving_mode | supplier_name |
|---|---|---|---|---|
| 6accf891 | Recebimento recorrente | cfd6f6ab | recurring | sob demanda |
| 9534d8d7 | Recebimento rápido — CEASA (19:05) | 13870d9c | on_demand | CEASA |
| 7ca5b462 | recebimento 2 CAIXA | cfd6f6ab | recurring | caixa 2 |
| 49df071f | Recebimento rápido — CEASA (07:14) | 13870d9c | on_demand | CEASA |
| 32f24d9d | recebimento 3 CAIXA (cópia) | cfd6f6ab | recurring | caixa 2 |
| e49ff477 | recebimento ADM | cfd6f6ab | recurring | ceasa |
| 0c69297e | Recebimento rápido — CEASA (14:27) | cfd6f6ab | on_demand | CEASA |
| 62614e37 | Recebimento rápido — CAIXA recebimento rápido (15:00) | cfd6f6ab | on_demand | CAIXA recebimento rápido |

## areas com allow_manual_receiving=true (3 linhas)

| id | name | restaurant_id |
|---|---|---|
| 37377da0 | Estoque | cfd6f6ab |
| 851c86c4 | caixa | cfd6f6ab |
| 35a9de35 | Caixa | 13870d9c |

---

## O que se perde com s60

- 17 expectations: os campos `expected_window_start/end` e `expected_date` dessas linhas. **5 execuções reais (vinculadas via assumption_id) ficam preservadas como assumptions independentes.**
- 3 notificações.
- 8 checklists perdem 3 campos cada (receiving_mode, receiving_generation, supplier_name). Os próprios checklists e suas execuções históricas em `checklist_assumptions`+`task_executions` permanecem.
- 3 áreas perdem flag dormente.

**Histórico real de execução (assumptions + task_executions + foto bucket s55) intacto em todos os casos.**
