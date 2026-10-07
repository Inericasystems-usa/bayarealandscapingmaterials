import Stripe from "stripe";
import { config } from "../config.js";

/**
 * Lazily-constructed Stripe client. When STRIPE_SECRET_KEY is present the
 * Terminal endpoints make real Stripe API calls; otherwise the API runs in
 * "simulated" mode (deterministic fake IDs) so the register works in dev with
 * no account or hardware. Flipping to live is purely an env-var change.
 */
let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(config.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  if (!config.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  if (!client) client = new Stripe(config.STRIPE_SECRET_KEY);
  return client;
}

export function stripeMode(): "live" | "simulated" {
  return isStripeConfigured() ? "live" : "simulated";
}
