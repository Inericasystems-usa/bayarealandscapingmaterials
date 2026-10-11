"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Minus,
  Plus,
  Trash2,
  CreditCard,
  Percent,
  UserPlus,
  X,
  CheckCircle2,
  CloudOff,
  AlertTriangle,
  Loader2,
  Printer,
  Monitor,
  Search,
  Star,
} from "lucide-react";
import { Button } from "@balm/ui";
import { api, type ApiProduct, type InventoryRow, type Customer, type RegisterSession, type Order, type Settings } from "@/lib/api-client";
import { uomOptions, customOption, isBulkUnit, priceNumber, type UomOption } from "@/lib/uom";
import { useCustomerDisplay } from "@/lib/useCustomerDisplay";
import { printReceipt } from "@/lib/receipt";
import { kickDrawer, terminalInfo, terminalSale, terminalVoid, type TerminalInfo } from "@/lib/hardware";
import { COMPANY } from "@/lib/company";
import { useScanner } from "@/lib/useScanner";
import { useModalDismiss } from "@/lib/useModalDismiss";
import { QueryParamSync } from "./QueryParamSync";
import { isReachable, enqueueSale, isNetworkError } from "@/lib/offline";
import { toast } from "@/lib/toast";
import { computeChange, tenderSuggestions as computeTenderSuggestions } from "@balm/lib-domain";
import { useAuth } from "./auth";

const API_DOWN = "Can't reach the API — start it with `pnpm dev` in apps/api.";
type PayMethod = "terminal" | "card" | "cash" | "account";

// Simulated card payments exist only on the development server. A build never
// offers the Stripe Terminal stub (it has no reader step, so it can only fake an
// approval) and never records a sale "approved" by a simulated terminal: test
// paths stay out of production (PCI DSS 6.5.6).
const ALLOW_SIMULATED_PAYMENTS = process.env.NODE_ENV === "development";
const TENDERS: readonly PayMethod[] = ALLOW_SIMULATED_PAYMENTS
  ? ["terminal", "card", "cash", "account"]
  : ["terminal", "cash", "account"];
const SIMULATED_TERMINAL =
  "The card terminal isn't live (simulated or not set up), so card sales are disabled. Take cash or account, or configure the live terminal on the counter PC.";

interface Sellable extends ApiProduct {
  unit: string;
  qtyOnHand: number;
  low: boolean;
  sku: string;
}

interface CartLine {
  key: string;
  productId: string;
  name: string;
  unitLabel: string;
  packs: number;
  baseQtyPerPack: number;
  unitPrice: number;
  pricePerPack: number;
}

export default function PosRegisterPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [stock, setStock] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<CartLine[]>([]);
  const [picker, setPicker] = useState<Sellable | null>(null);
  const [customQty, setCustomQty] = useState("");
  const [charging, setCharging] = useState(false);
  const [receipt, setReceipt] = useState<{ number: string; total: number; pending?: boolean } | null>(null);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Payment capture (mock Stripe Terminal)
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("terminal");
  const [cashTendered, setCashTendered] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [custItem, setCustItem] = useState({ name: "", price: "", qty: "1" });
  const [discount, setDiscount] = useState<{ mode: "amount" | "percent"; value: number } | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState({ mode: "percent" as "amount" | "percent", value: "" });
  const [payStage, setPayStage] = useState<"idle" | "processing">("idle");

  // Store config + customer (orders)
  const [taxRate, setTaxRate] = useState(0.0975);
  const [displayChannel, setDisplayChannel] = useState("MAIN");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custOpen, setCustOpen] = useState(false);
  const [custQuery, setCustQuery] = useState("");
  const [custAdding, setCustAdding] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "", type: "retail" as Customer["type"] });
  const [custSaving, setCustSaving] = useState(false);

  // Register drawer session + Stripe Terminal
  const [session, setSession] = useState<RegisterSession | null>(null);
  const [termMode, setTermMode] = useState<"live" | "simulated">("simulated");
  // Physical terminal (Ingenico DX8000 via the hardware bridge). null = bridge offline.
  const [physTerminal, setPhysTerminal] = useState<TerminalInfo | null>(null);
  const terminalSimBlocked = !ALLOW_SIMULATED_PAYMENTS && physTerminal !== null && physTerminal.mode !== "live";
  const [drawerDialog, setDrawerDialog] = useState<"none" | "open" | "close">("none");
  const [floatInput, setFloatInput] = useState("200");
  const [countInput, setCountInput] = useState("");
  const [closePreview, setClosePreview] = useState<RegisterSession | null>(null);
  const [drawerBusy, setDrawerBusy] = useState(false);

  // Create a customer inline from the register picker, then select them.
  async function addCustomer() {
    const name = newCust.name.trim();
    if (!name) return;
    setCustSaving(true);
    try {
      const created = await api.createCustomer({ name, phone: newCust.phone.trim(), type: newCust.type });
      setCustomers((prev) => [created, ...prev]);
      setCustomer(created);
      setCustAdding(false);
      setNewCust({ name: "", phone: "", type: "retail" });
      setCustOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCustSaving(false);
    }
  }

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [p, s] = await Promise.all([api.listProducts(), api.listInventory()]);
      setProducts(p);
      setStock(s);
    } catch {
      setError(API_DOWN);
    } finally {
      setLoading(false);
    }
  }, []);

  // One-time config: tax rate, customers, terminal mode, active drawer.
  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        setTaxRate(s.tax.rate);
        setDisplayChannel(s.registerWorkstationId || "MAIN");
      })
      .catch(() => {});
    api.listCustomers().then(setCustomers).catch(() => {});
    api.terminalStatus().then((t) => setTermMode(t.mode)).catch(() => {});
    api.terminalRegisterActive().then(setSession).catch(() => {});
    terminalInfo().then(setPhysTerminal).catch(() => {});
  }, []);

  // Push live cart to the customer display (:3001). Effect lives below totals.
  const publishDisplay = useCustomerDisplay(displayChannel);
  const storeName = settings?.storeName || "Inerica POS";

  const openDrawer = async () => {
    if (!user) return;
    setDrawerBusy(true);
    try {
      const s = await api.openRegister(user.id, Number(floatInput) || 0);
      setSession(s);
      setDrawerDialog("none");
    } catch (e) {
      setError(e instanceof Error ? e.message : API_DOWN);
    } finally {
      setDrawerBusy(false);
    }
  };

  const startClose = async () => {
    if (!session) return;
    setCountInput("");
    setClosePreview(null);
    setDrawerDialog("close");
    api.getRegister(session.id).then(setClosePreview).catch(() => {});
  };

  const closeDrawer = async () => {
    if (!session) return;
    setDrawerBusy(true);
    try {
      await api.closeRegister(session.id, Number(countInput) || 0);
      setSession(null);
      setDrawerDialog("none");
    } catch (e) {
      setError(e instanceof Error ? e.message : API_DOWN);
    } finally {
      setDrawerBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stockByProduct = useMemo(() => {
    const m = new Map<string, InventoryRow>();
    for (const s of stock) m.set(s.productId, s);
    return m;
  }, [stock]);

  const sellables = useMemo<Sellable[]>(
    () =>
      products.map((p) => {
        const s = stockByProduct.get(p.id);
        return {
          ...p,
          unit: s?.unit ?? "Each",
          qtyOnHand: s?.qtyOnHand ?? 0,
          low: s?.low ?? false,
          sku: s?.sku ?? "",
        };
      }),
    [products, stockByProduct],
  );

  const categories = useMemo(
    () => ["Favorites", "All", ...new Set(sellables.map((s) => s.category))],
    [sellables],
  );

  const visible = useMemo(() => {
    let list =
      cat === "Favorites"
        ? sellables.filter((s) => favorites.has(s.id))
        : cat === "All"
          ? sellables
          : sellables.filter((s) => s.category === cat);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q));
    return list;
  }, [sellables, cat, search, favorites]);

  // ── Cart ────────────────────────────────────────────────────────────
  const addLine = (item: Sellable, opt: UomOption) => {
    setReceipt(null);
    const key = `${item.id}::${opt.label}`;
    setLines((prev) => {
      const ex = prev.find((l) => l.key === key);
      if (ex) return prev.map((l) => (l.key === key ? { ...l, packs: l.packs + 1 } : l));
      return [
        ...prev,
        {
          key,
          productId: item.id,
          name: item.name,
          unitLabel: opt.label,
          packs: 1,
          baseQtyPerPack: opt.baseQty,
          unitPrice: opt.unitPrice,
          pricePerPack: opt.price,
        },
      ];
    });
    setPicker(null);
    setCustomQty("");
  };

  // Wholesale/dealer customers are billed at each product's wholesale price when
  // one is set. Attach the customer first, then ring up — new lines price wholesale.
  const wholesalePricing = customer?.type === "wholesale" || customer?.type === "contractor";
  const priceStrFor = (item: Sellable) =>
    wholesalePricing && item.wholesale ? item.wholesale : item.price;

  const onTileClick = (item: Sellable) => {
    if (item.qtyOnHand <= 0) return;
    // Bulk items get the measurement picker; simple items add 1 unit directly.
    if (isBulkUnit(item.unit)) {
      setPicker(item);
    } else {
      const unitPrice = priceNumber(priceStrFor(item));
      addLine(item, { label: item.unit, baseQty: 1, unitPrice, price: unitPrice });
    }
  };

  // Barcode/SKU scanner: match on SKU (or product id) and add to the cart. Bulk
  // items open the measurement picker; simple items add directly. No match → toast.
  const onScan = useCallback(
    (code: string) => {
      const norm = code.trim().toLowerCase();
      const hit = sellables.find((s) => (s.sku && s.sku.toLowerCase() === norm) || s.id.toLowerCase() === norm);
      if (!hit) {
        toast(`No product for "${code}"`, "error");
        return;
      }
      if (hit.qtyOnHand <= 0) {
        toast(`${hit.name} is out of stock`, "error");
        return;
      }
      onTileClick(hit);
      setSearch("");
      toast(isBulkUnit(hit.unit) ? `${hit.name} — choose a measurement` : `Added ${hit.name}`, "success");
    },
    // onTileClick only calls stable setters — safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sellables],
  );
  // Scanner is for cart-building — disable it while the payment modal is open so
  // fast cash-amount typing (and the Enter-to-charge shortcut) can't be misread.
  useScanner(onScan, !payOpen);

  const bump = (key: string, d: number) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, packs: Math.max(0, Number((l.packs + d).toFixed(4))) } : l)),
    );
  // Type a quantity (supports decimals for bulk) or a custom unit price directly.
  const setQty = (key: string, value: string) => {
    setReceipt(null);
    const n = Number(value);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, packs: value === "" ? 0 : Number.isFinite(n) && n >= 0 ? n : l.packs } : l)));
  };
  const setPrice = (key: string, value: string) => {
    setReceipt(null);
    const n = Number(value);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, pricePerPack: value === "" ? 0 : Number.isFinite(n) && n >= 0 ? n : l.pricePerPack } : l)));
  };
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  // Custom (off-catalog) line item — e.g. a special-order or one-off charge.
  const addCustomLine = () => {
    const name = custItem.name.trim() || "Custom item";
    const price = Number(custItem.price);
    const qty = Number(custItem.qty) || 1;
    if (!(price >= 0)) return;
    setReceipt(null);
    setLines((prev) => [
      ...prev,
      { key: `custom::${name}::${prev.length}::${Math.round(price * 100)}`, productId: "custom", name, unitLabel: "Each", packs: qty, baseQtyPerPack: 1, unitPrice: price, pricePerPack: price },
    ]);
    setCustomOpen(false);
    setCustItem({ name: "", price: "", qty: "1" });
  };

  function applyDiscount() {
    const v = Number(discountInput.value);
    if (!(v > 0)) {
      setDiscount(null);
      setDiscountOpen(false);
      return;
    }
    setDiscount({ mode: discountInput.mode, value: discountInput.mode === "percent" ? Math.min(100, v) : v });
    setDiscountOpen(false);
  }

  // Favorites — quick-access products, persisted per register device.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("balm.pos.favorites");
      if (raw) setFavorites(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);
  const toggleFav = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("balm.pos.favorites", JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const subtotal = lines.reduce((s, l) => s + l.packs * l.pricePerPack, 0);
  const discountAmount = discount
    ? Math.min(subtotal, discount.mode === "percent" ? Math.round(((subtotal * discount.value) / 100) * 100) / 100 : discount.value)
    : 0;
  const taxable = Math.max(0, subtotal - discountAmount);
  const tax = taxable * taxRate;
  const total = taxable + tax;
  const itemCount = lines.reduce((s, l) => s + l.packs, 0);

  // Push live cart to the customer display whenever it changes.
  useEffect(() => {
    if (receipt) return; // "complete" screen is published explicitly on charge
    publishDisplay({
      store: storeName,
      status: lines.length ? "active" : "idle",
      customer: customer?.name ?? "Walk-in",
      lines: lines.map((l) => ({
        name: l.name,
        unitLabel: l.unitLabel,
        qty: l.packs,
        lineTotal: Number((l.packs * l.pricePerPack).toFixed(2)),
      })),
      subtotal: Number(subtotal.toFixed(2)),
      discount: Number(discountAmount.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      taxRate,
      total: Number(total.toFixed(2)),
    });
  }, [lines, customer, subtotal, discountAmount, tax, total, taxRate, receipt, publishDisplay, storeName]);

  const openPayment = () => {
    if (!lines.length) return;
    if (!session) {
      setDrawerDialog("open"); // must open the drawer before taking payment
      return;
    }
    setError(null);
    setPayStage("idle");
    setCashTendered("");
    setPayOpen(true);
  };

  // Cash helpers: change due + quick "round up" tender suggestions (lib-domain).
  const changeDue = computeChange(total, Number(cashTendered || 0));
  const tenderSuggestions = computeTenderSuggestions(total);

  // On-screen number-pad entry for the cash-tendered field (tablet/touch).
  const pushDigit = (d: string) =>
    setCashTendered((v) => {
      if (d === "back") return v.slice(0, -1);
      if (d === ".") return v.includes(".") ? v : v === "" ? "0." : `${v}.`;
      const dot = v.indexOf(".");
      if (dot >= 0 && v.length - dot - 1 >= 2) return v; // cap at 2 decimals
      return v + d;
    });

  // Idempotency key for the CURRENT sale attempt. Generated once and reused
  // across retries (cleared only on success), so a re-click after a mid-sale
  // failure converges to exactly ONE order and ONE charge instead of duplicating
  // either. Both createOrder and the payment capture key off it (via the order id).
  const saleIdRef = useRef<string | null>(null);

  // Record the ORDER first (idempotent), then take payment against it — so a card
  // can never be charged without a recorded sale, and the charge reconciles to
  // the order total.
  const completeSale = async () => {
    if (payMethod === "account" && !customer) {
      setError("Select a customer for an on-account order.");
      return;
    }
    const online = isReachable();
    // A card/terminal charge can't be authorized without the network.
    if (!online && (payMethod === "terminal" || payMethod === "card")) {
      setError("Card payments need a connection. Take cash, or try again when you're back online.");
      return;
    }
    if (!TENDERS.includes(payMethod)) return;
    if (payMethod === "terminal" && terminalSimBlocked) {
      setError(SIMULATED_TERMINAL);
      return;
    }
    setCharging(true);
    setPayStage("processing");
    setError(null);
    const amt = Number(total.toFixed(2));
    const clientId = saleIdRef.current ?? (saleIdRef.current = crypto.randomUUID());
    const orderPayload = {
      type: "sale" as const,
      status: "complete" as const,
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? "Walk-in",
      paymentMethod: (payMethod === "terminal" ? "card" : payMethod) as "cash" | "card" | "account",
      taxRate,
      discount: discountAmount,
      registerSessionId: session?.id ?? null,
      clientId,
      lines: lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        unitLabel: l.packs > 1 ? `${l.packs}× ${l.unitLabel}` : l.unitLabel,
        qty: l.packs * l.baseQtyPerPack,
        // Derive the per-base-unit price from the (possibly edited) line price so
        // a manual price change in the cart flows through the API's qty×unitPrice.
        unitPrice: l.baseQtyPerPack > 0 ? Number((l.pricePerPack / l.baseQtyPerPack).toFixed(4)) : l.pricePerPack,
        lineTotal: Number((l.packs * l.pricePerPack).toFixed(2)),
      })),
    };
    // Record a sale locally when the API is unreachable: queue it for replay,
    // pop the drawer (cash), clear the ticket, and show a "pending sync" receipt.
    const finishOffline = () => {
      if (payMethod === "cash") void kickDrawer();
      enqueueSale({ clientId, payload: orderPayload, total: amt, queuedAt: new Date().toISOString() });
      setReceipt({ number: "offline", total: amt, pending: true });
      setLastOrder(null);
      setLines([]);
      setCustomer(null);
      setDiscount(null);
      setPayOpen(false);
      saleIdRef.current = null; // sale is done (queued) — next sale starts fresh
      toast("Saved offline — it'll sync automatically when the connection returns.", "info");
    };
    try {
      if (!online) {
        finishOffline();
        return;
      }
      // 1. Record the order FIRST. Idempotent by clientId, so if we already
      //    created it on a prior (failed-after-this-point) attempt, this returns
      //    the SAME order rather than duplicating it. A payment can now never be
      //    taken without a recorded sale to reconcile against.
      const order = await api.createOrder(orderPayload);

      // 2. Take payment AGAINST the order. Passing order.id lets the server
      //    reconcile the charged amount to order.total, key the payment intent
      //    idempotently (retry-safe), and link the payment row to the sale.
      if (payMethod === "terminal") {
        // Physical terminal (Ingenico DX8000) via the hardware bridge.
        let result;
        try {
          result = await terminalSale(amt, order.id);
        } catch (e) {
          setError(
            `Terminal unreachable: ${e instanceof Error ? e.message : "bridge offline"}. Start the bridge or use another method.`,
          );
          return;
        }
        if (!result.approved) {
          setError(`Declined: ${result.message || "card not approved"}.`);
          return;
        }
        // The bridge can switch to its simulator at any time; its "approvals"
        // are never recorded as card payments outside development.
        if (result.provider === "sim" && !ALLOW_SIMULATED_PAYMENTS) {
          setError(SIMULATED_TERMINAL);
          return;
        }
        // Record the already-authorized terminal payment with its auth details
        // and the bridge's signature over them (the API checks it).
        try {
          await api.capturePayment(amt, "terminal", order.id, {
            reference: result.reference,
            provider: result.provider === "sim" ? "elavon_sim" : "elavon_terminal",
            status: "succeeded",
            authCode: result.authCode,
            cardBrand: result.cardBrand,
            last4: result.last4,
            entryMode: result.entryMode,
            signature: result.signature,
          });
        } catch (e) {
          // The card was charged but the store couldn't record it: void it on
          // the terminal so the customer isn't charged for an unrecorded sale.
          if (isNetworkError(e)) throw e;
          const voided = await terminalVoid(result.reference);
          setError(
            `${e instanceof Error ? e.message : "The payment couldn't be recorded."} ` +
              (voided ? "The card charge was voided on the terminal." : "Void the charge on the terminal before trying again."),
          );
          return;
        }
      } else if (payMethod === "card") {
        // Stripe Terminal flow (simulated until a key + reader are set).
        const pi = await api.createPaymentIntent(amt, order.id);
        await api.capturePaymentIntent(pi.id, amt, order.id);
      } else if (payMethod === "cash") {
        await api.capturePayment(amt, "cash", order.id);
        void kickDrawer(); // pop the drawer for cash (bridge or simulated)
      }
      // account → billed later, no capture

      // Sale done — clear the idempotency key so the NEXT sale starts fresh.
      saleIdRef.current = null;
      setReceipt({ number: order.number, total: order.total });
      publishDisplay({
        store: storeName,
        status: "complete",
        customer: order.customerName,
        lines: [],
        subtotal: order.subtotal,
        tax: order.tax,
        taxRate: order.taxRate,
        total: order.total,
        orderNumber: order.number,
      });
      setLastOrder(order);
      setLines([]);
      setCustomer(null);
      setDiscount(null);
      setPayOpen(false);
      await refresh(); // stock now reflects the order
    } catch (e) {
      // Lost the API mid-sale: for cash/account, queue it instead of losing it.
      if (isNetworkError(e) && (payMethod === "cash" || payMethod === "account")) {
        finishOffline();
      } else {
        setError(e instanceof Error ? e.message : API_DOWN);
      }
    } finally {
      setCharging(false);
      setPayStage("idle");
    }
  };

  // Keep the latest handlers in refs so the keyboard listener never calls a
  // stale closure (which would capture an old payMethod/tendered).
  const completeSaleRef = useRef(completeSale);
  completeSaleRef.current = completeSale;
  const openPaymentRef = useRef(openPayment);
  openPaymentRef.current = openPayment;

  // Fast-checkout keyboard shortcuts: Enter charges from the open payment modal;
  // when idle with items in the cart, Enter opens payment. Ignores keystrokes
  // while typing in a field so it never hijacks manual input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (payOpen) {
        if (payStage === "idle" && !charging) {
          e.preventDefault();
          void completeSaleRef.current();
        }
        return;
      }
      if (!typing && !receipt && lines.length > 0) {
        e.preventDefault();
        openPaymentRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payOpen, payStage, charging, receipt, lines.length]);

  // Modal a11y: Esc-to-close, focus trap, and focus restore for each dialog.
  const pickerRef = useRef<HTMLDivElement>(null);
  const payRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLDivElement>(null);
  const discountRef = useRef<HTMLDivElement>(null);
  const custRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  useModalDismiss(!!picker, () => setPicker(null), pickerRef);
  useModalDismiss(payOpen, () => payStage === "idle" && setPayOpen(false), payRef);
  useModalDismiss(customOpen, () => setCustomOpen(false), customRef);
  useModalDismiss(discountOpen, () => setDiscountOpen(false), discountRef);
  useModalDismiss(custOpen, () => setCustOpen(false), custRef);
  useModalDismiss(drawerDialog !== "none", () => !drawerBusy && setDrawerDialog("none"), drawerRef);

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[1fr_340px] lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_410px]">
      <Suspense fallback={null}>
        <QueryParamSync name="find" onValue={setSearch} />
      </Suspense>
      {/* ── Catalog (container: tiles size to this panel, not the viewport) ─── */}
      <div className="@container flex min-h-0 flex-col">
        <div className="flex items-center gap-2 bg-[var(--color-bg-elevated)] px-4 pt-3">
          <div className="flex flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3">
            <Search className="h-4 w-4 text-[var(--color-text-muted)]" strokeWidth={1.75} aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or scan a barcode…"
              className="h-10 flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3">
          <button
            onClick={() => setCustomOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-full)] border border-dashed border-[var(--color-border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <Plus className="h-3.5 w-3.5" /> Custom
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-[var(--radius-full)] px-4 py-1.5 text-sm font-medium transition-colors ${
                cat === c
                  ? "bg-[var(--color-action)] text-[var(--color-action-fg)]"
                  : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-clay-500)_10%,transparent)] px-4 py-2 text-sm text-[var(--color-warning)]">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}

        {loading ? (
          <div className="grid flex-1 place-items-center text-[var(--color-text-muted)]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-auto p-4 @md:grid-cols-3 @2xl:grid-cols-4">
            {visible.map((p) => {
              const out = p.qtyOnHand <= 0;
              return (
                <div key={p.id} className="relative">
                <button
                  onClick={() => onTileClick(p)}
                  disabled={out}
                  className="group flex w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-left transition-all enabled:hover:border-[var(--color-border-focus)] enabled:hover:shadow-[var(--shadow-md)] disabled:opacity-50"
                >
                  <div className="relative aspect-[4/3] bg-[var(--color-bg-surface)]">
                    {p.image && (
                      <Image src={p.image} alt={p.name} fill sizes="200px" className="object-cover" />
                    )}
                    <span
                      className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        out
                          ? "bg-[var(--color-danger)] text-white"
                          : p.low
                            ? "bg-[color-mix(in_oklab,var(--color-clay-500)_85%,transparent)] text-white"
                            : "bg-black/60 text-white"
                      }`}
                    >
                      {out ? "OUT" : `${p.qtyOnHand} ${p.unit === "Cubic Yard" ? "cy" : p.unit.toLowerCase()}`}
                    </span>
                    {isBulkUnit(p.unit) && !out && (
                      <span className="absolute bottom-1.5 right-1.5 rounded-full bg-[var(--color-moss-600)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        choose qty
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-2.5">
                    <span className="line-clamp-2 text-sm font-medium leading-snug text-[var(--color-text-primary)]">
                      {p.name}
                    </span>
                    <span className="mt-auto pt-1.5 font-display text-sm font-bold text-[var(--color-text-brand)]">
                      {p.price}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => toggleFav(p.id)}
                  aria-label={favorites.has(p.id) ? "Remove favorite" : "Add favorite"}
                  className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-black/40 hover:bg-black/60"
                >
                  <Star
                    className={`h-3.5 w-3.5 ${favorites.has(p.id) ? "text-[var(--color-clay-500)]" : "text-white"}`}
                    fill={favorites.has(p.id) ? "currentColor" : "none"}
                    strokeWidth={1.75}
                  />
                </button>
                </div>
              );
            })}
            {visible.length === 0 && (
              <div className="col-span-full grid place-items-center gap-2 py-16 text-center text-sm text-[var(--color-text-muted)]">
                {cat === "Favorites" ? (
                  <p>No favorites yet — tap the ☆ on a product to pin it here.</p>
                ) : (
                  <p>No products match{search ? ` "${search}"` : " this filter"}.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Ticket ───────────────────────────────────────────────────── */}
      <aside className="flex min-h-0 flex-col border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] lg:border-l lg:border-t-0">
        {/* Drawer session bar */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-2 text-xs">
          {session ? (
            <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
              <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
              Drawer <span className="font-semibold text-[var(--color-text-primary)]">{session.number}</span> open · float ${session.openingFloat.toFixed(0)}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-[var(--color-text-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--color-text-muted)]" />
              Drawer closed
            </span>
          )}
          <div className="flex items-center gap-2">
            <a
              href={`/customer-display?ws=${encodeURIComponent(displayChannel)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open customer display"
              className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <Monitor className="h-3.5 w-3.5" /> Display
            </a>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${termMode === "live" ? "bg-[var(--color-moss-100)] text-[var(--color-moss-700)]" : "bg-[color-mix(in_oklab,var(--color-clay-500)_15%,transparent)] text-[var(--color-warning)]"}`}>
              {termMode === "live" ? "TERMINAL LIVE" : "TERMINAL SIM"}
            </span>
            {session ? (
              <button onClick={startClose} className="font-medium text-[var(--color-text-brand)] hover:underline">
                Close drawer
              </button>
            ) : (
              <button onClick={() => setDrawerDialog("open")} className="font-medium text-[var(--color-text-brand)] hover:underline">
                Open drawer
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">Current Order</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {itemCount} {itemCount === 1 ? "item" : "items"} · {customer ? customer.name : "Walk-in"}
              {wholesalePricing && (
                <span className="ml-1.5 rounded-full bg-[color-mix(in_oklab,var(--color-action)_15%,transparent)] px-1.5 py-0.5 font-semibold uppercase tracking-wide text-[var(--color-action)]">
                  Wholesale pricing
                </span>
              )}
              {settings?.loyalty?.enabled && customer && (customer.account?.loyaltyPoints ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-[var(--color-moss-100)] px-1.5 py-0.5 font-medium text-[var(--color-moss-700)]">
                  ★ {customer.account?.loyaltyPoints} pts
                </span>
              )}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCustOpen(true)}>
            <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {customer ? "Change" : "Customer"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {receipt && (
            <div
              className={`m-3 rounded-[var(--radius-md)] border p-3 ${
                receipt.pending
                  ? "border-[color-mix(in_oklab,var(--color-clay-500)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-clay-500)_10%,transparent)] text-[var(--color-warning)]"
                  : "border-[var(--color-moss-300)] bg-[var(--color-moss-100)] text-[var(--color-moss-800)]"
              }`}
            >
              <div className="flex items-start gap-2">
                {receipt.pending ? (
                  <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-warning)]" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-moss-700)]" />
                )}
                <div>
                  <p className="text-sm font-semibold">
                    {receipt.pending ? "Saved offline — pending sync" : `Order ${receipt.number} complete`}
                  </p>
                  <p className="text-xs">
                    ${receipt.total.toFixed(2)} · {receipt.pending ? "records when the connection returns." : "stock updated."}
                  </p>
                </div>
              </div>
              {lastOrder && (
                <button
                  onClick={() => printReceipt(lastOrder, settings, COMPANY.phone)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-moss-300)] bg-white/40 py-1.5 text-xs font-semibold text-[var(--color-moss-800)] hover:bg-white/70"
                >
                  <Printer className="h-3.5 w-3.5" /> Print receipt
                </button>
              )}
            </div>
          )}
          {lines.length === 0 && !receipt ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[var(--color-text-muted)]">
              <CreditCard className="h-8 w-8 opacity-40" strokeWidth={1.5} aria-hidden />
              <p className="text-sm">Tap a product to start an order. Bulk items let you pick a measurement.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {lines.map((l) => (
                <li key={l.key} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text-primary)]">{l.name}</p>
                    <span className="shrink-0 text-sm font-semibold text-[var(--color-text-primary)]">
                      ${(l.packs * l.pricePerPack).toFixed(2)}
                    </span>
                    <button onClick={() => removeLine(l.key)} className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]" aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {/* Quantity — steppers + type-to-edit */}
                    <div className="flex items-center gap-1">
                      <button onClick={() => bump(l.key, -1)} className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]" aria-label="Decrease">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={l.packs}
                        onChange={(e) => setQty(l.key, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        aria-label="Quantity"
                        className="h-7 w-14 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-center text-sm font-semibold text-[var(--color-text-primary)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
                      />
                      <button onClick={() => bump(l.key, 1)} className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]" aria-label="Increase">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Unit price — type-to-edit */}
                    <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                      <span>$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={l.pricePerPack}
                        onChange={(e) => setPrice(l.key, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        aria-label="Unit price"
                        className="h-7 w-20 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-1.5 text-right text-sm text-[var(--color-text-primary)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
                      />
                      <span className="whitespace-nowrap">/{l.unitLabel}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] px-4 py-4">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-[var(--color-text-secondary)]">
              <dt>Subtotal</dt>
              <dd>${subtotal.toFixed(2)}</dd>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-[var(--color-moss-700)]">
                <dt>Discount{discount?.mode === "percent" ? ` (${discount.value}%)` : ""}</dt>
                <dd>−${discountAmount.toFixed(2)}</dd>
              </div>
            )}
            <div className="flex justify-between text-[var(--color-text-secondary)]">
              <dt>Tax ({(taxRate * 100).toFixed(2)}%)</dt>
              <dd>${tax.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between border-t border-[var(--color-border)] pt-2 font-display text-lg font-bold text-[var(--color-text-primary)]">
              <dt>Total</dt>
              <dd>${total.toFixed(2)}</dd>
            </div>
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={!lines.length}
              onClick={() => {
                setDiscountInput(discount ? { mode: discount.mode, value: String(discount.value) } : { mode: "percent", value: "" });
                setDiscountOpen(true);
              }}
            >
              <Percent className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {discountAmount > 0 ? `−$${discountAmount.toFixed(2)}` : "Discount"}
            </Button>
            <Button disabled={!lines.length} onClick={openPayment}>
              <CreditCard className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Charge
            </Button>
          </div>
        </div>
      </aside>

      {/* ── Measurement picker ───────────────────────────────────────── */}
      {picker && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setPicker(null)}>
          <div
            ref={pickerRef}
            className="w-full max-w-md overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-xl)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
              <div>
                <h3 className="font-display text-base font-bold text-[var(--color-text-primary)]">{picker.name}</h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {picker.qtyOnHand} cu yd on hand · {picker.price}
                </p>
              </div>
              <button onClick={() => setPicker(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Choose a measurement
              </p>
              <div className="grid grid-cols-2 gap-2">
                {uomOptions(picker.unit, picker.price).map((opt) => {
                  const tooMuch = opt.baseQty > picker.qtyOnHand;
                  return (
                    <button
                      key={opt.label}
                      disabled={tooMuch}
                      onClick={() => addLine(picker, opt)}
                      className="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2.5 text-left transition-colors enabled:hover:border-[var(--color-action)] enabled:hover:bg-[var(--color-bg-surface)] disabled:opacity-40"
                    >
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">{opt.label}</span>
                      <span className="text-xs font-semibold text-[var(--color-text-brand)]">${opt.price.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Custom cubic yards
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.25"
                    step="0.25"
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    placeholder="e.g. 12.5"
                    className="h-9 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
                  />
                  <Button
                    size="md"
                    disabled={!customQty || Number(customQty) <= 0 || Number(customQty) > picker.qtyOnHand}
                    onClick={() => addLine(picker, customOption(picker.unit, picker.price, Number(customQty)))}
                  >
                    Add
                  </Button>
                </div>
                {Number(customQty) > picker.qtyOnHand && (
                  <p className="mt-1 text-xs text-[var(--color-warning)]">Only {picker.qtyOnHand} cu yd on hand.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment capture (mock Stripe Terminal) ───────────────────── */}
      {payOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={() => payStage === "idle" && setPayOpen(false)}
        >
          <div
            ref={payRef}
            className="w-full max-w-sm overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-xl)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
              <h3 className="font-display text-base font-bold text-[var(--color-text-primary)]">
                Take Payment
              </h3>
              {payStage === "idle" && (
                <button onClick={() => setPayOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="p-5">
              <div className="mb-4 text-center">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Amount due</p>
                <p className="font-display text-4xl font-extrabold text-[var(--color-text-primary)]">
                  ${total.toFixed(2)}
                </p>
              </div>

              {payStage === "processing" ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-[var(--color-action)]" />
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    {payMethod === "terminal"
                      ? "Insert, tap, or swipe card on the Ingenico terminal…"
                      : payMethod === "cash"
                        ? "Recording cash payment…"
                        : payMethod === "account"
                          ? "Posting to customer account…"
                          : "Processing card…"}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {payMethod === "terminal"
                      ? `Ingenico DX8000 · ${physTerminal ? physTerminal.mode : "bridge offline"}`
                      : payMethod === "account"
                        ? "On account (billed later)"
                        : "Stripe Terminal (mock)"}
                  </p>
                </div>
              ) : (
                <>
                  <div className={`mb-2 grid gap-2 ${TENDERS.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
                    {TENDERS.map((m) => (
                      <button
                        key={m}
                        onClick={() => setPayMethod(m)}
                        className={`rounded-[var(--radius-md)] border px-2 py-2.5 text-xs font-semibold capitalize ${
                          payMethod === m
                            ? "border-[var(--color-action)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
                            : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
                        }`}
                      >
                        {m === "terminal" ? "Terminal" : m}
                      </button>
                    ))}
                  </div>
                  {payMethod === "cash" && (
                    <div className="mb-3">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                        Cash tendered
                      </label>
                      <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5">
                        <span className="text-lg text-[var(--color-text-muted)]">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={cashTendered}
                          onChange={(e) => setCashTendered(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder={total.toFixed(2)}
                          className="h-10 flex-1 bg-transparent text-right text-lg font-semibold text-[var(--color-text-primary)] outline-none"
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-1.5">
                        <button
                          onClick={() => setCashTendered(total.toFixed(2))}
                          className="rounded-[var(--radius-md)] border border-[var(--color-border)] py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
                        >
                          Exact
                        </button>
                        {tenderSuggestions.map((v) => (
                          <button
                            key={v}
                            onClick={() => setCashTendered(String(v))}
                            className="rounded-[var(--radius-md)] border border-[var(--color-border)] py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
                          >
                            ${v}
                          </button>
                        ))}
                      </div>
                      {/* Touch number-pad for cash entry (tablet-friendly). */}
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => pushDigit(d)}
                            aria-label={d === "back" ? "Backspace" : d}
                            className="rounded-[var(--radius-md)] border border-[var(--color-border)] py-3 text-lg font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] active:translate-y-px"
                          >
                            {d === "back" ? "⌫" : d}
                          </button>
                        ))}
                      </div>
                      {Number(cashTendered) > 0 && (
                        <div className="mt-2 flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-moss-100)] px-3 py-2 text-sm">
                          <span className="font-medium text-[var(--color-moss-700)]">Change due</span>
                          <span className="font-display text-lg font-bold text-[var(--color-moss-700)]">${changeDue.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {payMethod === "account" && (
                    <p className="mb-3 text-xs text-[var(--color-text-secondary)]">
                      {customer
                        ? `Bill to ${customer.name} — added to account balance (Due).`
                        : "Select a customer (top of ticket) to bill on account."}
                    </p>
                  )}
                  {payMethod === "terminal" && (
                    <p className="mb-3 flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                      <span
                        className={`h-2 w-2 rounded-full ${physTerminal ? (physTerminal.mode === "live" ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]") : "bg-[var(--color-danger)]"}`}
                      />
                      {physTerminal
                        ? `Ingenico DX8000 ${physTerminal.mode === "live" ? "ready" : `${physTerminal.mode === "off" ? "(not set up)" : "(simulated)"}${terminalSimBlocked ? " · card sales disabled" : ""}`}${physTerminal.host ? ` · ${physTerminal.host}` : ""}`
                        : "Hardware bridge offline — start it to charge the terminal."}
                    </p>
                  )}
                  {error && <p className="mb-3 text-center text-sm text-[var(--color-danger)]">{error}</p>}
                  <Button
                    className="w-full"
                    onClick={completeSale}
                    disabled={charging || (payMethod === "terminal" && terminalSimBlocked)}
                  >
                    <CreditCard className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    {payMethod === "account" ? "Place on account" : `Charge $${total.toFixed(2)}`}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Custom line item ─────────────────────────────────────────── */}
      {customOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setCustomOpen(false)}>
          <div
            ref={customRef}
            className="w-full max-w-sm overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-xl)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
              <h3 className="font-display text-base font-bold text-[var(--color-text-primary)]">Custom item</h3>
              <button onClick={() => setCustomOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Description</label>
                <input
                  autoFocus
                  value={custItem.name}
                  onChange={(e) => setCustItem((c) => ({ ...c, name: e.target.value }))}
                  placeholder="e.g. Special-order pallet, restocking fee…"
                  className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Price</label>
                  <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5">
                    <span className="text-[var(--color-text-muted)]">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={custItem.price}
                      onChange={(e) => setCustItem((c) => ({ ...c, price: e.target.value }))}
                      placeholder="0.00"
                      className="h-10 w-full bg-transparent text-right text-sm text-[var(--color-text-primary)] outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Qty</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    inputMode="decimal"
                    value={custItem.qty}
                    onChange={(e) => setCustItem((c) => ({ ...c, qty: e.target.value }))}
                    className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
                  />
                </div>
              </div>
              <Button className="w-full" disabled={!(Number(custItem.price) >= 0) || custItem.price === ""} onClick={addCustomLine}>
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Add to cart
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Discount ─────────────────────────────────────────────────── */}
      {discountOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setDiscountOpen(false)}>
          <div ref={discountRef} className="w-full max-w-xs overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-xl)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
              <h3 className="font-display text-base font-bold text-[var(--color-text-primary)]">Order discount</h3>
              <button onClick={() => setDiscountOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div className="flex rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-0.5 text-sm">
                {(["percent", "amount"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setDiscountInput((d) => ({ ...d, mode: m }))}
                    className={`flex-1 rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 font-medium transition ${
                      discountInput.mode === m ? "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"
                    }`}
                  >
                    {m === "percent" ? "% Percent" : "$ Amount"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3">
                <span className="text-lg text-[var(--color-text-muted)]">{discountInput.mode === "percent" ? "%" : "$"}</span>
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step={discountInput.mode === "percent" ? "1" : "0.01"}
                  value={discountInput.value}
                  onChange={(e) => setDiscountInput((d) => ({ ...d, value: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && applyDiscount()}
                  placeholder="0"
                  className="h-10 flex-1 bg-transparent text-right text-lg font-semibold text-[var(--color-text-primary)] outline-none"
                />
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">Applied to the ${subtotal.toFixed(2)} subtotal, before tax.</p>
              <div className="flex gap-2 pt-1">
                {discount && (
                  <Button variant="secondary" onClick={() => { setDiscount(null); setDiscountOpen(false); }}>
                    Remove
                  </Button>
                )}
                <Button className="flex-1" onClick={applyDiscount}>Apply</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer picker ──────────────────────────────────────────── */}
      {custOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setCustOpen(false)}>
          <div
            ref={custRef}
            className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-xl)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
              <h3 className="font-display text-base font-bold text-[var(--color-text-primary)]">Customer</h3>
              <button onClick={() => setCustOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-3">
              <input
                value={custQuery}
                onChange={(e) => setCustQuery(e.target.value)}
                placeholder="Search name / phone…"
                className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
              />
            </div>
            {custAdding ? (
              <div className="space-y-2 px-3 pb-3">
                <input
                  autoFocus
                  value={newCust.name}
                  onChange={(e) => setNewCust((c) => ({ ...c, name: e.target.value }))}
                  placeholder="Full name *"
                  className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
                />
                <input
                  value={newCust.phone}
                  onChange={(e) => setNewCust((c) => ({ ...c, phone: e.target.value }))}
                  placeholder="Phone"
                  className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
                />
                <select
                  value={newCust.type}
                  onChange={(e) => setNewCust((c) => ({ ...c, type: e.target.value as Customer["type"] }))}
                  className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
                >
                  <option value="retail">Retail</option>
                  <option value="contractor">Contractor (NET account)</option>
                  <option value="wholesale">Wholesale</option>
                </select>
                <div className="flex gap-2 pt-1">
                  <Button className="flex-1" disabled={custSaving || !newCust.name.trim()} onClick={() => void addCustomer()}>
                    {custSaving ? "Saving…" : "Save & select"}
                  </Button>
                  <Button variant="secondary" onClick={() => setCustAdding(false)} disabled={custSaving}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="min-h-0 flex-1 overflow-auto px-2 pb-2">
              <li>
                <button
                  onClick={() => { setCustomer(null); setCustOpen(false); }}
                  className="w-full rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
                >
                  Walk-in (no account)
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setNewCust((c) => ({ ...c, name: custQuery.trim() })); setCustAdding(true); }}
                  className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm font-medium text-[var(--color-text-brand)] hover:bg-[var(--color-bg-surface)]"
                >
                  <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Add new customer
                </button>
              </li>
              {customers
                .filter((c) => {
                  const q = custQuery.toLowerCase();
                  return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.number.toLowerCase().includes(q);
                })
                .map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => { setCustomer(c); setCustOpen(false); }}
                      className="flex w-full items-center justify-between rounded-[var(--radius-md)] px-3 py-2.5 text-left hover:bg-[var(--color-bg-surface)]"
                    >
                      <span>
                        <span className="block text-sm font-medium text-[var(--color-text-primary)]">{c.name}</span>
                        <span className="block text-xs text-[var(--color-text-muted)]">
                          {c.number} · {c.type}
                          {c.account.openDebt > 0 ? ` · Due $${c.account.openDebt.toFixed(2)}` : ""}
                        </span>
                      </span>
                      {c.type === "contractor" && (
                        <span className="rounded-full bg-[var(--color-moss-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-moss-700)]">
                          NET
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Drawer: open / close ─────────────────────────────────────── */}
      {drawerDialog !== "none" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => !drawerBusy && setDrawerDialog("none")}>
          <div ref={drawerRef} className="w-full max-w-sm overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-xl)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
              <h3 className="font-display text-base font-bold text-[var(--color-text-primary)]">
                {drawerDialog === "open" ? "Open Register Drawer" : "Close Register Drawer"}
              </h3>
              <button onClick={() => setDrawerDialog("none")} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5">
              {drawerDialog === "open" ? (
                <>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Starting cash float
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-lg text-[var(--color-text-muted)]">$</span>
                    <input
                      type="number"
                      min="0"
                      value={floatInput}
                      onChange={(e) => setFloatInput(e.target.value)}
                      className="h-10 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
                    />
                  </div>
                  <Button className="mt-4 w-full" onClick={openDrawer} disabled={drawerBusy}>
                    {drawerBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Open Drawer
                  </Button>
                </>
              ) : (
                <>
                  <dl className="mb-4 space-y-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3 text-sm">
                    <div className="flex justify-between text-[var(--color-text-secondary)]"><dt>Opening float</dt><dd>${(closePreview?.openingFloat ?? session?.openingFloat ?? 0).toFixed(2)}</dd></div>
                    <div className="flex justify-between text-[var(--color-text-secondary)]"><dt>Cash sales</dt><dd>${(closePreview?.cashSales ?? 0).toFixed(2)}</dd></div>
                    <div className="flex justify-between text-[var(--color-text-secondary)]"><dt>Card sales</dt><dd>${(closePreview?.cardSales ?? 0).toFixed(2)}</dd></div>
                    <div className="flex justify-between border-t border-[var(--color-border)] pt-1.5 font-semibold text-[var(--color-text-primary)]"><dt>Expected in drawer</dt><dd>${(closePreview?.expectedCash ?? 0).toFixed(2)}</dd></div>
                  </dl>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Counted cash
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-lg text-[var(--color-text-muted)]">$</span>
                    <input
                      type="number"
                      min="0"
                      value={countInput}
                      onChange={(e) => setCountInput(e.target.value)}
                      placeholder="0.00"
                      className="h-10 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
                    />
                  </div>
                  {countInput !== "" && closePreview && (
                    <p className={`mt-2 text-sm font-medium ${Number(countInput) - closePreview.expectedCash === 0 ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}>
                      Variance: ${(Number(countInput) - closePreview.expectedCash).toFixed(2)}
                    </p>
                  )}
                  <Button className="mt-4 w-full" onClick={closeDrawer} disabled={drawerBusy || countInput === ""}>
                    {drawerBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Close Drawer &amp; Z-out
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
