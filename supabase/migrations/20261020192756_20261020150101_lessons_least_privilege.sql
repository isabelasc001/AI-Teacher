-- Keep public.lessons limited to operations exposed to signed-in owners.
-- Lesson creation goes through the quota RPC; client roles should not insert directly.
revoke select, update, delete, truncate, references, trigger, maintain
  on table public.lessons from anon;

revoke delete, truncate, references, trigger, maintain
  on table public.lessons from authenticated;
