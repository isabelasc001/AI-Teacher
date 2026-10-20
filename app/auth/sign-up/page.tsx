import CreateAccountScreen from "@/components/create-account-screen";
import { hasEnvVars } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Teacher | Criar conta",
  description: "Crie seu workspace pessoal para planejar aulas com apoio da IA.",
};

export default function Page() {
  return <CreateAccountScreen supabaseConfigured={Boolean(hasEnvVars)} />;
}
