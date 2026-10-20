import { createClient } from "@/lib/supabase/server";
import { isAnonymousSupabaseUser } from "@/lib/supabase/auth";
import { getAppUrl, getStripeClient } from "@/lib/stripe";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!userData.user || isAnonymousSupabaseUser(userData.user)) {
      return NextResponse.json({ error: "Entre com e-mail e senha ou com o Google para continuar." }, { status: 401 });
    }

    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (workspaceError) throw workspaceError;
    if (!workspace) return NextResponse.json({ error: "Workspace não encontrado." }, { status: 404 });

    const { data: subscription, error: subscriptionError } = await supabase
      .from("workspace_subscriptions")
      .select("stripe_customer_id")
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (!subscription?.stripe_customer_id) {
      return NextResponse.json({ error: "Ainda não há uma assinatura Stripe para gerenciar." }, { status: 409 });
    }

    const session = await getStripeClient().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${getAppUrl()}/protected`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe Customer Portal failed", error);
    return NextResponse.json({ error: "Não foi possível abrir o Portal do cliente agora." }, { status: 500 });
  }
}
