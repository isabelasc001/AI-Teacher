import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPlanCodeForStripePrice,
  getStripeClient,
} from "@/lib/stripe";
import Stripe from "stripe";

type AdminClient = ReturnType<typeof createAdminClient>;

function getObjectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

async function findWorkspaceSubscription(
  supabase: AdminClient,
  customerId: string,
  workspaceId?: string | null,
) {
  const { data: byCustomer, error: customerError } = await supabase
    .from("workspace_subscriptions")
    .select("id, workspace_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (customerError) throw customerError;
  if (byCustomer) return byCustomer;
  if (!workspaceId) return null;

  const { data: byWorkspace, error: workspaceError } = await supabase
    .from("workspace_subscriptions")
    .select("id, workspace_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (workspaceError) throw workspaceError;
  return byWorkspace;
}

async function syncSubscription(
  supabase: AdminClient,
  subscription: Stripe.Subscription,
  options: { checkoutSessionId?: string; invoiceId?: string } = {},
) {
  const customerId = getObjectId(subscription.customer);
  if (!customerId) return;

  const workspaceId = typeof subscription.metadata?.workspace_id === "string"
    ? subscription.metadata.workspace_id
    : null;
  const workspaceSubscription = await findWorkspaceSubscription(supabase, customerId, workspaceId);
  if (!workspaceSubscription) return;

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end ?? null;
  const planCode = getPlanCodeForStripePrice(priceId);
  const update: Record<string, string | boolean | null> = {
    status: subscription.status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    current_period_end: currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    ends_at: subscription.ended_at
      ? new Date(subscription.ended_at * 1000).toISOString()
      : null,
  };

  if (options.checkoutSessionId) update.stripe_checkout_session_id = options.checkoutSessionId;
  if (options.invoiceId) update.last_invoice_id = options.invoiceId;

  if (planCode) {
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("id")
      .eq("code", planCode)
      .maybeSingle();

    if (planError) throw planError;
    if (plan) update.plan_id = plan.id;
  }

  const { error: updateError } = await supabase
    .from("workspace_subscriptions")
    .update(update)
    .eq("id", workspaceSubscription.id);

  if (updateError) throw updateError;
}

async function handleEvent(supabase: AdminClient, event: Stripe.Event) {
  const stripe = getStripeClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return;

      const subscriptionId = getObjectId(session.subscription);
      if (!subscriptionId) return;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncSubscription(supabase, subscription, { checkoutSessionId: session.id });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscription(supabase, event.data.object as Stripe.Subscription);
      return;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionReference = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = getObjectId(subscriptionReference);
      if (!subscriptionId) return;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncSubscription(supabase, subscription, { invoiceId: invoice.id });
      return;
    }

    default:
      return;
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!signature || !webhookSecret) {
    return new Response("Webhook is not configured.", { status: 503 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return new Response("Invalid webhook signature.", { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data: processedEvent, error: lookupError } = await supabase
      .from("stripe_webhook_events")
      .select("stripe_event_id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (processedEvent) return Response.json({ received: true, duplicate: true });

    await handleEvent(supabase, event);

    const { error: insertError } = await supabase
      .from("stripe_webhook_events")
      .insert({ stripe_event_id: event.id, event_type: event.type });

    if (insertError && insertError.code !== "23505") throw insertError;

    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return new Response("Webhook processing failed.", { status: 500 });
  }
}
