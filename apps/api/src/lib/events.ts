import { EventEmitter } from "node:events";

/**
 * In-process domain event bus. Services publish facts ("po.received",
 * "inventory.changed") without knowing who consumes them — this is the seam
 * that would become a message broker (NATS/Rabbit/SQS) if these modules are
 * split into separate microservice processes. Today it's an EventEmitter.
 */

export interface DomainEvents {
  "inventory.changed": { productId: string; qtyOnHand: number; reorderPoint: number };
  "inventory.low": { productId: string; sku: string; name: string; qtyOnHand: number; reorderPoint: number };
  // Catalog changes — consumed by the website-sync subscriber to push deltas.
  "product.changed": { id: string };
  "product.deleted": { id: string };
  "po.received": { poId: string; number: string; vendorName: string; lineCount: number };
  // Customer-communication triggers — consumed by the messaging module to fire
  // templated auto-texts via RingCentral.
  "delivery.dispatched": { deliveryId: string; code: string; customer: string; phone: string; eta: string };
  "delivery.delivered": { deliveryId: string; code: string; customer: string; phone: string };
  "order.created": {
    orderId: string;
    number: string;
    customerId: string | null;
    customerName: string;
    phone: string;
    total: number;
    type: string;
  };
}

class TypedBus {
  private emitter = new EventEmitter();

  on<K extends keyof DomainEvents>(event: K, handler: (payload: DomainEvents[K]) => void): void {
    this.emitter.on(event, handler as (p: unknown) => void);
  }

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    this.emitter.emit(event, payload);
  }
}

export const bus = new TypedBus();
