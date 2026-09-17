-- Keep the onboarding catalog reproducible across environments.
-- The table, unique code constraint, RLS and handle_new_user trigger are
-- provisioned by the account schema migration.
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
