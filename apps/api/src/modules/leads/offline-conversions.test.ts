import { describe, it, expect } from "vitest";
import {
  CONVERSION_NAME,
  conversionValue,
  formatConversionTime,
  toGoogleCsv,
  type OfflineConversionRow,
} from "./offline-conversions.js";
import type { Order } from "../orders.js";

const order = (patch: Partial<Order>): Order =>
  ({
    id: "ord_1",
    number: "ORD-20260911-0001",
    customerId: "cus_1",
    customerName: "Ravi",
    type: "delivery",
    status: "delivered",
    location: "yard",
    lines: [],
    subtotal: 0,
    discount: 0,
    taxRate: 0.0975,
    tax: 0,
    total: 0,
    paymentMethod: "card",
    paid: true,
    due: 0,
    registerSessionId: null,
    createdAt: "2026-09-11T21:32:05.000Z",
    updatedAt: "2026-09-11T21:32:05.000Z",
    ...patch,
  }) as Order;

describe("conversionValue", () => {
  it("reports the invoiced total EXCLUDING tax", () => {
    expect(conversionValue(order({ total: 1097.5, tax: 97.5 }))).toBe(1000);
  });
  it("rounds to cents", () => {
    expect(conversionValue(order({ total: 109.75, tax: 9.755 }))).toBe(100);
  });
});

describe("formatConversionTime", () => {
  it("renders Los Angeles local time with an explicit offset, never UTC", () => {
    // 2026-09-11T21:32:05Z is 14:32:05 PDT (UTC-7).
    expect(formatConversionTime("2026-09-11T21:32:05.000Z")).toBe("2026-09-11 14:32:05-07:00");
  });

  it("follows DST into Pacific Standard Time", () => {
    // 2026-01-15T21:32:05Z is 13:32:05 PST (UTC-8).
    expect(formatConversionTime("2026-01-15T21:32:05.000Z")).toBe("2026-01-15 13:32:05-08:00");
  });

  it("uses a 24-hour clock at midnight (not hour 24)", () => {
    // 2026-06-02T07:00:00Z is 00:00:00 PDT.
    expect(formatConversionTime("2026-06-02T07:00:00.000Z")).toBe("2026-06-02 00:00:00-07:00");
  });
});

describe("toGoogleCsv", () => {
  const rows: OfflineConversionRow[] = [
    {
      leadId: "lead_1",
      clickIdType: "gclid",
      clickId: "Cj0KCQ_abc123",
      orderNumber: "ORD-20260911-0001",
      conversionTime: "2026-09-11 14:32:05-07:00",
      value: 1000,
      currency: "USD",
    },
  ];

  it("emits Google's schema with the Los Angeles timezone parameter", () => {
    const csv = toGoogleCsv(rows).split("\n");
    expect(csv[0]).toBe("Parameters:TimeZone=America/Los_Angeles");
    expect(csv[1]).toBe(
      "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
    );
    expect(csv[2]).toBe(`Cj0KCQ_abc123,${CONVERSION_NAME},2026-09-11 14:32:05-07:00,1000.00,USD`);
  });

  it("still emits a valid header-only file when nothing qualifies", () => {
    expect(toGoogleCsv([]).split("\n").filter(Boolean)).toHaveLength(2);
  });
});
