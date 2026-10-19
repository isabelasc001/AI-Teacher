import AccountTypeScreen from "@/components/account-type-screen";
import { ACCOUNT_PLAN_CODES, normalizeActivePlans, type AccountPlan } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Gerador de Aulas | Escolha seu plano",
  description: "Escolha a melhor forma de começar seu workspace.",
};

async function AccountTypeContent() {
  let plans: AccountPlan[] = [];
  let plansError = hasEnvVars
    ? ""
    : "Configure as variáveis do Supabase em .env.local para carregar os planos.";

  if (hasEnvVars) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims) {
      redirect("/auth/login");
    }

    const { data: activePlans, error: activePlansError } = await supabase
      .from("plans")
      .select("code, name, description, lesson_limit, question_bank_limit")
      .in("code", ACCOUNT_PLAN_CODES)
      .eq("is_active", true)
      .order("code");

    if (activePlansError) {
      plans = [];
      plansError = "Não foi possível carregar os planos disponíveis.";
    } else {
      plans = normalizeActivePlans(activePlans).filter((plan) => plan.code === "trial");
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

export default function SelectAccountTypePage() {
  return (
    <Suspense fallback={null}>
      <AccountTypeContent />
    </Suspense>
  );
}
