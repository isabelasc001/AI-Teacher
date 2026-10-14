-- User profile data that is safe to expose through the Data API.
-- Authentication remains in auth.users; this table stores the editable
-- workspace profile and the provider used to create the account.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  display_name text not null default 'Professor(a)',
  full_name text,
  phone text,
  profile_completed_at timestamptz,
  provider_type text not null check (provider_type in ('email_password', 'google')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The project already has a legacy profiles table in some environments. Add
-- the canonical columns there instead of assuming CREATE TABLE changed it.
alter table public.profiles add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists profile_completed_at timestamptz;
alter table public.profiles add column if not exists provider_type text;

-- Legacy profiles used id/full_name. Preserve that data when id is an Auth
-- user id, then fill any remaining Auth users from auth.users.
update public.profiles as profiles
set user_id = profiles.id::text::uuid
where profiles.user_id is null
  and profiles.id::text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  and exists (select 1 from auth.users where auth.users.id = profiles.id::text::uuid);

update public.profiles
set display_name = coalesce(nullif(trim(display_name), ''), nullif(trim(full_name), ''), 'Professor(a)')
where display_name is null or trim(display_name) = '';

update public.profiles as profiles
set provider_type = case
  when users.raw_app_meta_data ->> 'provider' = 'google' then 'google'
  else 'email_password'
end
from auth.users as users
where users.id = profiles.user_id
  and profiles.provider_type is null;

update public.profiles
set provider_type = 'email_password'
where provider_type is null;

alter table public.profiles alter column display_name set default 'Professor(a)';
alter table public.profiles alter column display_name set not null;
alter table public.profiles alter column provider_type set default 'email_password';
alter table public.profiles alter column provider_type set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profiles_provider_type_check'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_provider_type_check
      check (provider_type in ('email_password', 'google'));
  end if;
end;
$$;

create unique index if not exists profiles_user_id_key on public.profiles (user_id);

-- Keep timestamps authoritative even when a client omits updated_at.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure private.set_updated_at();

-- A separate trigger keeps profile creation independent from workspace
-- provisioning. The provider is read from Auth app metadata, never from a
-- browser-supplied field.
create or replace function private.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_provider text;
  profile_provider text;
  fallback_name text;
begin
  auth_provider := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  profile_provider := case
    when auth_provider = 'google' then 'google'
    else 'email_password'
  end;

  fallback_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
    'Professor(a)'
  );

  insert into public.profiles (id, user_id, display_name, full_name, phone, provider_type)
  values (
    new.id,
    new.id,
    fallback_name,
    fallback_name,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    profile_provider
  )
  on conflict (user_id) do update
    set provider_type = excluded.provider_type,
        full_name = coalesce(excluded.full_name, profiles.full_name),
        updated_at = now();

  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure private.handle_new_profile();

-- Backfill accounts created before this migration. Existing profile values are
-- preserved if the migration is run again.
insert into public.profiles (id, user_id, display_name, full_name, phone, provider_type)
select
  users.id,
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(users.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(split_part(coalesce(users.email, ''), '@', 1)), ''),
    'Professor(a)'
  ),
  coalesce(nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(users.email), '')),
  nullif(trim(users.raw_user_meta_data ->> 'phone'), ''),
  case
    when users.raw_app_meta_data ->> 'provider' = 'google' then 'google'
    else 'email_password'
  end
from auth.users as users
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;

drop policy if exists "users can read their profile" on public.profiles;
create policy "users can read their profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can update their profile" on public.profiles;
create policy "users can update their profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
