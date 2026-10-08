import { Router } from "express";
import { z } from "zod";
import { Collection, newId, startsWith, type Entity, type Where } from "../lib/store.js";
import { getAuthUser } from "./users.js";

/**
 * Employee time clock with California-style break rules:
 *   - A shift longer than 5 hours requires a 30-minute UNPAID meal break.
 *     If the employee didn't clock one, it is still deducted at clock-out
 *     (mandatory), so paid time never includes the meal break.
 *   - Up to two 10-minute PAID rest breaks are allowed and are NOT deducted.
 */

const MEAL_THRESHOLD_MIN = 5 * 60; // 5 hours
const MANDATORY_UNPAID_MIN = 30;
const MAX_PAID_BREAKS = 2;

export type BreakType = "paid" | "unpaid";
export interface BreakEntry {
  type: BreakType;
  start: string;
  end: string | null;
}

export interface Shift extends Entity {
  userId: string;
  userName: string;
  clockIn: string;
  clockOut: string | null;
  breaks: BreakEntry[];
  status: "open" | "closed";
  spanMinutes: number;
  paidBreakMinutes: number;
  unpaidBreakMinutes: number;
  paidMinutes: number; // payable time after meal-break deduction
}

export const shifts = new Collection<Shift>("shifts");

const minutesBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

function compute(shift: Shift, end: string) {
  const span = Math.max(0, minutesBetween(shift.clockIn, end));
  let paidBreak = 0;
  let unpaidBreak = 0;
  for (const b of shift.breaks) {
    if (!b.end) continue;
    const m = Math.max(0, minutesBetween(b.start, b.end));
    if (b.type === "paid") paidBreak += m;
    else unpaidBreak += m;
  }
  // Mandatory meal deduction for long shifts, even if not clocked.
  const mealDeduction = span > MEAL_THRESHOLD_MIN ? Math.max(MANDATORY_UNPAID_MIN, unpaidBreak) : unpaidBreak;
  const paid = Math.max(0, span - mealDeduction); // paid rest breaks stay paid
  const r1 = (n: number) => Math.round(n * 100) / 100;
  return {
    spanMinutes: r1(span),
    paidBreakMinutes: r1(paidBreak),
    unpaidBreakMinutes: r1(mealDeduction),
    paidMinutes: r1(paid),
  };
}

const router = Router();
// Current open shift for a user.
router.get("/active", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) return res.json({ data: null });
  const open = await shifts.findOne({ userId, status: "open" });
  return res.json({ data: open });
});

router.get("/", async (req, res) => {
  const { userId, date } = req.query as { userId?: string; date?: string };
  const where: Where = {};
  if (userId) where.userId = userId;
  if (date) where.clockIn = startsWith(String(date).slice(0, 10)); // ISO date prefix, as clockIn.slice(0, 10) === date
  const list = await shifts.where(where, { sort: { clockIn: -1, id: -1 } });
  return res.json({ data: list });
});

router.post("/clock-in", async (req, res) => {
  // You can only clock yourself in — userId comes from the session, not the body.
  const me = await getAuthUser(req);
  if (!me) return res.status(401).json({ error: { code: "unauthorized", message: "Not signed in." } });
  const existing = await shifts.findOne({ userId: me.id, status: "open" });
  if (existing) return res.status(409).json({ error: { code: "already_open", message: "Already clocked in." }, data: existing });
  const shift = await shifts.insert({
    id: newId("shift"),
    userId: me.id,
    userName: me.name,
    clockIn: new Date().toISOString(),
    clockOut: null,
    breaks: [],
    status: "open",
    spanMinutes: 0,
    paidBreakMinutes: 0,
    unpaidBreakMinutes: 0,
    paidMinutes: 0,
  });
  return res.status(201).json({ data: shift });
});

router.post("/:id/break/start", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = z.object({ type: z.enum(["paid", "unpaid"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const shift = await shifts.find(id);
  if (!shift || shift.status !== "open") return res.status(404).json({ error: { code: "not_found", message: "No open shift" } });
  const me1 = await getAuthUser(req);
  if (!me1 || (shift.userId !== me1.id && me1.role !== "admin" && me1.role !== "manager"))
    return res.status(403).json({ error: { code: "forbidden", message: "Not your shift." } });
  if (shift.breaks.some((b) => !b.end))
    return res.status(409).json({ error: { code: "break_open", message: "End the current break first." } });
  if (parsed.data.type === "paid" && shift.breaks.filter((b) => b.type === "paid").length >= MAX_PAID_BREAKS)
    return res.status(409).json({ error: { code: "break_limit", message: "Both 10-minute paid breaks already used." } });
  const breaks = [...shift.breaks, { type: parsed.data.type, start: new Date().toISOString(), end: null }];
  const updated = await shifts.update(id, { breaks });
  return res.json({ data: updated });
});

router.post("/:id/break/end", async (req, res) => {
  const { id } = req.params as { id: string };
  const shift = await shifts.find(id);
  if (!shift || shift.status !== "open") return res.status(404).json({ error: { code: "not_found", message: "No open shift" } });
  const me2 = await getAuthUser(req);
  if (!me2 || (shift.userId !== me2.id && me2.role !== "admin" && me2.role !== "manager"))
    return res.status(403).json({ error: { code: "forbidden", message: "Not your shift." } });
  const breaks = shift.breaks.map((b, i, arr) => (i === arr.length - 1 && !b.end ? { ...b, end: new Date().toISOString() } : b));
  const updated = await shifts.update(id, { breaks });
  return res.json({ data: updated });
});

router.post("/:id/clock-out", async (req, res) => {
  const { id } = req.params as { id: string };
  const shift = await shifts.find(id);
  if (!shift || shift.status !== "open") return res.status(404).json({ error: { code: "not_found", message: "No open shift" } });
  const me3 = await getAuthUser(req);
  if (!me3 || (shift.userId !== me3.id && me3.role !== "admin" && me3.role !== "manager"))
    return res.status(403).json({ error: { code: "forbidden", message: "Not your shift." } });
  const end = new Date().toISOString();
  // Auto-close any dangling break.
  const breaks = shift.breaks.map((b) => (b.end ? b : { ...b, end }));
  const totals = compute({ ...shift, breaks }, end);
  const updated = await shifts.update(id, { clockOut: end, status: "closed", breaks, ...totals });
  return res.json({ data: updated });
});

export default router;
