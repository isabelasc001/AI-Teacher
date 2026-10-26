-- Store unfinalized lesson previews so correction limits are enforced on the
-- server and the lesson quota is consumed only when the user confirms.
create table public.lesson_generation_previews (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  commercial_plan_code text not null check (commercial_plan_code in ('trial', 'fast', 'full')),
  workspace_plan_code text not null check (workspace_plan_code in ('fast', 'full')),
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  output_format text not null check (output_format in ('pdf', 'docx', 'slides')),
  corrections_used smallint not null default 0 check (corrections_used between 0 and 2),
  expires_at timestamptz not null default (pg_catalog.now() + interval '2 hours'),
  finalized_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create index lesson_generation_previews_owner_expiry_idx
  on public.lesson_generation_previews (owner_id, expires_at);
alter table public.lesson_generation_previews enable row level security;
revoke all on table public.lesson_generation_previews from public, anon, authenticated;
grant select, insert, update, delete on table public.lesson_generation_previews to service_role;
comment on table public.lesson_generation_previews is
  'Temporary, server-managed lesson drafts. Rows expire two hours after preview generation.';
