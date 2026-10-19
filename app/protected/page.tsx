import { FastClassWorkspace, type WorkspaceProfile } from "@/components/fast-class-workspace";
import { isAccountPlanCode } from "@/lib/plans";
import { getWorkspacePlan, type WorkspacePlan } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import { redirect } from "next/navigation";
import { Suspense } from "react";

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

async function getWorkspaceProfile(): Promise<WorkspaceProfile> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login");
  }

  const metadata = data.user.user_metadata;
  const { data: savedProfile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, phone, provider_type, profile_completed_at")
    .eq("user_id", data.user.id)
    .maybeSingle();

  const metadataDisplayName =
    typeof metadata?.display_name === "string" && metadata.display_name.trim()
      ? metadata.display_name.trim()
      : typeof metadata?.full_name === "string" && metadata.full_name.trim()
        ? metadata.full_name.trim()
        : typeof metadata?.name === "string" && metadata.name.trim()
          ? metadata.name.trim()
          : "";
  const displayName = savedProfile?.display_name?.trim() || metadataDisplayName || data.user.email?.split("@")[0] || "Professor(a)";
  const phone =
    typeof savedProfile?.phone === "string"
      ? savedProfile.phone
      : typeof metadata?.phone === "string"
        ? metadata.phone
        : "";
  const providerType: WorkspaceProfile["providerType"] = savedProfile?.provider_type === "google" || data.user.app_metadata?.provider === "google"
    ? "google"
    : "email_password";

  if (!profileError && providerType === "google" && !savedProfile?.profile_completed_at) {
    const { data: consents, error: consentsError } = await supabase
      .from("user_consents")
      .select("document_type")
      .eq("user_id", data.user.id)
      .in("document_type", ["terms_of_use", "privacy_policy"]);
    const consentTypes = new Set((consents ?? []).map((consent) => consent.document_type));

    if (!consentsError && (!consentTypes.has("terms_of_use") || !consentTypes.has("privacy_policy"))) {
      redirect("/auth/select-account-type");
    }

    redirect("/auth/complete-profile?next=/protected");
  }

  const role =
    typeof metadata?.role === "string" && metadata.role.trim()
      ? metadata.role.trim()
      : "Professor(a)";

  let accountPlanCode: WorkspaceProfile["accountPlanCode"] = "trial";
  let planCode: WorkspacePlan = "fast";
  let planName = "Teste grátis";
  let lessonLimit = 3;
  let questionUsage = 0;
  let questionBankLimit = 0;
  let lessonUsage = 0;
  let canManageBilling = false;
  let usePortalForPlanChanges = false;
  let canUseQuestionBank = false;
  let canCreateLessons = false;
  let subscriptionRequired = true;

  // Read entitlements on the server and fail closed when onboarding or billing
  // state is missing.
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", data.user.id)
    .maybeSingle();

  if (workspace?.id) {
    const { data: subscription } = await supabase
      .from("workspace_subscriptions")
      .select("plan_id, status, stripe_customer_id, stripe_subscription_id, current_period_start, starts_at")
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (subscription?.plan_id) {
      canManageBilling = typeof subscription.stripe_customer_id === "string" && Boolean(subscription.stripe_customer_id);
      usePortalForPlanChanges = Boolean(subscription.stripe_subscription_id)
        && ["active", "trialing", "past_due", "incomplete", "unpaid", "paused"].includes(subscription.status);
      const { data: plan } = await supabase
        .from("plans")
        .select("code, name, lesson_limit, question_bank_limit")
        .eq("id", subscription.plan_id)
        .eq("is_active", true)
        .maybeSingle();

      if (plan && isAccountPlanCode(plan.code)) {
        accountPlanCode = plan.code;
        planCode = getWorkspacePlan(plan.code);
        planName = typeof plan.name === "string" && plan.name.trim() ? plan.name : planName;
        lessonLimit = typeof plan.lesson_limit === "number" && plan.lesson_limit > 0 ? plan.lesson_limit : plan.code === "trial" ? 3 : plan.code === "full" ? 30 : 20;
        questionBankLimit = typeof plan.question_bank_limit === "number"
          ? plan.question_bank_limit
          : lessonLimit;

        const lessonCount = plan.code === "trial"
          ? await supabase
            .from("lessons")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspace.id)
          : await supabase
            .from("lessons")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspace.id)
            .gte("created_at", subscription.current_period_start ?? subscription.starts_at);

        if (lessonCount.error) throw lessonCount.error;
        lessonUsage = lessonCount.count ?? 0;

        const questionSetCount = plan.code === "trial"
          ? await supabase
            .from("question_sets")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspace.id)
          : await supabase
            .from("question_sets")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspace.id)
            .gte("created_at", subscription.current_period_start ?? subscription.starts_at);

        if (questionSetCount.error) throw questionSetCount.error;
        questionUsage = questionSetCount.count ?? 0;

        const isActiveTrial = plan.code === "trial" && subscription.status === "trialing";
        const isActivePaidPlan = (plan.code === "fast" || plan.code === "full") && subscription.status === "active";
        const hasActiveEntitlement = isActiveTrial || isActivePaidPlan;
        canUseQuestionBank = hasActiveEntitlement;
        canCreateLessons = hasActiveEntitlement
          && lessonUsage < lessonLimit
          && questionUsage < questionBankLimit;
        subscriptionRequired = !hasActiveEntitlement || (isActiveTrial && (
          lessonUsage >= lessonLimit || questionUsage >= questionBankLimit
        ));
      }
    }
  }

  return {
    userId: data.user.id,
    displayName,
    email: data.user.email ?? "",
    phone,
    providerType,
    initials: getInitials(displayName),
    role,
    planName,
    accountPlanCode,
    planCode,
    canManageBilling,
    usePortalForPlanChanges,
    subscriptionRequired,
    canCreateLessons,
    canUseQuestionBank,
    lessonUsage,
    lessonLimit,
    questionUsage,
    questionBankLimit,
  };
}

async function ProtectedWorkspace() {
  const profile = await getWorkspaceProfile();

  return <FastClassWorkspace profile={profile} />;
}

function WorkspaceLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-fast-bg px-6 text-center text-fast-text-muted">
      Carregando seu workspace…
    </main>
  );
}

export default function ProtectedPage() {
  if (!hasEnvVars) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-fast-bg px-6 text-center text-fast-text-muted">
        Configure as variáveis do Supabase em .env.local para acessar seu workspace.
      </main>
    );
  }

  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <ProtectedWorkspace />
    </Suspense>
  );
}
