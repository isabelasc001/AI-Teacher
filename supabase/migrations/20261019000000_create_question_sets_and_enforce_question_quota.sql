-- Every persisted lesson receives one generated question set. A set is the
-- unit counted against question_bank_limit, while its questions are stored as
-- a JSON array so the set is written atomically with its source lesson.
create table if not exists public.question_sets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lesson_id uuid not null unique references public.lessons(id) on delete cascade,
  source_title text not null,
  source_topic text not null,
  questions jsonb not null check (
    jsonb_typeof(questions) = 'array'
    and jsonb_array_length(questions) = 5
  ),
  created_at timestamptz not null default now()
);

-- CREATE TABLE IF NOT EXISTS does not upgrade an older question_sets table.
-- Replace its earlier array-only check so both fresh and existing databases
-- enforce the five-question contract.
alter table public.question_sets
  drop constraint if exists question_sets_questions_check;
alter table public.question_sets
  add constraint question_sets_questions_check
  check (
    jsonb_typeof(questions) = 'array'
    and jsonb_array_length(questions) = 5
  );

create index if not exists question_sets_workspace_created_at_idx
  on public.question_sets (workspace_id, created_at desc);

alter table public.question_sets enable row level security;

drop policy if exists "owners can read their question sets" on public.question_sets;
create policy "owners can read their question sets"
  on public.question_sets
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.workspaces
       where workspaces.id = question_sets.workspace_id
         and workspaces.owner_id = (select auth.uid())
    )
  );

revoke all on table public.question_sets from public, anon, authenticated;
grant select on public.question_sets to authenticated;

-- Preserve the bank for lessons that were created before this feature. Keep
-- their original timestamps so paid-plan cycle counts remain accurate.
insert into public.question_sets (
  workspace_id,
  lesson_id,
  source_title,
  source_topic,
  questions,
  created_at
)
select
  lessons.workspace_id,
  lessons.id,
  coalesce(nullif(lessons.content ->> 'title', ''), 'Aula sem título'),
  coalesce(nullif(lessons.input ->> 'topic', ''), 'Conteúdo da aula'),
  jsonb_build_array(
    jsonb_build_object(
      'category', 'diagnostico',
      'prompt', 'Que ideias ou experiências você já tem sobre “' || coalesce(nullif(lessons.input ->> 'topic', ''), 'este tema') || '”?',
      'answerGuide', 'Considere respostas variadas e registre os conhecimentos prévios que podem ser retomados durante a aula.'
    ),
    jsonb_build_object(
      'category', 'compreensao',
      'prompt', 'Explique com suas palavras o que você deverá aprender sobre “' || coalesce(nullif(lessons.input ->> 'topic', ''), 'este tema') || '”: ' || coalesce(nullif(lessons.input ->> 'goal', ''), 'o objetivo apresentado na aula'),
      'answerGuide', 'A resposta deve demonstrar compreensão do objetivo da aula: ' || coalesce(nullif(lessons.input ->> 'goal', ''), 'o objetivo apresentado na aula')
    ),
    jsonb_build_object(
      'category', 'aplicacao',
      'prompt', 'Crie um exemplo de situação em que o conteúdo “' || coalesce(nullif(lessons.input ->> 'topic', ''), 'estudado na aula') || '” possa ser usado e explique sua escolha.',
      'answerGuide', 'Aceite exemplos coerentes com o conteúdo estudado e com o nível da turma; peça que o estudante justifique a relação.'
    ),
    jsonb_build_object(
      'category', 'avaliacao',
      'prompt', 'Na atividade “' || coalesce(nullif(lessons.content #>> '{activities,2,title}', ''), 'Prática colaborativa') || '”, que evidência mostraria que você alcançou o objetivo da aula?',
      'answerGuide', coalesce(nullif(lessons.content #>> '{activities,2,evidence}', ''), nullif(lessons.content ->> 'assessment', ''), 'A resposta deve mostrar como o estudante aplicou o conteúdo estudado.')
    ),
    jsonb_build_object(
      'category', 'reflexao',
      'prompt', 'Depois de estudar “' || coalesce(nullif(lessons.input ->> 'topic', ''), 'este tema') || '”, que dúvida ainda ficou ou que próximo passo você gostaria de explorar?',
      'answerGuide', 'A resposta é pessoal. Use-a para identificar dúvidas recorrentes e planejar uma retomada ou uma atividade de aprofundamento.'
    )
  ),
  lessons.created_at
from public.lessons as lessons
on conflict (lesson_id) do nothing;

-- Each lesson generates exactly one question set, so align the set allowance
-- with the persisted lesson allowance for every plan.
update public.plans
   set question_bank_limit = lesson_limit,
       description = case code
         when 'trial' then '3 aulas grátis, cada uma com um conjunto automático de questões.'
         when 'fast' then '20 aulas por ciclo, cada uma com um conjunto automático de questões.'
         when 'full' then '30 aulas por ciclo, cada uma com um conjunto automático de questões.'
       end
 where code in ('trial', 'fast', 'full');

-- Replacing the function signature removes the older lesson-only RPC. The
-- transaction lock serializes both lesson and question-set usage for a
-- workspace before either row is inserted.
drop function if exists public.create_lesson_within_plan_limit(uuid, uuid, jsonb, jsonb);

create or replace function public.create_lesson_within_plan_limit(
  p_workspace_id uuid,
  p_lesson_id uuid,
  p_input jsonb,
  p_content jsonb,
  p_questions jsonb
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
  v_lessons_used bigint;
  v_question_sets_used bigint;
  v_created_lesson_id uuid;
begin
  if v_caller_id is null or p_workspace_id is null then
    raise exception using errcode = '42501', message = 'SUBSCRIPTION_INACTIVE';
  end if;

  if p_input is null or p_content is null
     or jsonb_typeof(p_questions) is distinct from 'array' then
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
         coalesce(subscriptions.current_period_start, subscriptions.starts_at)
    into v_plan_code, v_subscription_status, v_lesson_limit, v_question_bank_limit, v_cycle_start
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
     or v_lesson_limit < 1 then
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

  -- Trial content uses Fast input rules and the common Fast/Full lessons table.
  insert into public.lessons (id, workspace_id, plan_code, input, content)
  values (
    coalesce(p_lesson_id, pg_catalog.gen_random_uuid()),
    p_workspace_id,
    case when v_plan_code = 'trial' then 'fast' else v_plan_code end,
    p_input,
    p_content
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

revoke all on function public.create_lesson_within_plan_limit(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_lesson_within_plan_limit(uuid, uuid, jsonb, jsonb, jsonb)
  to authenticated;
