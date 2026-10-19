import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const requiredConsents = [
  { document_type: "terms_of_use", document_version: "v1" },
  { document_type: "privacy_policy", document_version: "v1" },
] as const;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { planCode?: unknown } | null;
    const planCode = body?.planCode;

    if (planCode !== "trial") {
      return NextResponse.json({ error: "O cadastro começa pelo teste grátis." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });

    const admin = createAdminClient();
    const { data: trialPlan, error: planError } = await admin
      .from("plans")
      .select("id")
      .eq("code", "trial")
      .eq("is_active", true)
      .maybeSingle();

    if (planError) throw planError;
    if (!trialPlan) return NextResponse.json({ error: "O teste grátis não está disponível." }, { status: 409 });

    const { data: workspace, error: workspaceError } = await admin
      .from("workspaces")
      .select("id")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (workspaceError) throw workspaceError;
    if (!workspace) return NextResponse.json({ error: "Não encontramos o workspace da sua conta." }, { status: 404 });

    const { data: subscription, error: subscriptionError } = await admin
      .from("workspace_subscriptions")
      .select("id, plan_id, status")
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (!subscription) return NextResponse.json({ error: "Não encontramos a assinatura do workspace." }, { status: 404 });
    if (subscription.plan_id !== trialPlan.id || subscription.status !== "trialing") {
      return NextResponse.json({ error: "O teste grátis desta conta já foi iniciado." }, { status: 409 });
    }

    const consentTypes = requiredConsents.map((consent) => consent.document_type);
    const { data: existingConsents, error: consentLookupError } = await admin
      .from("user_consents")
      .select("document_type")
      .eq("user_id", userData.user.id)
      .in("document_type", consentTypes);

    if (consentLookupError) throw consentLookupError;

    const existingTypes = new Set((existingConsents ?? []).map((consent) => consent.document_type));
    const missingConsents = requiredConsents
      .filter((consent) => !existingTypes.has(consent.document_type))
      .map((consent) => ({
        user_id: userData.user.id,
        document_type: consent.document_type,
        document_version: consent.document_version,
        accepted_at: new Date().toISOString(),
      }));

    if (missingConsents.length > 0) {
      const { error: consentInsertError } = await admin
        .from("user_consents")
        .insert(missingConsents);

      if (consentInsertError) throw consentInsertError;
    }

    return NextResponse.json({ planCode: "trial", workspaceId: workspace.id, subscriptionId: subscription.id });
  } catch (error) {
    console.error("Account setup failed", error);
    return NextResponse.json({ error: "Não foi possível salvar sua escolha agora." }, { status: 500 });
  }
}
