import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client for trusted Stripe webhook projections.
 * Never import this module from a Client Component.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Configure SUPABASE_SERVICE_ROLE_KEY for Stripe webhooks.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
