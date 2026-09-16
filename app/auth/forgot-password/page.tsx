import { ForgotPasswordForm } from "@/components/forgot-password-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gerador de Aulas | Recuperar conta",
  description: "Recupere o acesso à sua conta do Gerador de Aulas.",
};

export default function Page() {
  return <ForgotPasswordForm />;
}
