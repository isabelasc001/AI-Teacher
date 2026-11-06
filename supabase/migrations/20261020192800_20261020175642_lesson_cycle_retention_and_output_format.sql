-- Lessons are retained for one paid billing cycle. Question sets outlive their
-- source lessons so they remain available for cumulative assessments.
-- The generated output format is immutable so a saved lesson can only be
-- downloaded again in the format selected when it was created.

alter table public.lessons
  add column if not exists output_format text;

-- If an earlier manual attempt already added this column, preserve valid
-- choices and fill only missing values before enforcing the final default.
update public.lessons
   set output_format = 'pdf'
 where output_format is null;

alter table public.lessons
  alter column output_format set default 'pdf',
  alter column output_format set not null;

alter table public.lessons
  drop constraint if exists lessons_output_format_check;

alter table public.lessons
  add constraint lessons_output_format_check
  check (output_format in ('pdf', 'docx', 'slides'));

-- Keep the output format immutable when a lesson is edited through the Data API.
create or replace function private.protect_lesson_quota_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.plan_code is distinct from old.plan_code
     or new.created_at is distinct from old.created_at
     or new.output_format is distinct from old.output_format then
    raise exception using errcode = '42501', message = 'LESSON_QUOTA_FIELDS_IMMUTABLE';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_lesson_quota_fields() from public, anon, authenticated;

drop trigger if exists protect_lesson_quota_fields_before_update on public.lessons;
create trigger protect_lesson_quota_fields_before_update
  before update of workspace_id, plan_code, created_at, output_format on public.lessons
  for each row execute function private.protect_lesson_quota_fields();

-- Deleting a lesson detaches its question set, preserving the questions for
-- cumulative assessments. This trigger runs in the Stripe webhook transaction.
alter table public.question_sets
  alter column lesson_id drop not null;

alter table public.question_sets
  drop constraint if exists question_sets_lesson_id_fkey;

alter table public.question_sets
  add constraint question_sets_lesson_id_fkey
  foreign key (lesson_id) references public.lessons(id) on delete set null;

create or replace function private.purge_prior_cycle_lessons()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.current_period_start is not null
     and old.current_period_start is distinct from new.current_period_start then
    delete from public.lessons as lessons
     where lessons.workspace_id = new.workspace_id
       and lessons.created_at < new.current_period_start;
  end if;

  return new;
end;
$$;

revoke all on function private.purge_prior_cycle_lessons() from public, anon, authenticated;

drop trigger if exists purge_prior_cycle_lessons_after_period_start_update on public.workspace_subscriptions;
create trigger purge_prior_cycle_lessons_after_period_start_update
  after update of current_period_start on public.workspace_subscriptions
  for each row
  when (old.current_period_start is distinct from new.current_period_start)
  execute function private.purge_prior_cycle_lessons();

-- A subscription that ends without renewing has no next period-start webhook.
-- pg_cron removes its lessons shortly after current_period_end instead.
create extension if not exists pg_cron;

create or replace function private.purge_expired_lesson_cycles()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  delete from public.lessons as lessons
  using public.workspace_subscriptions as subscriptions
  where subscriptions.workspace_id = lessons.workspace_id
    and subscriptions.stripe_subscription_id is not null
    and coalesce(
      subscriptions.current_period_end,
      coalesce(subscriptions.current_period_start, subscriptions.starts_at) + interval '30 days'
    ) <= pg_catalog.now()
    and lessons.created_at < coalesce(
      subscriptions.current_period_end,
      coalesce(subscriptions.current_period_start, subscriptions.starts_at) + interval '30 days'
    );

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function private.purge_expired_lesson_cycles() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
      from cron.job
     where jobname = 'purge-expired-lesson-cycles'
  ) then
    perform cron.schedule(
      'purge-expired-lesson-cycles',
      '*/15 * * * *',
      'select private.purge_expired_lesson_cycles();'
    );
  end if;
end;
$$;

-- Also clean up already-expired paid cycles when this migration is applied.
select private.purge_expired_lesson_cycles();

-- Replace the quota RPC so output_format is written atomically with the lesson
-- and paid subscriptions cannot create another lesson after the stored cycle ends.
drop function if exists public.create_lesson_within_plan_limit(uuid, uuid, jsonb, jsonb);
drop function if exists public.create_lesson_within_plan_limit(uuid, uuid, jsonb, jsonb, jsonb);

create function public.create_lesson_within_plan_limit(
  p_workspace_id uuid,
  p_lesson_id uuid,
  p_input jsonb,
  p_content jsonb,
  p_questions jsonb,
  p_output_format text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_plan_code text;
  v_subscription_status text;
  v_lesson_limit integer;
  v_question_bank_limit integer;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_lessons_used bigint;
  v_question_sets_used bigint;
  v_created_lesson_id uuid;
begin
  if v_caller_id is null or p_workspace_id is null then
    raise exception using errcode = '42501', message = 'SUBSCRIPTION_INACTIVE';
  end if;

  if p_input is null
     or p_content is null
     or jsonb_typeof(p_questions) is distinct from 'array'
     or p_output_format is null
     or p_output_format not in ('pdf', 'docx', 'slides') then
    raise exception using errcode = '22023', message = 'INVALID_LESSON_PAYLOAD';
  end if;

  if jsonb_array_length(p_questions) <> 5 then
    raise exception using errcode = '22023', message = 'INVALID_LESSON_PAYLOAD';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text, 0)
  );

  select plans.code,
         subscriptions.status,
         plans.lesson_limit,
         plans.question_bank_limit,
         coalesce(subscriptions.current_period_start, subscriptions.starts_at),
         subscriptions.current_period_end
    into v_plan_code, v_subscription_status, v_lesson_limit, v_question_bank_limit, v_cycle_start, v_cycle_end
    from public.workspaces as workspaces
    join public.workspace_subscriptions as subscriptions
      on subscriptions.workspace_id = workspaces.id
    join public.plans as plans
      on plans.id = subscriptions.plan_id
   where workspaces.id = p_workspace_id
     and workspaces.owner_id = v_caller_id
     and plans.is_active = true;

  if not found
     or not (
       (v_plan_code = 'trial' and v_subscription_status = 'trialing')
       or (v_plan_code in ('fast', 'full') and v_subscription_status = 'active')
     )
     or v_lesson_limit is null
     or v_lesson_limit < 1
     or (
       v_plan_code in ('fast', 'full')
       and coalesce(v_cycle_end, v_cycle_start + interval '30 days') <= pg_catalog.now()
     ) then
    raise exception using errcode = '42501', message = 'SUBSCRIPTION_INACTIVE';
  end if;

  select pg_catalog.count(*)
    into v_lessons_used
    from public.lessons as lessons
   where lessons.workspace_id = p_workspace_id
     and (
       v_plan_code = 'trial'
       or lessons.created_at >= v_cycle_start
     );

  if v_lessons_used >= v_lesson_limit then
    raise exception using errcode = 'P0001', message = 'LESSON_QUOTA_EXCEEDED';
  end if;

  select pg_catalog.count(*)
    into v_question_sets_used
    from public.question_sets as question_sets
   where question_sets.workspace_id = p_workspace_id
     and (
       v_plan_code = 'trial'
       or question_sets.created_at >= v_cycle_start
     );

  if v_question_bank_limit is null
     or v_question_sets_used >= v_question_bank_limit then
    raise exception using errcode = 'P0001', message = 'QUESTION_BANK_QUOTA_EXCEEDED';
  end if;

  insert into public.lessons (id, workspace_id, plan_code, input, content, output_format)
  values (
    coalesce(p_lesson_id, pg_catalog.gen_random_uuid()),
    p_workspace_id,
    case when v_plan_code = 'trial' then 'fast' else v_plan_code end,
    p_input,
    p_content,
    p_output_format
  )
  returning id into v_created_lesson_id;

  insert into public.question_sets (
    workspace_id,
    lesson_id,
    source_title,
    source_topic,
    questions
  )
  values (
    p_workspace_id,
    v_created_lesson_id,
    coalesce(nullif(p_content ->> 'title', ''), 'Aula sem título'),
    coalesce(nullif(p_input ->> 'topic', ''), 'Conteúdo da aula'),
    p_questions
  );

  return v_created_lesson_id;
end;
$$;

revoke all on function public.create_lesson_within_plan_limit(uuid, uuid, jsonb, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.create_lesson_within_plan_limit(uuid, uuid, jsonb, jsonb, jsonb, text)
  to authenticated;
