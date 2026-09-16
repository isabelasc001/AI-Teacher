import AccountTypeScreen from "@/components/account-type-screen";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Gerador de Aulas | Escolha seu plano",
  description: "Escolha a melhor forma de começar seu workspace.",
};

export default async function AccountTypePage() {
  if (hasEnvVars) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims) {
      redirect("/auth/login");
    }
  }

  return <AccountTypeScreen />;
}
