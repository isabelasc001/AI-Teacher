-- Paid lesson allowances reset with each Stripe subscription cycle. Trial
-- lessons are counted for the lifetime of the account.
alter table public.plans
  add column if not exists question_bank_limit integer not null default 0;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'plans_question_bank_limit_check'
       and conrelid = 'public.plans'::regclass
  ) then
    alter table public.plans
      add constraint plans_question_bank_limit_check
      check (question_bank_limit >= 0);
  end if;
end $$;

alter table public.workspace_subscriptions
  add column if not exists current_period_start timestamptz;

update public.plans
   set lesson_limit = case code
         when 'trial' then 3
         when 'fast' then 20
         when 'full' then 30
       end,
       question_bank_limit = case code
         when 'trial' then 0
         when 'fast' then 2
         when 'full' then 4
       end,
       description = case code
         when 'trial' then '3 aulas grátis com os recursos do plano Fast.'
         when 'fast' then '20 aulas e 2 criações no banco de questões por ciclo.'
         when 'full' then '30 aulas e 4 criações no banco de questões por ciclo.'
       end
 where code in ('trial', 'fast', 'full');

-- Older onboarding allowed a paid plan to be saved as "incomplete" before a
-- Stripe subscription existed. Move those unpaid accounts to the trial that
-- the new signup flow starts with.
update public.workspace_subscriptions as subscriptions
   set plan_id = trial.id,
       status = 'trialing'
  from public.plans as trial
 where trial.code = 'trial'
   and subscriptions.status = 'incomplete'
   and subscriptions.stripe_subscription_id is null;

create or replace function public.create_lesson_within_plan_limit(
  p_workspace_id uuid,
  p_lesson_id uuid,
  p_input jsonb,
  p_content jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  plan_code text;
  subscription_status text;
  lesson_limit integer;
  cycle_start timestamptz;
  lessons_used bigint;
  created_lesson_id uuid;
begin
  if caller_id is null or p_workspace_id is null then
    raise exception using errcode = '42501', message = 'SUBSCRIPTION_INACTIVE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text, 0)
  );

  select plans.code,
         subscriptions.status,
         plans.lesson_limit,
         coalesce(subscriptions.current_period_start, subscriptions.starts_at)
    into plan_code, subscription_status, lesson_limit, cycle_start
    from public.workspaces as workspaces
    join public.workspace_subscriptions as subscriptions
      on subscriptions.workspace_id = workspaces.id
    join public.plans as plans
      on plans.id = subscriptions.plan_id
   where workspaces.id = p_workspace_id
     and workspaces.owner_id = caller_id
     and plans.is_active = true;

  if not found
     or not (
       (plan_code = 'trial' and subscription_status = 'trialing')
       or (plan_code in ('fast', 'full') and subscription_status = 'active')
     )
     or lesson_limit is null
     or lesson_limit < 1 then
    raise exception using errcode = '42501', message = 'SUBSCRIPTION_INACTIVE';
  end if;

  select pg_catalog.count(*)
    into lessons_used
    from public.lessons as lessons
   where lessons.workspace_id = p_workspace_id
     and (
       plan_code = 'trial'
       or lessons.created_at >= cycle_start
     );

  if lessons_used >= lesson_limit then
    raise exception using errcode = 'P0001', message = 'LESSON_QUOTA_EXCEEDED';
  end if;

  -- Trial content uses Fast input rules and the common Fast/Full lessons table.
  insert into public.lessons (id, workspace_id, plan_code, input, content)
  values (
    coalesce(p_lesson_id, pg_catalog.gen_random_uuid()),
    p_workspace_id,
    case when plan_code = 'trial' then 'fast' else plan_code end,
    p_input,
    p_content
  )
  returning id into created_lesson_id;

  return created_lesson_id;
end;
$$;

revoke all on function public.create_lesson_within_plan_limit(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_lesson_within_plan_limit(uuid, uuid, jsonb, jsonb)
  to authenticated;

-- All lesson inserts must pass through the single-row quota transaction above.
drop policy if exists "owners can create their lessons" on public.lessons;
revoke insert on public.lessons from anon, authenticated;

create or replace function private.protect_lesson_quota_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.plan_code is distinct from old.plan_code
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = '42501', message = 'LESSON_QUOTA_FIELDS_IMMUTABLE';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_lesson_quota_fields() from public, anon, authenticated;

drop trigger if exists protect_lesson_quota_fields_before_update on public.lessons;
create trigger protect_lesson_quota_fields_before_update
  before update of workspace_id, plan_code, created_at on public.lessons
  for each row execute function private.protect_lesson_quota_fields();
