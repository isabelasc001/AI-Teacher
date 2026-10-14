-- Stripe Billing / Invoicing synchronization.
--
-- Stripe remains the source of truth for paid subscription state. These
-- columns are a local projection used by the app after verified webhooks.
alter table public.workspace_subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists last_invoice_id text;

-- Stripe can introduce lifecycle states that are not part of the original
-- onboarding-only check constraint.
do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conname = 'workspace_subscriptions_status_check'
       and conrelid = 'public.workspace_subscriptions'::regclass
  ) then
    alter table public.workspace_subscriptions
      drop constraint workspace_subscriptions_status_check;
  end if;

  alter table public.workspace_subscriptions
    add constraint workspace_subscriptions_status_check
    check (status in (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'unpaid',
      'paused'
    ));
end $$;

create unique index if not exists workspace_subscriptions_stripe_customer_id_idx
  on public.workspace_subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists workspace_subscriptions_stripe_subscription_id_idx
  on public.workspace_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists workspace_subscriptions_stripe_price_id_idx
  on public.workspace_subscriptions (stripe_price_id)
  where stripe_price_id is not null;

-- Paid subscription state must be changed by the server-side onboarding route
-- or verified Stripe webhooks, never by a browser Data API update.
drop policy if exists "owners can update their subscriptions" on public.workspace_subscriptions;
revoke update on public.workspace_subscriptions from anon, authenticated;

-- Stores only event identifiers for idempotency. The webhook payload itself
-- is not persisted because it can contain customer and invoice data.
create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;
