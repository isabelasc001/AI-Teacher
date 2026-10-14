import CompleteProfileScreen from "@/components/complete-profile-screen";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Gerador de Aulas | Complete seu perfil",
  description: "Finalize os dados do seu workspace conectado ao Google.",
};

function safeNext(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/protected";
}

async function CompleteProfileContent({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: requestedNext } = await searchParams;

  if (!hasEnvVars) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-fast-bg px-6 text-center text-fast-text-muted">
        Configure as variáveis do Supabase em .env.local para continuar.
      </main>
    );
  }

  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();

  if (error || !userData.user) redirect("/auth/login");

  const user = userData.user;

  const metadata = user.user_metadata;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, full_name, phone")
    .eq("user_id", user.id)
    .maybeSingle();

  const displayName =
    (typeof profile?.display_name === "string" && profile.display_name.trim() ? profile.display_name : "") ||
    (typeof metadata?.display_name === "string" && metadata.display_name.trim() ? metadata.display_name : "") ||
    (typeof metadata?.full_name === "string" && metadata.full_name.trim() ? metadata.full_name : "") ||
    (typeof metadata?.name === "string" && metadata.name.trim() ? metadata.name : "") ||
    user.email?.split("@")[0] ||
    "Professor(a)";
  const phone = typeof profile?.phone === "string" ? profile.phone : typeof metadata?.phone === "string" ? metadata.phone : "";
  const role = typeof metadata?.role === "string" ? metadata.role : "";

  return (
    <CompleteProfileScreen
      userId={user.id}
      email={user.email ?? ""}
      displayName={displayName}
      phone={phone}
      role={role}
      next={safeNext(requestedNext)}
    />
  );
}

export default function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <CompleteProfileContent searchParams={searchParams} />
    </Suspense>
  );
}
