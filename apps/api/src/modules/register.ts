import { Router } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { orders } from "./orders.js";
import { getSettings } from "./settings.js";
import { guardWrites } from "../lib/auth.js";
import { recordAudit } from "./audit.js";

/**
 * Register (cash-drawer) sessions. A cashier opens the drawer with a starting
 * float, rings orders during the session, then closes by counting the cash.
 * Expected cash = float + cash sales; variance = counted − expected. Sales
 * totals are derived from orders tagged with this session id.
 */
export interface RegisterSession extends Entity {
  number: string;
  workstationId: string;
  userId: string;
  userName: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  cashSales: number;
  cardSales: number;
  accountSales: number;
  orderCount: number;
  expectedCash: number;
  countedCash: number;
  variance: number;
  note: string;
}

export const registerSessions = new Collection<RegisterSession>("register-sessions");

const round2 = (n: number) => Math.round(n * 100) / 100;

async function tallies(sessionId: string) {
  const list = (await orders.all()).filter(
    (o) => o.registerSessionId === sessionId && o.status !== "void" && o.type !== "quote",
  );
  const sum = (m: string) => round2(list.filter((o) => o.paymentMethod === m).reduce((s, o) => s + o.total, 0));
  return { cashSales: sum("cash"), cardSales: sum("card"), accountSales: sum("account"), orderCount: list.length };
}

const router = Router();
router.use(guardWrites("drawer"));
router.get("/", async (_req, res) => {
  const list = await registerSessions.all();
  list.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  return res.json({ data: list });
});

router.get("/active", async (req, res) => {
  const { workstationId } = req.query as { workstationId?: string };
  const ws = workstationId ?? (await getSettings()).registerWorkstationId;
  const open = await registerSessions.findBy((s) => s.status === "open" && s.workstationId === ws);
  return res.json({ data: open });
});

router.post("/open", async (req, res) => {
  // The cashier is the authenticated user — never trust a client-supplied id.
  const me = req.authUser;
  if (!me) return res.status(401).json({ error: { code: "unauthorized", message: "Not signed in." } });
  const parsed = z
    .object({ openingFloat: z.number().min(0).default(200), workstationId: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const ws = parsed.data.workstationId ?? (await getSettings()).registerWorkstationId;
  const existing = await registerSessions.findBy((s) => s.status === "open" && s.workstationId === ws);
  if (existing) return res.status(409).json({ error: { code: "already_open", message: "A register session is already open." }, data: existing });
  const seq = (await registerSessions.count()) + 1001;
  const session = await registerSessions.insert({
    id: newId("reg"),
    number: `REG-${seq}`,
    workstationId: ws,
    userId: me.id,
    userName: me.name,
    status: "open",
    openedAt: new Date().toISOString(),
    closedAt: null,
    openingFloat: parsed.data.openingFloat,
    cashSales: 0,
    cardSales: 0,
    accountSales: 0,
    orderCount: 0,
    expectedCash: parsed.data.openingFloat,
    countedCash: 0,
    variance: 0,
    note: "",
  });
  return res.status(201).json({ data: session });
});

// Live tallies for an open session (for the close dialog preview).
router.get("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const s = await registerSessions.find(id);
  if (!s) return res.status(404).json({ error: { code: "not_found", message: "Session not found" } });
  if (s.status === "open") {
    const t = await tallies(id);
    return res.json({ data: { ...s, ...t, expectedCash: round2(s.openingFloat + t.cashSales) } });
  }
  return res.json({ data: s });
});

router.post("/:id/close", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = z.object({ countedCash: z.number().min(0), note: z.string().default("") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const s = await registerSessions.find(id);
  if (!s) return res.status(404).json({ error: { code: "not_found", message: "Session not found" } });
  if (s.status === "closed") return res.status(409).json({ error: { code: "already_closed", message: "Session already closed." } });
  const t = await tallies(id);
  const expectedCash = round2(s.openingFloat + t.cashSales);
  const updated = await registerSessions.update(id, {
    status: "closed",
    closedAt: new Date().toISOString(),
    ...t,
    expectedCash,
    countedCash: parsed.data.countedCash,
    variance: round2(parsed.data.countedCash - expectedCash),
    note: parsed.data.note,
  });
  const variance = round2(parsed.data.countedCash - expectedCash);
  await recordAudit(req.authUser, "register.close", `Closed drawer ${s.number} · counted $${parsed.data.countedCash.toFixed(2)} · variance $${variance.toFixed(2)}`, { sessionId: id, variance, expectedCash });
  return res.json({ data: updated });
});

export default router;
