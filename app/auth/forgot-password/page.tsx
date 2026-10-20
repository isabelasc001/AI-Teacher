import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { hasEnvVars } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Teacher | Recuperar conta",
  description: "Recupere o acesso à sua conta do Gerador de Aulas.",
};

export default function Page() {
  return <ForgotPasswordForm supabaseConfigured={Boolean(hasEnvVars)} />;
}
