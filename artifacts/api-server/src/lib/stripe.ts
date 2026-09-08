import Stripe from "stripe";

let stripeClient: Stripe | null = null;
let warnedMissingKey = false;

/**
 * Lazily-initialized Stripe client. Deliberately does NOT throw at import
 * time when STRIPE_SECRET_KEY is unset — the server should boot and every
 * non-payment feature should keep working right up until someone actually
 * tries to start a checkout, at which point isStripeConfigured()/getStripe()
 * give a clear, specific error instead of a vague startup crash.
 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "Stripe isn't connected yet — set STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET) to enable real payments."
    );
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-08-26.dahlia",
    });
  }
  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set — cannot verify Stripe webhook signatures.");
  }
  return secret;
}

/** Logs the missing-config situation once per process instead of on every request. */
export function warnStripeNotConfiguredOnce(): void {
  if (warnedMissingKey) return;
  warnedMissingKey = true;
  // eslint-disable-next-line no-console
  console.warn(
    "[stripe] STRIPE_SECRET_KEY is not set — tuition checkout will use the simulate-pay fallback until it's connected."
  );
}
