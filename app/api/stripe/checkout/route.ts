import { createAdminClient } from "@/lib/supabase/admin";
import { isAnonymousSupabaseUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createCheckoutIntegrationIdentifier,
  getAppUrl,
  getStripeClient,
  getStripePriceId,
  isAutomaticTaxEnabled,
  isPaidPlanCode,
} from "@/lib/stripe";
import { NextResponse } from "next/server";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { planCode?: unknown } | null;
    const planCode = body?.planCode;

    if (!isPaidPlanCode(planCode)) {
      return errorResponse("Escolha um plano pago válido.", 400);
    }

    const requestIdempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!requestIdempotencyKey || requestIdempotencyKey.length > 200) {
      return errorResponse("Informe uma chave de idempotência válida para iniciar o Checkout.", 400);
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!userData.user || isAnonymousSupabaseUser(userData.user)) {
      return errorResponse("Entre com e-mail e senha ou com o Google para continuar.", 401);
    }

    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (workspaceError) throw workspaceError;
    if (!workspace) return errorResponse("Não encontramos o workspace da sua conta.", 404);

    // The browser client is used only to establish the caller's identity.
    // Billing projections are server-owned and must be read/written with the
    // service-role client because authenticated users cannot update them.
    const admin = createAdminClient();
    const { data: subscription, error: subscriptionError } = await admin
      .from("workspace_subscriptions")
      .select("id, plan_id, status, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id")
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (!subscription) return errorResponse("Não encontramos a assinatura do workspace.", 404);

    if (
      subscription.stripe_subscription_id
      && !["canceled", "incomplete_expired"].includes(subscription.status)
    ) {
      return errorResponse("Sua assinatura já existe. Use o Portal do cliente para alterá-la.", 409);
    }

    if (!subscription.stripe_subscription_id) {
      const { data: currentPlan, error: currentPlanError } = await admin
        .from("plans")
        .select("code, lesson_limit")
        .eq("id", subscription.plan_id)
        .eq("is_active", true)
        .maybeSingle();

      if (currentPlanError) throw currentPlanError;
      if (!currentPlan || currentPlan.code !== "trial" || subscription.status !== "trialing") {
        return errorResponse("Não foi possível validar o período de teste desta conta.", 403);
      }

      const { count, error: lessonCountError } = await admin
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id);

      if (lessonCountError) throw lessonCountError;
      if ((count ?? 0) < (currentPlan.lesson_limit ?? 3)) {
        return errorResponse("Conclua suas 3 aulas grátis antes de escolher uma assinatura.", 409);
      }
    }

    const priceId = getStripePriceId(planCode);
    if (!priceId) {
      return errorResponse("Este plano ainda não está configurado no Stripe.", 503);
    }

    const stripe = getStripeClient();

    if (!subscription.stripe_subscription_id && subscription.stripe_checkout_session_id) {
      const pendingSession = await stripe.checkout.sessions.retrieve(subscription.stripe_checkout_session_id);
      if (pendingSession.status === "complete") {
        return errorResponse("Seu Checkout foi concluído e a assinatura está sendo confirmada.", 409);
      }
      if (pendingSession.status === "open") {
        if (pendingSession.metadata?.plan_code === planCode && pendingSession.url) {
          return NextResponse.json({ url: pendingSession.url });
        }
        await stripe.checkout.sessions.expire(pendingSession.id);
      }
    }

    let customerId = subscription.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email ?? undefined,
        name: typeof userData.user.user_metadata?.full_name === "string"
          ? userData.user.user_metadata.full_name
          : undefined,
        metadata: { workspace_id: workspace.id },
      }, {
        // A stable key makes concurrent requests for the same workspace
        // resolve to one Stripe Customer.
        idempotencyKey: `customer_${subscription.id}`,
      });
      customerId = customer.id;

      const { data: savedSubscription, error: customerUpdateError } = await admin
        .from("workspace_subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("id", subscription.id)
        .is("stripe_customer_id", null)
        .select("stripe_customer_id")
        .maybeSingle();

      if (customerUpdateError) throw customerUpdateError;
      if (!savedSubscription?.stripe_customer_id) {
        const { data: currentSubscription, error: currentSubscriptionError } = await admin
          .from("workspace_subscriptions")
          .select("stripe_customer_id")
          .eq("id", subscription.id)
          .maybeSingle();

        if (currentSubscriptionError) throw currentSubscriptionError;
        if (!currentSubscription?.stripe_customer_id) {
          throw new Error("Stripe Customer could not be saved for the workspace.");
        }

        customerId = currentSubscription.stripe_customer_id;
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: workspace.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      automatic_tax: isAutomaticTaxEnabled() ? { enabled: true } : undefined,
      customer_update: { address: "auto" },
      integration_identifier: createCheckoutIntegrationIdentifier(
        `checkout_${workspace.id}_${requestIdempotencyKey}`,
      ),
      metadata: {
        plan_code: planCode,
        workspace_id: workspace.id,
      },
      subscription_data: {
        metadata: {
          plan_code: planCode,
          workspace_id: workspace.id,
        },
      },
      success_url: `${getAppUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getAppUrl()}/protected?billing=canceled`,
    }, {
      // The client reuses this key when a request is retried. Namespacing it
      // by workspace prevents one caller from colliding with another caller's
      // Stripe request.
      idempotencyKey: `checkout_${workspace.id}_${requestIdempotencyKey}`,
    });

    if (!session.url) {
      return errorResponse("O Stripe não retornou um endereço de Checkout.", 502);
    }

    const { error: checkoutSessionSaveError } = await admin
      .from("workspace_subscriptions")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", subscription.id);

    if (checkoutSessionSaveError) throw checkoutSessionSaveError;

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe Checkout failed", error);
    return errorResponse("Não foi possível iniciar o Checkout agora.", 500);
  }
}
