const PLACEHOLDER_VALUES = new Set([
  "your-supabase-project-url",
  "your-supabase-publishable-key",
  "supabase_project_url",
  "supabase_publishable_key",
]);

function readPublicEnv(value: string | undefined) {
  const normalizedValue = value?.trim() ?? "";
  return PLACEHOLDER_VALUES.has(normalizedValue) ? "" : normalizedValue;
}

// Keep these property accesses static so Next.js inlines NEXT_PUBLIC_* values
// into the browser bundle as well as the server bundle.
export const supabaseUrl = readPublicEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabasePublishableKey = readPublicEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export const hasEnvVars = Boolean(
  supabaseUrl &&
    supabasePublishableKey &&
    /^https?:\/\//.test(supabaseUrl),
);

export function getSupabaseEnv() {
  if (!hasEnvVars) {
    throw new Error(
      "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local.",
    );
  }

  return {
    supabaseUrl,
    supabasePublishableKey,
  };
}
