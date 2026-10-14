-- Account onboarding schema.
--
-- This migration intentionally keeps the account tables in public because the
-- browser client reads and updates them through Supabase's Data API. Every
-- exposed table is protected by RLS below.
create schema if not exists private;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('trial', 'fast', 'full')),
  name text not null,
  description text not null,
  lesson_limit integer check (lesson_limit is null or lesson_limit > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Meu workspace',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('terms_of_use', 'privacy_policy')),
  document_version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, document_type)
);

create index if not exists workspaces_owner_id_idx
  on public.workspaces (owner_id);

create index if not exists workspace_subscriptions_workspace_id_idx
  on public.workspace_subscriptions (workspace_id);

create index if not exists user_consents_user_id_idx
  on public.user_consents (user_id);

-- The trigger is kept outside public so it cannot become a callable Data API
-- endpoint. It provisions a workspace and its initial trial subscription for
-- every newly created Auth user.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
  trial_plan_id uuid;
begin
  insert into public.workspaces (owner_id, name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Meu workspace')
  )
  returning id into new_workspace_id;

  select id
    into trial_plan_id
    from public.plans
   where code = 'trial'
     and is_active = true;

  if trial_plan_id is not null then
    insert into public.workspace_subscriptions (workspace_id, plan_id, status)
    values (new_workspace_id, trial_plan_id, 'trialing');
  end if;

  return new;
end;
$$;

revoke all on schema private from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

-- Keep the onboarding catalog reproducible across environments.
insert into public.plans (code, name, description, lesson_limit, is_active)
values
  ('trial', 'Teste grátis', 'Experimente o gerador com até 3 aulas geradas.', 3, true),
  ('fast', 'Plano Fast', 'O essencial para planejar aulas com praticidade.', null, true),
  ('full', 'Plano Full', 'A experiência completa para criar, revisar e evoluir.', null, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    lesson_limit = excluded.lesson_limit,
    is_active = excluded.is_active;

-- Make the migration safe to apply to a project that already has Auth users.
insert into public.workspaces (owner_id, name)
select
  users.id,
  coalesce(nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''), 'Meu workspace')
from auth.users as users
on conflict (owner_id) do nothing;

insert into public.workspace_subscriptions (workspace_id, plan_id, status)
select workspaces.id, plans.id, 'trialing'
from public.workspaces
join public.plans on plans.code = 'trial' and plans.is_active = true
on conflict (workspace_id) do nothing;

alter table public.plans enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_subscriptions enable row level security;
alter table public.user_consents enable row level security;

drop policy if exists "authenticated users can read active plans" on public.plans;
create policy "authenticated users can read active plans"
  on public.plans
  for select
  to authenticated
  using (is_active = true);

drop policy if exists "owners can read their workspaces" on public.workspaces;
create policy "owners can read their workspaces"
  on public.workspaces
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "owners can update their workspaces" on public.workspaces;
create policy "owners can update their workspaces"
  on public.workspaces
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "owners can read their subscriptions" on public.workspace_subscriptions;
create policy "owners can read their subscriptions"
  on public.workspace_subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.workspaces
       where workspaces.id = workspace_subscriptions.workspace_id
         and workspaces.owner_id = (select auth.uid())
    )
  );

drop policy if exists "owners can update their subscriptions" on public.workspace_subscriptions;
create policy "owners can update their subscriptions"
  on public.workspace_subscriptions
  for update
  to authenticated
  using (
    exists (
      select 1
        from public.workspaces
       where workspaces.id = workspace_subscriptions.workspace_id
         and workspaces.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.workspaces
       where workspaces.id = workspace_subscriptions.workspace_id
         and workspaces.owner_id = (select auth.uid())
    )
    and exists (
      select 1
        from public.plans
       where plans.id = workspace_subscriptions.plan_id
         and plans.is_active = true
    )
  );

drop policy if exists "users can read their consents" on public.user_consents;
create policy "users can read their consents"
  on public.user_consents
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can create their consents" on public.user_consents;
create policy "users can create their consents"
  on public.user_consents
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can update their consents" on public.user_consents;
create policy "users can update their consents"
  on public.user_consents
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select on public.plans to authenticated;
grant select, update on public.workspaces to authenticated;
grant select, update on public.workspace_subscriptions to authenticated;
grant select, insert, update on public.user_consents to authenticated;
