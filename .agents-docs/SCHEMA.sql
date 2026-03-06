-- ============================================================
-- Ordem na Mesa — Schema SQL Completo com RLS
-- Aplicar no Supabase NONPROD primeiro, depois PROD
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── USERS ─────────────────────────────────────────────────
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  name        text,
  avatar_url  text,
  created_at  timestamptz default now()
);

-- Trigger: espelha auth.users → public.users automaticamente
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.users enable row level security;
create policy "users: ver proprio perfil" on public.users for select using (auth.uid() = id);
create policy "users: editar proprio perfil" on public.users for update using (auth.uid() = id);

-- ── RESTAURANTS ───────────────────────────────────────────
create table public.restaurants (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text unique not null,
  owner_id    uuid not null references public.users(id),
  logo_url    text,
  active      boolean default true,
  created_at  timestamptz default now()
);

alter table public.restaurants enable row level security;
create policy "restaurants: membro ve seu restaurante" on public.restaurants for select
  using (exists (
    select 1 from public.restaurant_users ru
    where ru.restaurant_id = id and ru.user_id = auth.uid() and ru.active = true
  ));
create policy "restaurants: owner edita" on public.restaurants for update using (owner_id = auth.uid());
create policy "restaurants: auth cria" on public.restaurants for insert with check (owner_id = auth.uid());

-- ── RESTAURANT_USERS (pivot RBAC) ─────────────────────────
create table public.restaurant_users (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references public.restaurants(id),
  user_id        uuid not null references public.users(id),
  role           text not null check (role in ('owner', 'manager', 'staff')),
  active         boolean default true,
  joined_at      timestamptz default now(),
  left_at        timestamptz,
  unique(restaurant_id, user_id)
);

alter table public.restaurant_users enable row level security;
create policy "restaurant_users: membro ve vinculo" on public.restaurant_users for select
  using (exists (
    select 1 from public.restaurant_users ru
    where ru.restaurant_id = restaurant_id and ru.user_id = auth.uid() and ru.active = true
  ));
create policy "restaurant_users: owner/manager gerencia" on public.restaurant_users for all
  using (exists (
    select 1 from public.restaurant_users ru
    where ru.restaurant_id = restaurant_id and ru.user_id = auth.uid()
      and ru.role in ('owner', 'manager') and ru.active = true
  ));

-- ── CHECKLISTS ────────────────────────────────────────────
create table public.checklists (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references public.restaurants(id),
  name           text not null,
  shift          text not null check (shift in ('morning', 'afternoon', 'evening', 'any')),
  active         boolean default false,
  created_by     uuid not null references public.users(id),
  created_at     timestamptz default now()
);

alter table public.checklists enable row level security;
create policy "checklists: membro ve" on public.checklists for select
  using (exists (
    select 1 from public.restaurant_users ru
    where ru.restaurant_id = restaurant_id and ru.user_id = auth.uid() and ru.active = true
  ));
create policy "checklists: owner/manager gerencia" on public.checklists for all
  using (exists (
    select 1 from public.restaurant_users ru
    where ru.restaurant_id = restaurant_id and ru.user_id = auth.uid()
      and ru.role in ('owner', 'manager') and ru.active = true
  ));

-- ── CHECKLIST_TASKS ───────────────────────────────────────
create table public.checklist_tasks (
  id                   uuid primary key default uuid_generate_v4(),
  checklist_id         uuid not null references public.checklists(id) on delete cascade,
  restaurant_id        uuid not null references public.restaurants(id),
  title                text not null,
  description          text,
  requires_photo       boolean default false,
  is_critical          boolean default false,
  "order"              integer default 0,
  created_at           timestamptz default now(),
  -- Sprint 6
  assigned_to_user_id  uuid references public.users(id),
  role_id              uuid references public.roles(id),
  checklist_type       text default 'regular'
    check (checklist_type in ('regular','opening','closing','receiving'))
);

alter table public.checklist_tasks enable row level security;
create policy "checklist_tasks: membro ve" on public.checklist_tasks for select
  using (exists (
    select 1 from public.restaurant_users ru
    where ru.restaurant_id = restaurant_id and ru.user_id = auth.uid() and ru.active = true
  ));
create policy "checklist_tasks: owner/manager gerencia" on public.checklist_tasks for all
  using (exists (
    select 1 from public.restaurant_users ru
    where ru.restaurant_id = restaurant_id and ru.user_id = auth.uid()
      and ru.role in ('owner', 'manager') and ru.active = true
  ));

-- ── TASK_EXECUTIONS ───────────────────────────────────────
create table public.task_executions (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references public.restaurants(id),
  task_id        uuid not null references public.checklist_tasks(id),
  checklist_id   uuid not null references public.checklists(id),
  user_id        uuid not null references public.users(id),
  executed_at    timestamptz default now(),
  photo_url      text,
  status         text not null check (status in ('done', 'skipped', 'flagged', 'doing')),
  notes          text,
  -- Sprint 6
  started_at     timestamptz
);

alter table public.task_executions enable row level security;
create policy "task_executions: staff ve propria" on public.task_executions for select
  using (
    (user_id = auth.uid() and exists (
      select 1 from public.restaurant_users ru
      where ru.restaurant_id = restaurant_id and ru.user_id = auth.uid()
        and ru.role = 'staff' and ru.active = true
    ))
    or exists (
      select 1 from public.restaurant_users ru
      where ru.restaurant_id = restaurant_id and ru.user_id = auth.uid()
        and ru.role in ('owner', 'manager') and ru.active = true
    )
  );
create policy "task_executions: membro insere" on public.task_executions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.restaurant_users ru
      where ru.restaurant_id = restaurant_id and ru.user_id = auth.uid() and ru.active = true
    )
  );

-- ── SHIFTS (Sprint 6) ─────────────────────────────────────
create table public.shifts (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id),
  name           text not null,
  start_time     time not null,
  end_time       time not null,
  days_of_week   int[] not null default '{}',
  active         boolean default true,
  created_at     timestamptz default now()
);

alter table public.shifts enable row level security;
create policy "shifts_select" on public.shifts for select
  using (restaurant_id in (
    select restaurant_id from public.restaurant_users
    where user_id = auth.uid() and active = true
  ));
create policy "shifts_write" on public.shifts for all
  using (restaurant_id in (
    select restaurant_id from public.restaurant_users
    where user_id = auth.uid() and active = true and role in ('owner','manager')
  ));

-- ── ROLES (Sprint 6) ──────────────────────────────────────
create table public.roles (
  id                   uuid primary key default gen_random_uuid(),
  restaurant_id        uuid not null references public.restaurants(id),
  name                 text not null,
  color                text not null default '#13b6ec',
  max_concurrent_tasks integer not null default 1,
  can_launch_purchases boolean default false,
  created_at           timestamptz default now()
);

alter table public.roles enable row level security;
create policy "roles_select" on public.roles for select
  using (restaurant_id in (
    select restaurant_id from public.restaurant_users
    where user_id = auth.uid() and active = true
  ));
create policy "roles_write" on public.roles for all
  using (restaurant_id in (
    select restaurant_id from public.restaurant_users
    where user_id = auth.uid() and active = true and role in ('owner','manager')
  ));

-- ── USER_ROLES (Sprint 6) ─────────────────────────────────
create table public.user_roles (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id),
  user_id        uuid not null references public.users(id),
  role_id        uuid not null references public.roles(id),
  created_at     timestamptz default now(),
  unique(restaurant_id, user_id, role_id)
);

alter table public.user_roles enable row level security;
create policy "user_roles_select" on public.user_roles for select
  using (restaurant_id in (
    select restaurant_id from public.restaurant_users
    where user_id = auth.uid() and active = true
  ));
create policy "user_roles_write" on public.user_roles for all
  using (restaurant_id in (
    select restaurant_id from public.restaurant_users
    where user_id = auth.uid() and active = true and role in ('owner','manager')
  ));

-- ── USER_SHIFTS (Sprint 6) ────────────────────────────────
create table public.user_shifts (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id),
  user_id        uuid not null references public.users(id),
  shift_id       uuid not null references public.shifts(id),
  created_at     timestamptz default now()
);

alter table public.user_shifts enable row level security;
create policy "user_shifts_select" on public.user_shifts for select
  using (restaurant_id in (
    select restaurant_id from public.restaurant_users
    where user_id = auth.uid() and active = true
  ));
create policy "user_shifts_write" on public.user_shifts for all
  using (restaurant_id in (
    select restaurant_id from public.restaurant_users
    where user_id = auth.uid() and active = true and role in ('owner','manager')
  ));

-- ── PURCHASE_LISTS (Sprint 6) ─────────────────────────────
create table public.purchase_lists (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id),
  created_by       uuid not null references public.users(id),
  title            text not null,
  status           text not null default 'open'
    check (status in ('open','closed')),
  target_role_ids  uuid[] not null default '{}',
  notes            text,
  created_at       timestamptz default now(),
  closed_at        timestamptz
);

alter table public.purchase_lists enable row level security;
create policy "purchase_lists_select" on public.purchase_lists for select
  using (restaurant_id in (
    select restaurant_id from public.restaurant_users
    where user_id = auth.uid() and active = true
  ));
create policy "purchase_lists_write" on public.purchase_lists for all
  using (restaurant_id in (
    select restaurant_id from public.restaurant_users
    where user_id = auth.uid() and active = true and role in ('owner','manager')
  ));

-- ── PURCHASE_ITEMS (Sprint 6) ─────────────────────────────
create table public.purchase_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_list_id  uuid not null references public.purchase_lists(id),
  restaurant_id     uuid not null,
  name              text not null,
  quantity          numeric,
  unit              text check (unit in ('kg','g','L','ml','un','cx')),
  brand             text,
  notes             text,
  checked           boolean default false,
  checked_by        uuid references public.users(id),
  checked_at        timestamptz,
  has_problem       boolean default false,
  problem_notes     text
);

alter table public.purchase_items enable row level security;
create policy "purchase_items_select" on public.purchase_items for select
  using (restaurant_id in (
    select restaurant_id from public.restaurant_users
    where user_id = auth.uid() and active = true
  ));
create policy "purchase_items_write" on public.purchase_items for all
  using (restaurant_id in (
    select restaurant_id from public.restaurant_users
    where user_id = auth.uid() and active = true
  ));

-- ── ÍNDICES ───────────────────────────────────────────────
create index idx_ru_user       on public.restaurant_users(user_id);
create index idx_ru_restaurant on public.restaurant_users(restaurant_id);
create index idx_cl_restaurant on public.checklists(restaurant_id);
create index idx_ct_checklist  on public.checklist_tasks(checklist_id);
create index idx_te_restaurant on public.task_executions(restaurant_id);
create index idx_te_user       on public.task_executions(user_id);
create index idx_te_checklist  on public.task_executions(checklist_id);

-- ── STORAGE ───────────────────────────────────────────────
-- Criar bucket "photos" no painel do Supabase:
-- Storage → New bucket → nome: photos → privado (não público)
-- Estrutura dos arquivos: /photos/{restaurant_id}/{execution_id}/{filename}
