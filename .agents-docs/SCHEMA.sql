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
  id             uuid primary key default uuid_generate_v4(),
  checklist_id   uuid not null references public.checklists(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id),
  title          text not null,
  description    text,
  requires_photo boolean default false,
  is_critical    boolean default false,
  "order"        integer default 0,
  created_at     timestamptz default now()
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
  status         text not null check (status in ('done', 'skipped', 'flagged')),
  notes          text
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
