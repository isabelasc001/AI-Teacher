import { createClient } from "@/lib/supabase/client";

export type AccountPlanCode = "trial" | "fast" | "full";

const requiredConsents = [
  { document_type: "terms_of_use", document_version: "v1" },
  { document_type: "privacy_policy", document_version: "v1" },
] as const;

/**
 * Persists the onboarding choices in the tables provisioned by the
 * `private.handle_new_user` trigger.
 */
export async function saveAccountSetup(planCode: AccountPlanCode) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Sua sessão expirou. Entre novamente para continuar.");

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id")
    .eq("code", planCode)
    .eq("is_active", true)
    .maybeSingle();

  if (planError) throw planError;
  if (!plan) throw new Error("O plano selecionado não está disponível.");

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (workspaceError) throw workspaceError;
  if (!workspace) throw new Error("Não encontramos o workspace da sua conta.");

  const subscriptionStatus = planCode === "trial" ? "trialing" : "active";
  const { data: subscription, error: subscriptionError } = await supabase
    .from("workspace_subscriptions")
    .update({
      plan_id: plan.id,
      status: subscriptionStatus,
      ends_at: null,
      canceled_at: null,
    })
    .eq("workspace_id", workspace.id)
    .select("id")
    .maybeSingle();

  if (subscriptionError) throw subscriptionError;
  if (!subscription) {
    throw new Error("Não encontramos a assinatura do workspace.");
  }

  const consentTypes = requiredConsents.map((consent) => consent.document_type);
  const { data: existingConsents, error: consentLookupError } = await supabase
    .from("user_consents")
    .select("document_type")
    .eq("user_id", user.id)
    .in("document_type", consentTypes);

  if (consentLookupError) throw consentLookupError;

  const existingTypes = new Set(
    (existingConsents ?? []).map((consent) => consent.document_type),
  );
  const missingConsents = requiredConsents
    .filter((consent) => !existingTypes.has(consent.document_type))
    .map((consent) => ({
      user_id: user.id,
      document_type: consent.document_type,
      document_version: consent.document_version,
      accepted_at: new Date().toISOString(),
    }));

  if (missingConsents.length > 0) {
    const { error: consentInsertError } = await supabase
      .from("user_consents")
      .insert(missingConsents);

    if (consentInsertError) throw consentInsertError;
  }

  return {
    planCode,
    workspaceId: workspace.id,
    subscriptionId: subscription.id,
  };
}
