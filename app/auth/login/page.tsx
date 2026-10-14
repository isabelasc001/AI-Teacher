import LoginScreen from "@/components/login-screen";
import { hasEnvVars } from "@/lib/utils";
import { Suspense } from "react";

async function LoginPageContent({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const params = await searchParams;

  return (
    <LoginScreen
      supabaseConfigured={Boolean(hasEnvVars)}
      accountCreated={params.registered === "1"}
    />
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  return (
    <Suspense fallback={<LoginScreen supabaseConfigured={Boolean(hasEnvVars)} />}>
      <LoginPageContent searchParams={searchParams} />
    </Suspense>
  );
}
