import { createClient } from "@/lib/supabase/server";
import { isAnonymousSupabaseUser } from "@/lib/supabase/auth";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash") ?? searchParams.get("token");
  const code = searchParams.get("code");
  const type = searchParams.get("type") as EmailOtpType | null;
  const requestedNext = searchParams.get("next");
  const flow = searchParams.get("flow") === "signup" ? "signup" : "login";
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/auth/select-account-type";

  if ((token_hash && type) || code) {
    const supabase = await createClient();
    const { error } = token_hash && type
      ? await supabase.auth.verifyOtp({ type, token_hash })
      : await supabase.auth.exchangeCodeForSession(code!);

    if (!error) {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user || isAnonymousSupabaseUser(userData.user)) {
        redirect(`/auth/error?error=${encodeURIComponent(userError?.message ?? "Não foi possível recuperar a sessão")}`);
      }

      const user = userData.user;

      // Google does not provide a local password. A user who enters through
      // either Google button still needs the regular onboarding once, and then
      // gets a small profile form for fields Google cannot supply.
      if (
        user.app_metadata?.provider === "google" &&
        ((flow === "login" && next === "/protected") ||
          (flow === "signup" && next === "/auth/select-account-type"))
      ) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("profile_completed_at")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) {
          // Keep OAuth usable if the profile migration has not been applied
          // yet. The deployment checklist documents that migration below.
          console.error("Could not inspect Google profile completion", profileError);
        } else if (profile?.profile_completed_at) {
          // Clicking "Criar conta com Google" for an existing completed
          // account should behave like login instead of reopening onboarding.
          if (flow === "signup") redirect("/protected");
        } else {
          const { data: consents, error: consentsError } = await supabase
            .from("user_consents")
            .select("document_type")
            .eq("user_id", user.id)
            .in("document_type", ["terms_of_use", "privacy_policy"]);

          if (consentsError) {
            console.error("Could not inspect Google onboarding completion", consentsError);
          }

          const consentTypes = new Set((consents ?? []).map((consent) => consent.document_type));
          const onboardingComplete = !consentsError &&
            consentTypes.has("terms_of_use") &&
            consentTypes.has("privacy_policy");

          if (!onboardingComplete) redirect("/auth/select-account-type");

          const completionUrl = new URL("/auth/complete-profile", request.url);
          completionUrl.searchParams.set("next", "/protected");
          redirect(completionUrl.toString());
        }
      }

      redirect(next);
    } else {
      redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
    }
  }

  redirect(`/auth/error?error=${encodeURIComponent("No token hash, code or type")}`);
}
