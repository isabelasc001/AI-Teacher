import LoginScreen from "@/components/login-screen";
import { hasEnvVars } from "@/lib/utils";
import { Suspense } from "react";

async function LoginPageContent({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; reason?: string }>;
}) {
  const params = await searchParams;

  return (
    <LoginScreen
      supabaseConfigured={Boolean(hasEnvVars)}
      accountCreated={params.registered === "1"}
      authenticationRequired={params.reason === "account-required"}
    />
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; reason?: string }>;
}) {
  return (
    <Suspense fallback={<LoginScreen supabaseConfigured={Boolean(hasEnvVars)} />}>
      <LoginPageContent searchParams={searchParams} />
    </Suspense>
  );
}
