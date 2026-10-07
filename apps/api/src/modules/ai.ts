import { Router } from "express";

/**
 * AI seam — a designed placeholder for the Phase 2 assistant managed by
 * inerica systems. Architecturally, AI features plug in HERE: they consume the
 * domain event bus (sales, inventory.low, po.received, deliveries) and the
 * read models, and propose actions that a human approves (human-in-the-loop).
 * No model is wired yet; these endpoints describe the contract so the UI and
 * inerica's service can integrate without further API changes.
 */

const CAPABILITIES = [
  { key: "reorder_suggestions", title: "Smart reorder", desc: "Suggest POs from low-stock + sales velocity. Human approves." },
  { key: "demand_forecast", title: "Demand forecast", desc: "Predict cubic-yard demand by season/weather." },
  { key: "dispatch_routing", title: "Route optimization", desc: "Order/assign deliveries by location + truck capacity." },
  { key: "pricing_assist", title: "Pricing assist", desc: "Flag margin outliers and suggest price moves for review." },
  { key: "sales_insights", title: "Sales insights", desc: "Natural-language Q&A over the reports ledger." },
] as const;

const router = Router();

router.get("/status", async (_req, res) => res.json({
  data: {
    phase: 2,
    managedBy: "inerica systems",
    humanInLoop: true,
    enabled: false,
    capabilities: CAPABILITIES,
  },
}));

// Stub: returns a held suggestion envelope (always pending human review).
router.post("/assist", async (req, res) => {
  const body = (req.body ?? {}) as { capability?: string };
  return res.json({
    data: {
      enabled: false,
      capability: body.capability ?? null,
      status: "pending_human_review",
      message: "AI assist activates in Phase 2 (inerica systems). Suggestions will require human approval.",
    },
  });
});

export default router;
