import { Router } from "express";
import { Collection, newId, startsWith, type Entity, type Where } from "../lib/store.js";
import { requireRole } from "../lib/auth.js";

/**
 * Append-only audit trail for sensitive actions (voids, refunds, AR payments,
 * loyalty redemptions, config changes, deletes, drawer variance). Entries are
 * only ever inserted + read — never updated or deleted — so it stands as a
 * tamper-evident record of who did what. recordAudit never throws into the
 * caller: an audit failure must not break the business action.
 */
export interface AuditEntry extends Entity {
  at: string;
  userId: string | null;
  userName: string;
  role: string;
  action: string; // dotted key, e.g. "order.void", "ar.payment"
  summary: string; // human-readable
  meta?: Record<string, unknown>;
}

export const auditLog = new Collection<AuditEntry>("audit");

export interface AuditActor {
  id: string;
  name: string;
  role: string;
}

export async function recordAudit(
  actor: AuditActor | null,
  action: string,
  summary: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await auditLog.insert({
      id: newId("aud"),
      at: new Date().toISOString(),
      userId: actor?.id ?? null,
      userName: actor?.name ?? "system",
      role: actor?.role ?? "system",
      action,
      summary,
      ...(meta ? { meta } : {}),
    });
  } catch {
    /* audit is best-effort — never break the business action */
  }
}

const router = Router();

// Reading the audit log is admin/manager only.
router.get("/", async (req, res) => {
  if (!requireRole(req, res, "admin", "manager")) return;
  const { action, since, q, limit, cursor } = req.query as { action?: string; since?: string; q?: string; limit?: string; cursor?: string };
  const n = Math.min(Number(limit) || 250, 1000);
  // With a search or `since`, action and since filter in the database and the
  // free-text search runs in memory over what's left (ad-hoc admin lookups).
  if (q || since) {
    const where: Where = {};
    if (action) where.action = startsWith(action);
    if (since) where.at = { $gte: since };
    let list = await auditLog.where(where, { sort: { at: -1, id: -1 } });
    // Case-insensitive substring search over two fields, in memory.
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((e) => e.summary.toLowerCase().includes(needle) || e.userName.toLowerCase().includes(needle));
    }
    return res.json({ data: list.slice(0, n) });
  }
  // Fast path: indexed keyset pagination by time (newest first). The
  // append-only audit log grows unbounded, so never load it all.
  const page = await auditLog.page({
    limit: n,
    cursor: cursor ?? null,
    order: "desc",
    ...(action ? { likePrefix: { field: "action", value: action } } : {}),
  });
  return res.json({ data: page.items, nextCursor: page.nextCursor });
});

export default router;
