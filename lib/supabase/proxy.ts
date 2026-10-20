import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAnonymousSupabaseUser } from "./auth";
import { getSupabaseEnv, hasEnvVars } from "./env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Stripe signs the raw request body and does not send a Supabase session
  // cookie. Keep this endpoint public so the webhook can reach its own
  // signature verification and admin-only processing.
  if (request.nextUrl.pathname === "/api/stripe/webhook") {
    return supabaseResponse;
  }

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv();

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  const pathname = request.nextUrl.pathname;
  const isAnonymousUser = isAnonymousSupabaseUser(user);
  const isPublicAuthRoute = pathname === "/auth"
    || pathname.startsWith("/auth/login")
    || pathname.startsWith("/auth/signin")
    || pathname.startsWith("/auth/sign-up")
    || pathname.startsWith("/auth/forgot-password")
    || pathname.startsWith("/auth/confirm")
    || pathname.startsWith("/auth/error");

  if (isAnonymousUser && !isPublicAuthRoute) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Entre com e-mail e senha ou com o Google para continuar." }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = "?reason=account-required";
    return NextResponse.redirect(url);
  }

  if (
    pathname !== "/" &&
    !user &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/auth")
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
