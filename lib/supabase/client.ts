import { createBrowserClient, type CookieMethodsBrowser } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

const SESSION_PREFERENCE_COOKIE = "fast-class-remember-session";
const PERSISTENT_SESSION_MAX_AGE = 400 * 24 * 60 * 60;

type ClientOptions = {
  rememberSession?: boolean;
};

const browserClients = new Map<boolean, SupabaseClient>();

function getCookieValue(name: string) {
  if (typeof document === "undefined") return null;

  const cookie = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function setCookieValue(name: string, value: string, rememberSession: boolean) {
  if (typeof document === "undefined") return;

  const attributes = ["Path=/", "SameSite=Lax"];
  if (rememberSession) attributes.push(`Max-Age=${PERSISTENT_SESSION_MAX_AGE}`);
  document.cookie = `${name}=${encodeURIComponent(value)}; ${attributes.join("; ")}`;
}

function readRememberPreference() {
  return getCookieValue(SESSION_PREFERENCE_COOKIE) !== "0";
}

function createCookieStorage(rememberSession: boolean): CookieMethodsBrowser {
  return {
    getAll() {
      if (typeof document === "undefined" || !document.cookie) return [];

      return document.cookie.split("; ").map((entry) => {
        const separator = entry.indexOf("=");
        const name = separator === -1 ? entry : entry.slice(0, separator);
        const value = separator === -1 ? "" : entry.slice(separator + 1);

        return {
          name: decodeURIComponent(name),
          value: decodeURIComponent(value),
        };
      });
    },
    setAll(cookiesToSet) {
      if (typeof document === "undefined") return;

      cookiesToSet.forEach(({ name, value, options }) => {
        const attributes = [`Path=${options.path ?? "/"}`, "SameSite=Lax"];

        if (options.domain) attributes.push(`Domain=${options.domain}`);
        if (options.secure) attributes.push("Secure");
        if (options.maxAge === 0) {
          attributes.push("Max-Age=0");
        } else if (rememberSession) {
          attributes.push(`Max-Age=${PERSISTENT_SESSION_MAX_AGE}`);
        }

        document.cookie = `${name}=${encodeURIComponent(value)}; ${attributes.join("; ")}`;
      });
    },
  };
}

export function createClient({ rememberSession }: ClientOptions = {}) {
  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv();
  const shouldRemember = rememberSession ?? readRememberPreference();

  if (rememberSession !== undefined) {
    setCookieValue(SESSION_PREFERENCE_COOKIE, shouldRemember ? "1" : "0", shouldRemember);
  }

  const existingClient = browserClients.get(shouldRemember);
  if (existingClient) return existingClient;

  const client = createBrowserClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      // SSR requires the current session to remain available in cookies. The
      // checkbox controls the cookie lifetime through the custom storage.
      persistSession: true,
    },
    cookies: createCookieStorage(shouldRemember),
    isSingleton: false,
  });

  browserClients.set(shouldRemember, client);
  return client;
}
