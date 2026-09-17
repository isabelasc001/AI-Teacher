import AccountTypeScreen from "@/components/account-type-screen";
import { ACCOUNT_PLAN_CODES, FALLBACK_PLANS, normalizeActivePlans } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Gerador de Aulas | Escolha seu plano",
  description: "Escolha a melhor forma de começar seu workspace.",
};

export default async function AccountTypePage() {
  let plans = FALLBACK_PLANS;
  let plansError = "";

  if (hasEnvVars) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims) {
      redirect("/auth/login");
    }

    const { data: activePlans, error: activePlansError } = await supabase
      .from("plans")
      .select("code, name, description, lesson_limit")
      .in("code", ACCOUNT_PLAN_CODES)
      .eq("is_active", true)
      .order("code");

    if (activePlansError) {
      plans = [];
      plansError = "Não foi possível carregar os planos disponíveis.";
    } else {
      plans = normalizeActivePlans(activePlans);
      if (plans.length === 0) {
        plansError = "Nenhum plano está disponível no momento.";
      }
    }
  }

  return (
    <AccountTypeScreen
      plans={plans}
      plansError={plansError}
      supabaseConfigured={Boolean(hasEnvVars)}
    />
  );
}
