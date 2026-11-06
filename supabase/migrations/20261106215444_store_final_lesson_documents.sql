-- Persist only the final lesson artifact. The lesson row already participates
-- in the subscription-cycle cleanup, so its document is purged with it.
alter table public.lessons
  add column final_document bytea,
  add column final_document_file_name text,
  add column final_document_content_type text;

alter table public.lessons
  add constraint lessons_final_document_fields_check
  check (
    (final_document is null and final_document_file_name is null and final_document_content_type is null)
    or (
      final_document is not null
      and octet_length(final_document) between 1 and 2097152
      and final_document_file_name is not null
      and char_length(final_document_file_name) between 5 and 200
      and final_document_file_name ~ '^[a-z0-9]+(-[a-z0-9]+)*\.(pdf|docx|pptx)$'
      and final_document_content_type is not null
      and (
        (output_format = 'pdf' and final_document_file_name ~ '\.pdf$' and final_document_content_type = 'application/pdf')
        or (
          output_format = 'docx'
          and final_document_file_name ~ '\.docx$'
          and final_document_content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        or (
          output_format = 'slides'
          and final_document_file_name ~ '\.pptx$'
          and final_document_content_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        )
      )
    )
  );

create or replace function private.protect_lesson_quota_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.plan_code is distinct from old.plan_code
     or new.created_at is distinct from old.created_at
     or new.output_format is distinct from old.output_format
     or new.final_document is distinct from old.final_document
     or new.final_document_file_name is distinct from old.final_document_file_name
     or new.final_document_content_type is distinct from old.final_document_content_type then
    raise exception using errcode = '42501', message = 'LESSON_QUOTA_FIELDS_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_lesson_quota_fields_before_update on public.lessons;
create trigger protect_lesson_quota_fields_before_update
  before update of workspace_id, plan_code, created_at, output_format,
    final_document, final_document_file_name, final_document_content_type
  on public.lessons
  for each row execute function private.protect_lesson_quota_fields();

-- The server sends the final artifact as base64. Decode it inside the same
-- transaction that creates the lesson and its question set.
drop function if exists public.create_lesson_within_plan_limit(uuid, uuid, jsonb, jsonb, jsonb, text);

create function public.create_lesson_within_plan_limit(
  p_workspace_id uuid,
  p_lesson_id uuid,
  p_input jsonb,
  p_content jsonb,
  p_questions jsonb,
  p_output_format text,
  p_final_document_base64 text,
  p_final_document_file_name text,
  p_final_document_content_type text
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
  v_document bytea;
begin
  if v_caller_id is null or p_workspace_id is null then
    raise exception using errcode = '42501', message = 'SUBSCRIPTION_INACTIVE';
  end if;

  if p_input is null
     or p_content is null
     or jsonb_typeof(p_questions) is distinct from 'array'
     or p_output_format is null
     or p_output_format not in ('pdf', 'docx', 'slides')
     or p_final_document_base64 is null
     or length(p_final_document_base64) not between 4 and 2796204
     or length(p_final_document_base64) % 4 <> 0
     or p_final_document_base64 !~ '^[A-Za-z0-9+/]*={0,2}$'
     or p_final_document_file_name is null
     or char_length(p_final_document_file_name) not between 5 and 200
     or p_final_document_file_name !~ '^[a-z0-9]+(-[a-z0-9]+)*\.(pdf|docx|pptx)$'
     or p_final_document_content_type is null then
    raise exception using errcode = '22023', message = 'INVALID_LESSON_PAYLOAD';
  end if;

  if (p_output_format = 'pdf'
      and (p_final_document_file_name !~ '\.pdf$' or p_final_document_content_type <> 'application/pdf'))
     or (p_output_format = 'docx'
      and (p_final_document_file_name !~ '\.docx$' or p_final_document_content_type <> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
     or (p_output_format = 'slides'
      and (p_final_document_file_name !~ '\.pptx$' or p_final_document_content_type <> 'application/vnd.openxmlformats-officedocument.presentationml.presentation')) then
    raise exception using errcode = '22023', message = 'INVALID_LESSON_DOCUMENT_FORMAT';
  end if;

  v_document := decode(p_final_document_base64, 'base64');
  if octet_length(v_document) not between 1 and 2097152 then
    raise exception using errcode = '22023', message = 'INVALID_LESSON_DOCUMENT_SIZE';
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

  insert into public.lessons (
    id, workspace_id, plan_code, input, content, output_format,
    final_document, final_document_file_name, final_document_content_type
  )
  values (
    coalesce(p_lesson_id, pg_catalog.gen_random_uuid()),
    p_workspace_id,
    case when v_plan_code = 'trial' then 'fast' else v_plan_code end,
    p_input,
    p_content,
    p_output_format,
    v_document,
    p_final_document_file_name,
    p_final_document_content_type
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

revoke all on function public.create_lesson_within_plan_limit(
  uuid, uuid, jsonb, jsonb, jsonb, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_lesson_within_plan_limit(
  uuid, uuid, jsonb, jsonb, jsonb, text, text, text, text
) to authenticated;
