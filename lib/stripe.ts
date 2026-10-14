import Stripe from "stripe";

export type PaidPlanCode = "fast" | "full";

let stripeClient: Stripe | null = null;

/**
 * Keep Stripe server-only and initialize it lazily so builds can run before
 * deployment secrets have been configured.
 */
export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  if (!/^(rk|sk)_(test|live)_/.test(secretKey)) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe restricted or secret key.");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, { maxNetworkRetries: 2 });
  }

  return stripeClient;
}

export function isPaidPlanCode(value: unknown): value is PaidPlanCode {
  return value === "fast" || value === "full";
}

export function getStripePriceId(planCode: PaidPlanCode) {
  const priceId = planCode === "fast"
    ? process.env.STRIPE_PRICE_FAST?.trim()
    : process.env.STRIPE_PRICE_FULL?.trim();

  return priceId?.startsWith("price_") ? priceId : null;
}

export function getPlanCodeForStripePrice(priceId: string | null | undefined): PaidPlanCode | null {
  if (!priceId) return null;

  if (priceId === process.env.STRIPE_PRICE_FAST?.trim()) return "fast";
  if (priceId === process.env.STRIPE_PRICE_FULL?.trim()) return "full";

  return null;
}

export function isAutomaticTaxEnabled() {
  return process.env.STRIPE_AUTOMATIC_TAX_ENABLED?.trim().toLowerCase() === "true";
}

export function getAppUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  return "http://localhost:3000";
}

export function createCheckoutIntegrationIdentifier(seed: string) {
  let hash = 2166136261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  const suffix = (hash >>> 0).toString(36).padStart(8, "0").slice(-8);
  return `aiteacher_checkout_${suffix}`;
}
