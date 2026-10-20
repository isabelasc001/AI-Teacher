export type GoogleAuthFlow = "login" | "signup";

type SupabaseAuthIdentity = {
  is_anonymous?: boolean | null;
  app_metadata?: {
    provider?: string | null;
  } | null;
} | null | undefined;

/** Anonymous Supabase sessions have the authenticated database role too. */
export function isAnonymousSupabaseUser(identity: SupabaseAuthIdentity) {
  return identity?.is_anonymous === true
    || identity?.app_metadata?.provider === "anonymous";
}

/**
 * Builds the application callback used by Supabase's PKCE OAuth flow.
 * Keeping the destination in a query parameter lets the same callback serve
 * email confirmation, password recovery, Google login, and Google signup.
 */
export function getAuthCallbackUrl(
  origin: string,
  next: string,
  flow?: GoogleAuthFlow,
) {
  const callbackUrl = new URL("/auth/confirm", origin);
  callbackUrl.searchParams.set("next", next);

  if (flow) {
    callbackUrl.searchParams.set("flow", flow);
  }

  return callbackUrl.toString();
}
