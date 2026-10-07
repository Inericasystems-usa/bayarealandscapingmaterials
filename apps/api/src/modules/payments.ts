import { Router } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { requirePermission } from "../lib/auth.js";

/**
 * Payments behind a provider-agnostic adapter. The MockProvider stands in for
 * Stripe Terminal during development (see pos-build-plan.md §0): the register
 * captures a payment here, then records the sale. Swapping in Stripe later only
 * changes the provider implementation, not the route or the register.
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
}

export const payments = new Collection<Payment>("payments");

interface ProviderResult {
  status: PaymentStatus;
  reference: string;
  provider: string;
}

/** Mock card/terminal provider — approves any positive amount. */
function mockProvider(amount: number, method: string): ProviderResult {
  const ok = amount > 0;
  return {
    status: ok ? "succeeded" : "failed",
    reference: `${method === "cash" ? "cash" : "mock"}_${newId("ref").slice(4)}`,
    provider: method === "cash" ? "cash" : "stripe_mock",
  };
}

const router = Router();
// Reading the payment ledger = reports; capturing a payment = register.
router.use((req, res, next) => {
  const key = req.method === "GET" ? "reports" : "register";
  if (!requirePermission(req, res, key)) return; // 401/403 already sent
  next();
});
router.get("/", async (_req, res) => {
  const list = await payments.all();
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ data: list });
});

  // Capture a payment. The register calls this before recording the sale.
  // Two modes:
  //  • No `reference` → the MockProvider approves (dev/Stripe-mock path).
  //  • `reference` present → the payment was already authorized on a physical
  //    terminal (Ingenico/Elavon via the bridge); we just record the result.
router.post("/", async (req, res) => {
  const parsed = z
    .object({
      amount: z.number().positive(),
      method: z.enum(["terminal", "card", "cash", "account"]).default("terminal"),
      saleId: z.string().nullable().default(null),
      // Externally-authorized terminal result (optional).
      reference: z.string().optional(),
      provider: z.string().optional(),
      status: z.enum(["succeeded", "failed"]).optional(),
      authCode: z.string().optional(),
      cardBrand: z.string().optional(),
      last4: z.string().optional(),
      entryMode: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const d = parsed.data;

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
  });
  if (result.status === "failed")
    return res.status(402).json({ error: { code: "payment_failed", message: "Card declined." }, data: payment });
  return res.status(201).json({ data: payment });
});

export default router;
