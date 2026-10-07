import { Router } from "express";
import { Collection, newId, type Entity } from "../lib/store.js";
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
  // Free-text search + `since` are in-memory refinements (not indexable here) —
  // scan when either is present. These are ad-hoc admin lookups, not hot paths.
  if (q || since) {
    let list = (await auditLog.all()).sort((a, b) => b.at.localeCompare(a.at));
    if (action) list = list.filter((e) => e.action.startsWith(action));
    if (since) list = list.filter((e) => e.at >= since);
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
