import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { stripe, isStripeConfigured, stripeMode } from "../lib/stripe.js";
import { newId } from "../lib/store.js";
import { payments } from "./payments.js";
import { orders } from "./orders.js";
import { guardWrites } from "../lib/auth.js";

const CENT = 0.01;

/**
 * Stripe Terminal — the real card-present flow:
 *   1. client gets a connection token to init the Terminal SDK + reader
 *   2. POST a PaymentIntent (manual capture) for the amount
 *   3. reader collects the card; client confirms; server captures
 *
 * With no STRIPE_SECRET_KEY this returns deterministic simulated objects so the
 * register works end-to-end in dev. Set the key (+ reader) and it goes live.
 */

const toCents = (dollars: number) => Math.round(dollars * 100);

const router = Router();
router.use(guardWrites("register")); // taking card payments = register access
router.get("/status", async (_req, res) =>
  res.json({
    data: {
      configured: isStripeConfigured(),
      mode: stripeMode(),
      publishableKey: config.STRIPE_PUBLISHABLE_KEY ?? null,
      location: config.STRIPE_TERMINAL_LOCATION ?? null,
    },
  }),
);

// Connection token for the Terminal SDK on the client.
router.post("/connection-token", async (req, res) => {
  if (!isStripeConfigured()) {
    return res.json({ data: { secret: `simulated_pst_${newId("ct").slice(3)}`, simulated: true } });
  }
  try {
    const ct = await stripe().terminal.connectionTokens.create(
      config.STRIPE_TERMINAL_LOCATION ? { location: config.STRIPE_TERMINAL_LOCATION } : {},
    );
    return res.json({ data: { secret: ct.secret, simulated: false } });
  } catch (err) {
    req.log.error({ err }, "stripe connection token failed");
    return res.json({ data: { secret: `simulated_pst_${newId("ct").slice(3)}`, simulated: true } });
  }
});

// Create a card-present PaymentIntent (manual capture).
router.post("/payment-intents", async (req, res) => {
  const parsed = z
    .object({ amount: z.number().positive(), currency: z.string().default("usd"), orderId: z.string().nullable().default(null) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });

  // Integrity: the charged amount must match the referenced order's total.
  if (parsed.data.orderId) {
    const order = await orders.find(parsed.data.orderId);
    if (order && Math.abs(order.total - parsed.data.amount) > CENT)
      return res.status(400).json({ error: { code: "amount_mismatch", message: "Amount does not match the order total." } });
  }

  if (!isStripeConfigured()) {
    const id = `pi_sim_${newId("pi").slice(3)}`;
    return res.json({ data: { id, clientSecret: `${id}_secret_sim`, status: "requires_capture", amount: toCents(parsed.data.amount), simulated: true } });
  }
  try {
    const pi = await stripe().paymentIntents.create(
      {
        amount: toCents(parsed.data.amount),
        currency: parsed.data.currency,
        payment_method_types: ["card_present"],
        capture_method: "manual",
        ...(parsed.data.orderId ? { metadata: { orderId: parsed.data.orderId } } : {}),
      },
      // Idempotency: retries for the same order won't create duplicate intents.
      parsed.data.orderId ? { idempotencyKey: `pi_create_${parsed.data.orderId}` } : undefined,
    );
    return res.json({ data: { id: pi.id, clientSecret: pi.client_secret, status: pi.status, amount: pi.amount, simulated: false } });
  } catch (err) {
    req.log.error({ err }, "stripe payment intent failed");
    return res.status(502).json({ error: { code: "stripe_error", message: "Could not create payment intent." } });
  }
});

// Capture a previously-confirmed PaymentIntent, and record the payment.
router.post("/payment-intents/:id/capture", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = z.object({ amount: z.number().positive(), orderId: z.string().nullable().default(null) }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: "amount is required" } });
  const orderId = parsed.data.orderId;

  // Integrity: never record a payment for a client-claimed amount that doesn't
  // match the order it's paying. The ledger must reconcile to real orders.
  if (orderId) {
    const order = await orders.find(orderId);
    if (order && Math.abs(order.total - parsed.data.amount) > CENT)
      return res.status(400).json({ error: { code: "amount_mismatch", message: "Amount does not match the order total." } });
  }

  // The recorded amount is what was ACTUALLY captured, not what the client sent.
  const record = async (status: "succeeded" | "failed", ref: string, capturedAmount: number) =>
    payments.insert({
      id: newId("pay"),
      amount: Math.round(capturedAmount * 100) / 100,
      method: "card",
      provider: isStripeConfigured() ? "stripe" : "stripe_mock",
      status,
      reference: ref,
      saleId: orderId,
    });

  if (!isStripeConfigured()) {
    await record("succeeded", id, parsed.data.amount);
    return res.json({ data: { id, status: "succeeded", simulated: true } });
  }
  try {
    const pi = await stripe().paymentIntents.capture(id);
    // Source of truth is Stripe's captured amount (cents → dollars), not the body.
    const captured = (pi.amount_received ?? pi.amount ?? 0) / 100;
    await record(pi.status === "succeeded" ? "succeeded" : "failed", pi.id, captured || parsed.data.amount);
    return res.json({ data: { id: pi.id, status: pi.status, amountCaptured: captured, simulated: false } });
  } catch (err) {
    req.log.error({ err }, "stripe capture failed");
    return res.status(502).json({ error: { code: "stripe_error", message: "Capture failed." } });
  }
});

export default router;
