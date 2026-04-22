-- Indexes de suporte para COUNTs do enforcement de billing (lib/billing/queries.ts).
-- Objetivo: evitar seq scan em tabelas que crescem com o tenant (restaurants,
-- restaurant_users, account_users) quando validamos limites do plano em cada write.
--
-- countUnits(accountId)     → restaurants filtrados por account_id + active + deleted_at IS NULL
-- countStaff(restaurantId)  → restaurant_users filtrados por restaurant_id + role='staff' + active
-- countManagers(accountId)  → account_users + restaurant_users (via DISTINCT) filtrados por role='manager' + active
--
-- Os índices abaixo são parciais e cobrem apenas linhas vivas — mantém tamanho baixo
-- e serve 100% dos casos de validação (que só consideram registros ativos/não deletados).

CREATE INDEX IF NOT EXISTS restaurants_account_active_alive_idx
  ON public.restaurants (account_id)
  WHERE active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS restaurant_users_restaurant_role_active_idx
  ON public.restaurant_users (restaurant_id, role)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS account_users_account_role_active_idx
  ON public.account_users (account_id, role)
  WHERE active = true;
