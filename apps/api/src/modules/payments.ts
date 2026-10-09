import { Router } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { requirePermission } from "../lib/auth.js";
import { isDev } from "../config.js";
import { containsPanAnywhere } from "../lib/pan-guard.js";
import { acceptSignedResult } from "../lib/terminal-signature.js";
import { orders } from "./orders.js";

/**
 * Payments behind a provider-agnostic adapter. The MockProvider stands in for
 * Stripe Terminal during development (see pos-build-plan.md §0): the register
 * captures a payment here, then records the sale. Swapping in Stripe later only
 * changes the provider implementation, not the route or the register.
 *
 * Outside development a card payment is only ever recorded from a real terminal
 * result: no mock approval, no simulated terminal or provider, and only with
 * the counter-PC bridge's signature over the sale, amount and result
 * (lib/terminal-signature.ts), so the browser can't claim an approval itself.
 */
export type PaymentStatus = "succeeded" | "failed";

export interface Payment extends Entity {
  amount: number;
  method: string; // "terminal" | "card" | "cash"
  provider: string;
  status: PaymentStatus;
  reference: string;
  saleId: string | null;
  // Card-present detail captured from a physical terminal (Ingenico/Elavon).
  // No PAN is ever stored — only the masked last 4 and non-sensitive metadata.
  authCode?: string;
  cardBrand?: string;
  last4?: string;
  entryMode?: string; // CHIP | CONTACTLESS | SWIPE | KEYED
  deviceId?: string; // the paired bridge that signed the terminal result
}

export const payments = new Collection<Payment>("payments");

interface ProviderResult {
  status: PaymentStatus;
  reference: string;
  provider: string;
}

/**
 * Cash and on-account tenders need no processor. A card/terminal tender with no
 * terminal result only gets here in development, where the mock approves any
 * positive amount.
 */
function mockProvider(amount: number, method: string): ProviderResult {
  const local = method === "cash" || method === "account";
  const ok = amount > 0;
  return {
    status: ok ? "succeeded" : "failed",
    reference: `${local ? method : "mock"}_${newId("ref").slice(4)}`,
    provider: local ? method : "stripe_mock",
  };
}

// "sim", "elavon_sim", "stripe_mock", "sim_ab12cd34", …
const SIMULATED = /(?:^|_)(?:sim|mock|simulated)(?:_|$)/i;

// Terminal result fields in their real shapes, so a card number can't pass as
// a reference, auth code or last 4 (PCI DSS 3.3.1).
const terminalFields = {
  reference: z
    .string()
    .regex(/^[A-Za-z0-9+/=_.:-]{1,128}$/)
    .refine((s) => !containsPanAnywhere(s), "Card numbers are never stored.")
    .optional(),
  provider: z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/).optional(),
  status: z.enum(["succeeded", "failed"]).optional(),
  authCode: z.string().regex(/^[A-Za-z0-9 ]{1,16}$/).optional(),
  cardBrand: z.string().regex(/^[A-Za-z0-9 /&.-]{1,24}$/).optional(),
  last4: z.string().regex(/^\d{4}$/).optional(),
  entryMode: z.string().regex(/^[A-Za-z_ -]{1,24}$/).optional(),
  // The bridge's HMAC over the result (apps/bridge/signing.js), relayed as is.
  signature: z
    .object({
      deviceId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
      ts: z.number().int().positive(),
      sig: z.string().regex(/^[0-9a-f]{64}$/),
      currency: z.string().regex(/^[a-z]{3}$/).default("usd"),
    })
    .optional(),
};

const CENT = 0.01;

const router = Router();
// Reading the payment ledger = reports; capturing a payment = register.
router.use((req, res, next) => {
  const key = req.method === "GET" ? "reports" : "register";
  if (!requirePermission(req, res, key)) return; // 401/403 already sent
  next();
});
router.get("/", async (_req, res) => {
  const list = await payments.where({}, { sort: { createdAt: -1, id: -1 } }); // the whole ledger, newest first
  return res.json({ data: list });
});

  // Capture a payment. The register calls this before recording the sale.
  // Two modes:
  //  • No `reference` → cash/account, or in development a mock card approval.
  //  • `reference` present → the payment was already authorized on a physical
  //    terminal (Ingenico/Elavon via the bridge); we just record the result.
router.post("/", async (req, res) => {
  const parsed = z
    .object({
      amount: z.number().positive(),
      method: z.enum(["terminal", "card", "cash", "account"]).default("terminal"),
      saleId: z.string().nullable().default(null),
      // Externally-authorized terminal result (optional).
      ...terminalFields,
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const d = parsed.data;

  if ((d.method === "card" || d.method === "terminal") && !isDev) {
    // Card-reader (Stripe) payments are recorded by the capture route from
    // Stripe's own result (modules/terminal.ts); a browser can't claim one here.
    if (d.method === "card")
      return res.status(409).json({ error: { code: "use_card_reader", message: "Card-reader payments are recorded when the reader captures them." } });
    if (!d.reference)
      return res.status(409).json({ error: { code: "no_terminal_result", message: "Card payments must come from the card terminal." } });
    if (SIMULATED.test(d.provider ?? "") || SIMULATED.test(d.reference))
      return res.status(409).json({
        error: { code: "simulated_payment", message: "The terminal is in simulated mode, so no card was charged. Set it to live." },
      });
  }

  // A terminal result is recorded only with the bridge's signature over this
  // sale, amount and outcome, once, within five minutes. Development accepts
  // an unsigned one from an unpaired bridge; a signature sent is always checked.
  if (d.method === "terminal" && d.reference && (d.signature || !isDev)) {
    if (!d.signature)
      return res.status(409).json({
        error: { code: "unsigned_terminal_result", message: "This card result isn't signed by a paired terminal bridge. Pair the bridge (apps/bridge/README.md)." },
      });
    if (!d.saleId || !d.status)
      return res.status(400).json({ error: { code: "invalid", message: "A terminal result needs its saleId and status." } });
    const order = await orders.find(d.saleId);
    if (!order) return res.status(409).json({ error: { code: "unknown_sale", message: "This card result is for a sale the store has no record of." } });
    if (Math.abs(order.total - d.amount) > CENT)
      return res.status(400).json({ error: { code: "amount_mismatch", message: "Amount does not match the order total." } });
    const accepted = await acceptSignedResult(
      {
        deviceId: d.signature.deviceId,
        saleId: d.saleId,
        amountCents: Math.round(d.amount * 100),
        currency: d.signature.currency,
        reference: d.reference,
        status: d.status,
        authCode: d.authCode,
        last4: d.last4,
        cardBrand: d.cardBrand,
        entryMode: d.entryMode,
        ts: d.signature.ts,
      },
      d.signature.sig,
    );
    if ("refused" in accepted) return res.status(409).json({ error: accepted.refused });
  }

  // External terminal result vs mock provider.
  const result: ProviderResult = d.reference
    ? { status: d.status ?? "succeeded", reference: d.reference, provider: d.provider ?? "elavon_terminal" }
    : mockProvider(d.amount, d.method);

  const payment = await payments.insert({
    id: newId("pay"),
    amount: Math.round(d.amount * 100) / 100,
    method: d.method,
    provider: result.provider,
    status: result.status,
    reference: result.reference,
    saleId: d.saleId,
    ...(d.authCode ? { authCode: d.authCode } : {}),
    ...(d.cardBrand ? { cardBrand: d.cardBrand } : {}),
    ...(d.last4 ? { last4: d.last4 } : {}),
    ...(d.entryMode ? { entryMode: d.entryMode } : {}),
    ...(d.signature ? { deviceId: d.signature.deviceId } : {}),
  });
  if (result.status === "failed")
    return res.status(402).json({ error: { code: "payment_failed", message: "Card declined." }, data: payment });
  return res.status(201).json({ data: payment });
});

export default router;
