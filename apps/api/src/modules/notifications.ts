import { Router } from "express";
import { Collection, newId, type Entity } from "../lib/store.js";
import { bus } from "../lib/events.js";

export type NotificationType = "low_stock" | "po_received";

export interface Notification extends Entity {
  type: NotificationType;
  title: string;
  body: string;
  refId: string | null;
  read: boolean;
}

export const notifications = new Collection<Notification>("notifications");

async function push(n: Omit<Notification, keyof Entity | "read">): Promise<void> {
  // De-dupe unread low-stock alerts for the same product.
  if (n.type === "low_stock" && n.refId) {
    const dup = await notifications.findBy(
      (x) => x.type === "low_stock" && x.refId === n.refId && !x.read,
    );
    if (dup) return;
  }
  await notifications.insert({ id: newId("ntf"), read: false, ...n });
}

/** Wire domain events → notifications. This is the "service communication" seam. */
export function registerNotificationSubscribers(): void {
  bus.on("inventory.low", (e) => {
    void push({
      type: "low_stock",
      title: "Low stock",
      body: `${e.name} is low — ${e.qtyOnHand} on hand (reorder at ${e.reorderPoint}). Time to order.`,
      refId: e.productId,
    });
  });

  bus.on("po.received", (e) => {
    void push({
      type: "po_received",
      title: "Purchase order received",
      body: `${e.number} from ${e.vendorName} received — ${e.lineCount} item(s) added to stock.`,
      refId: e.poId,
    });
  });
}

const router = Router();

router.get("/", async (req, res) => {
  const { unread } = req.query as Record<string, string | undefined>;
  let list = await notifications.all();
  if (unread === "true") list = list.filter((n) => !n.read);
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unreadCount = (await notifications.filter((n) => !n.read)).length;
  return res.json({ data: list, unreadCount });
});

router.post("/:id/read", async (req, res) => {
  const { id } = req.params as { id: string };
  const updated = await notifications.update(id, { read: true });
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  return res.json({ data: updated });
});

router.post("/read-all", async (_req, res) => {
  const list = await notifications.filter((n) => !n.read);
  for (const n of list) await notifications.update(n.id, { read: true });
  return res.json({ data: { marked: list.length } });
});

export default router;
