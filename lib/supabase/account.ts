export type AccountPlanCode = "trial" | "fast" | "full";

/**
 * Persists onboarding choices through a server-authoritative route so a
 * browser cannot mark a paid plan active without going through Stripe.
 */
export async function saveAccountSetup(planCode: AccountPlanCode) {
  const response = await fetch("/api/account/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planCode }),
  });
  const body = await response.json().catch(() => null) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Não foi possível salvar sua escolha agora.");
  }

  return body;
}
