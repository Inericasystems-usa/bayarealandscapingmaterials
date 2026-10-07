"use client";

import { useEffect, useState } from "react";
import {
  MapPin,
  Clock,
  Truck,
  Phone,
  Package,
  Navigation,
  User,
  Plus,
  Pencil,
  Trash2,
  Wrench,
  X,
  Camera,
  Check,
} from "lucide-react";
import { Button } from "@balm/ui";
import {
  api,
  type Truck as FleetTruck,
  type Driver,
  type Delivery,
  type DeliveryStatus,
} from "@/lib/api-client";
import { STAGE_META, stageColor } from "@/lib/delivery-stages";
import { PodCapture } from "./PodCapture";
import dynamic from "next/dynamic";

// Leaflet touches `window`, so load the map client-side only.
const FleetMap = dynamic(() => import("./FleetMap").then((m) => m.FleetMap), {
  ssr: false,
  loading: () => (
    <div className="mb-6 h-72 w-full animate-pulse rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)]" />
  ),
});

// ── Delivery board columns ───────────────────────────────────────────
const BOARD_COLUMNS: { key: DeliveryStatus; title: string; tint: string }[] = [
  { key: "scheduled", title: "Scheduled", tint: "var(--color-stone-500)" },
  { key: "loading", title: "Loading", tint: "var(--color-warning)" },
  { key: "enroute", title: "En Route", tint: "var(--color-info)" },
  { key: "delivered", title: "Delivered", tint: "var(--color-success)" },
];

// Forward order for advancing a delivery one step at a time.
const STATUS_FLOW: DeliveryStatus[] = ["scheduled", "loading", "enroute", "delivered"];

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  scheduled: "Scheduled",
  loading: "Loading",
  enroute: "En Route",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// ── Shared bits ──────────────────────────────────────────────────────
const inputCls =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

const TRUCK_STATUS: Record<FleetTruck["status"], { label: string; color: string }> = {
  available: { label: "Available", color: "var(--color-success)" },
  on_route: { label: "On Route", color: "var(--color-info)" },
  maintenance: { label: "Maintenance", color: "var(--color-warning)" },
};

// ── Page ─────────────────────────────────────────────────────────────
export default function DispatchPage() {
  const [tab, setTab] = useState<"board" | "fleet">("board");

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div>
          <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
            Dispatch &amp; Delivery
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Live delivery board &amp; fleet tracking
          </p>
        </div>

        {/* Segmented control */}
        <div className="inline-flex rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-0.5">
          {(
            [
              { key: "board", label: "Delivery Board" },
              { key: "fleet", label: "Fleet" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-[var(--radius-sm)] px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "board" ? <DeliveryBoard /> : <FleetTab />}
    </div>
  );
}

// ── Delivery Board tab (LIVE) ────────────────────────────────────────
type DeliveryForm = {
  customer: string;
  address: string;
  window: string;
  items: string;
  phone: string;
};

const EMPTY_DELIVERY: DeliveryForm = {
  customer: "",
  address: "",
  window: "",
  items: "",
  phone: "",
};

function DeliveryBoard() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [trucks, setTrucks] = useState<FleetTruck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [form, setForm] = useState<DeliveryForm | null>(null);
  const [podFor, setPodFor] = useState<Delivery | null>(null);

  async function refetch() {
    try {
      const [del, t, d] = await Promise.all([
        api.listDeliveries(),
        api.listTrucks(),
        api.listDrivers(),
      ]);
      setDeliveries(del);
      setTrucks(t);
      setDrivers(d);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refetch();
    // Poll so driver stage updates appear live on the board.
    const id = setInterval(() => refetch(), 6000);
    return () => clearInterval(id);
  }, []);

  // wrap a mutation so failures surface the offline note + always refetch
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      await refetch();
    }
  }

  function assignTruck(id: string, truckId: string) {
    run(() => api.assignDelivery(id, { truckId: truckId === "" ? null : truckId }));
  }
  function assignDriver(id: string, driverId: string) {
    run(() => api.assignDelivery(id, { driverId: driverId === "" ? null : driverId }));
  }
  function setStatus(id: string, status: DeliveryStatus) {
    run(() => api.setDeliveryStatus(id, status));
  }
  function advance(d: Delivery) {
    const i = STATUS_FLOW.indexOf(d.status);
    const next = i >= 0 ? STATUS_FLOW[i + 1] : undefined;
    if (!next) return;
    setStatus(d.id, next);
  }
  function removeDelivery(d: Delivery) {
    if (!confirm(`Delete delivery ${d.code}?`)) return;
    run(() => api.deleteDelivery(d.id));
  }
  function submitDelivery(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const body = { ...form, status: "scheduled" as DeliveryStatus };
    setForm(null);
    run(() => api.createDelivery(body));
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* Sub-header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-3">
        <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
          <Package className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {deliveries.length} delivery{deliveries.length === 1 ? "" : "ies"} on the board
        </span>
        <Button size="sm" onClick={() => setForm({ ...EMPTY_DELIVERY })}>
          <Plus className="h-4 w-4" /> New Delivery
        </Button>
      </div>

      {offline && <OfflineNote />}

      {loading ? (
        <p className="p-5 text-sm text-[var(--color-text-muted)]">Loading deliveries…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          {BOARD_COLUMNS.map((col) => {
            const jobs = deliveries.filter((d) => d.status === col.key);
            return (
              <section key={col.key} className="flex min-w-0 flex-col">
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: col.tint }}
                    aria-hidden
                  />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    {col.title}
                  </h2>
                  <span className="ml-auto rounded-full bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">
                    {jobs.length}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {jobs.map((j) => {
                    const canAdvance = STATUS_FLOW.indexOf(j.status) < STATUS_FLOW.length - 1;
                    return (
                      <article
                        key={j.id}
                        className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3.5 shadow-[var(--shadow-sm)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-[var(--color-text-muted)]">
                            {j.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeDelivery(j)}
                            className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-danger)]"
                            aria-label="Delete delivery"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <h3 className="mt-1 font-medium text-[var(--color-text-primary)]">
                          {j.customer}
                        </h3>
                        <span
                          className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                          style={{ background: stageColor(j.stage) }}
                        >
                          {STAGE_META[j.stage].label}
                        </span>
                        {j.pod && (
                          <span
                            className="ml-1 inline-flex items-center gap-1 rounded-full bg-[var(--color-moss-100)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-moss-700)]"
                            title={`Received by ${j.pod.receivedBy || "—"} · ${j.pod.photos.length} photo(s)${j.pod.signature ? " · signed" : ""}`}
                          >
                            <Check className="h-3 w-3" aria-hidden /> POD
                          </span>
                        )}
                        <ul className="mt-2 space-y-1.5 text-xs text-[var(--color-text-secondary)]">
                          <li className="flex items-start gap-1.5">
                            <MapPin
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                            {j.address}
                          </li>
                          <li className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                            {j.window || "—"}
                          </li>
                          <li className="flex items-center gap-1.5">
                            <Package
                              className="h-3.5 w-3.5 shrink-0"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                            {j.items || "—"}
                          </li>
                          <li className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                            {j.phone || "—"}
                          </li>
                          <li className="flex items-center gap-1.5">
                            <Truck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                            {j.truckNumber || "Unassigned"}
                          </li>
                          <li className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                            {j.driverName || "Unassigned"}
                          </li>
                        </ul>

                        {/* Controls */}
                        <div className="mt-3 flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
                          <select
                            value={j.truckId ?? ""}
                            onChange={(e) => assignTruck(j.id, e.target.value)}
                            className={inputCls}
                            aria-label="Assign truck"
                          >
                            <option value="">— Truck —</option>
                            {trucks.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.number}
                              </option>
                            ))}
                          </select>
                          <select
                            value={j.driverId ?? ""}
                            onChange={(e) => assignDriver(j.id, e.target.value)}
                            className={inputCls}
                            aria-label="Assign driver"
                          >
                            <option value="">— Driver —</option>
                            {drivers.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-2">
                            <select
                              value={j.status}
                              onChange={(e) =>
                                setStatus(j.id, e.target.value as DeliveryStatus)
                              }
                              className={`${inputCls} flex-1`}
                              aria-label="Delivery status"
                            >
                              {STATUS_FLOW.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABEL[s]}
                                </option>
                              ))}
                              {j.status === "cancelled" && (
                                <option value="cancelled">Cancelled</option>
                              )}
                            </select>
                            {canAdvance && (
                              <Button size="sm" variant="secondary" onClick={() => advance(j)}>
                                <Navigation className="h-3.5 w-3.5" /> Advance
                              </Button>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant={j.pod ? "secondary" : undefined}
                            className="w-full"
                            onClick={() => setPodFor(j)}
                          >
                            <Camera className="h-3.5 w-3.5" /> {j.pod ? "POD captured · view / redo" : "Capture POD"}
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                  {jobs.length === 0 && (
                    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-6 text-center text-xs text-[var(--color-text-muted)]">
                      No loads
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Proof-of-delivery capture */}
      {podFor && (
        <PodCapture
          delivery={podFor}
          onClose={() => setPodFor(null)}
          onSaved={(d) => setDeliveries((list) => list.map((x) => (x.id === d.id ? d : x)))}
        />
      )}

      {/* New delivery modal */}
      {form && (
        <Modal title="New Delivery" onClose={() => setForm(null)}>
          <form onSubmit={submitDelivery} className="space-y-4">
            <Field label="Customer">
              <input
                required
                value={form.customer}
                onChange={(e) => setForm({ ...form, customer: e.target.value })}
                placeholder="Sequoia Landscapes"
                className={inputCls}
              />
            </Field>
            <Field label="Address">
              <input
                required
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="1820 Solano Ave, Berkeley"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Window">
                <input
                  value={form.window}
                  onChange={(e) => setForm({ ...form, window: e.target.value })}
                  placeholder="Today · 9–11 AM"
                  className={inputCls}
                />
              </Field>
              <Field label="Phone">
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(510) 555-0142"
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Items">
              <input
                value={form.items}
                onChange={(e) => setForm({ ...form, items: e.target.value })}
                placeholder="6 yd Brown Mulch · 2 yd DG"
                className={inputCls}
              />
            </Field>
            <Button type="submit" className="w-full">
              Create delivery
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Shared offline note ──────────────────────────────────────────────
function OfflineNote() {
  return (
    <div className="mx-5 mt-4 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-bg-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text-secondary)]">
      Can&apos;t reach the API — start it with{" "}
      <code className="rounded bg-[var(--color-bg-elevated)] px-1 py-0.5 font-mono text-xs">
        pnpm dev
      </code>{" "}
      in <code className="font-mono text-xs">apps/api</code>.
    </div>
  );
}

// ── Fleet tab ────────────────────────────────────────────────────────
type TruckForm = {
  number: string;
  type: string;
  capacityCyd: string;
  plate: string;
  status: FleetTruck["status"];
  lat: string;
  lng: string;
  notes: string;
};

const EMPTY_TRUCK: TruckForm = {
  number: "",
  type: "",
  capacityCyd: "",
  plate: "",
  status: "available",
  lat: "37.9358",
  lng: "-122.3477",
  notes: "",
};

type DriverForm = {
  name: string;
  phone: string;
  license: string;
  status: Driver["status"];
  notes: string;
};

const EMPTY_DRIVER: DriverForm = {
  name: "",
  phone: "",
  license: "",
  status: "active",
  notes: "",
};

function FleetTab() {
  const [trucks, setTrucks] = useState<FleetTruck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const [truckForm, setTruckForm] = useState<TruckForm | null>(null);
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null);
  const [driverForm, setDriverForm] = useState<DriverForm | null>(null);
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);

  async function refetch() {
    try {
      const [t, d] = await Promise.all([api.listTrucks(), api.listDrivers()]);
      setTrucks(t);
      setDrivers(d);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refetch();
    // Poll trucks every 4s so live GPS positions (telematics walk) update.
    const id = setInterval(async () => {
      try {
        const t = await api.listTrucks();
        setTrucks(t);
        setOffline(false);
      } catch {
        setOffline(true);
      }
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // wrap a mutation so failures surface the offline note + always refetch
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      await refetch();
    }
  }

  // ── Truck handlers ──
  function openAddTruck() {
    setEditingTruckId(null);
    setTruckForm({ ...EMPTY_TRUCK });
  }
  function openEditTruck(t: FleetTruck) {
    setEditingTruckId(t.id);
    setTruckForm({
      number: t.number,
      type: t.type,
      capacityCyd: String(t.capacityCyd ?? ""),
      plate: t.plate,
      status: t.status,
      lat: String(t.lat ?? ""),
      lng: String(t.lng ?? ""),
      notes: t.notes ?? "",
    });
  }
  function submitTruck(e: React.FormEvent) {
    e.preventDefault();
    if (!truckForm) return;
    const body = {
      number: truckForm.number,
      type: truckForm.type,
      capacityCyd: Number(truckForm.capacityCyd) || 0,
      plate: truckForm.plate,
      status: truckForm.status,
      lat: Number(truckForm.lat) || 0,
      lng: Number(truckForm.lng) || 0,
      notes: truckForm.notes,
    };
    const id = editingTruckId;
    setTruckForm(null);
    setEditingTruckId(null);
    run(() => (id ? api.updateTruck(id, body) : api.createTruck(body)));
  }
  function deleteTruck(t: FleetTruck) {
    if (!confirm(`Delete truck ${t.number}?`)) return;
    run(() => api.deleteTruck(t.id));
  }
  function assignDriver(truckId: string, driverId: string) {
    run(() => api.assignDriver(truckId, driverId === "" ? null : driverId));
  }
  function pingGps(t: FleetTruck) {
    const lat = (t.lat ?? 0) + (Math.random() - 0.5) * 0.01;
    const lng = (t.lng ?? 0) + (Math.random() - 0.5) * 0.01;
    run(() => api.updateTruckLocation(t.id, lat, lng));
  }

  // ── Driver handlers ──
  function openAddDriver() {
    setEditingDriverId(null);
    setDriverForm({ ...EMPTY_DRIVER });
  }
  function openEditDriver(d: Driver) {
    setEditingDriverId(d.id);
    setDriverForm({
      name: d.name,
      phone: d.phone,
      license: d.license,
      status: d.status,
      notes: d.notes ?? "",
    });
  }
  function submitDriver(e: React.FormEvent) {
    e.preventDefault();
    if (!driverForm) return;
    const body = { ...driverForm };
    const id = editingDriverId;
    setDriverForm(null);
    setEditingDriverId(null);
    run(() => (id ? api.updateDriver(id, body) : api.createDriver(body)));
  }
  function deleteDriver(d: Driver) {
    if (!confirm(`Delete driver ${d.name}?`)) return;
    run(() => api.deleteDriver(d.id));
  }

  const counts = {
    available: trucks.filter((t) => t.status === "available").length,
    on_route: trucks.filter((t) => t.status === "on_route").length,
    maintenance: trucks.filter((t) => t.status === "maintenance").length,
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* Sub-header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
            <Truck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {trucks.length} truck{trucks.length === 1 ? "" : "s"}
          </span>
          {(["available", "on_route", "maintenance"] as const).map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-bg-surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: TRUCK_STATUS[s].color }}
                aria-hidden
              />
              {counts[s]} {TRUCK_STATUS[s].label}
            </span>
          ))}
        </div>
        <Button size="sm" onClick={openAddTruck}>
          <Plus className="h-4 w-4" /> Add Truck
        </Button>
      </div>

      {offline && <OfflineNote />}

      <div className="p-5">
        {loading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading fleet…</p>
        ) : (
          <>
            {/* Live yard map */}
            <FleetMap trucks={trucks} />

            {/* Truck grid */}
            {trucks.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-10 text-center text-sm text-[var(--color-text-muted)]">
                No trucks yet. Add one to start tracking your fleet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {trucks.map((t) => {
                  const st = TRUCK_STATUS[t.status];
                  return (
                    <article
                      key={t.id}
                      className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
                            <Truck className="h-4.5 w-4.5" strokeWidth={1.75} />
                          </span>
                          <div>
                            <p className="font-semibold text-[var(--color-text-primary)]">
                              {t.number}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">
                              {t.type || "—"}
                            </p>
                          </div>
                        </div>
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{ background: `${st.color}22`, color: st.color }}
                        >
                          {t.status === "maintenance" && <Wrench className="h-3 w-3" />}
                          {st.label}
                        </span>
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div>
                          <dt className="text-[var(--color-text-muted)]">Capacity</dt>
                          <dd className="text-[var(--color-text-secondary)]">
                            {t.capacityCyd} cy
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-text-muted)]">Plate</dt>
                          <dd className="font-mono text-[var(--color-text-secondary)]">
                            {t.plate || "—"}
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-[var(--color-text-muted)]">Driver</dt>
                          <dd className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                            <User className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                            {t.driverName || "Unassigned"}
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-[var(--color-text-muted)]">GPS</dt>
                          <dd className="flex flex-wrap items-center gap-2 text-[var(--color-text-secondary)]">
                            <span className="inline-flex items-center gap-1.5 font-mono">
                              <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                              {t.lat.toFixed(4)}, {t.lng.toFixed(4)}
                            </span>
                            <a
                              href={`https://www.google.com/maps?q=${t.lat},${t.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--color-text-brand)] underline-offset-2 hover:underline"
                            >
                              Map
                            </a>
                            {t.lastSeen && (
                              <span className="text-[var(--color-text-muted)]">
                                last seen {new Date(t.lastSeen).toLocaleTimeString()}
                              </span>
                            )}
                          </dd>
                        </div>
                      </dl>

                      {/* Actions */}
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
                        <select
                          value={t.driverId ?? ""}
                          onChange={(e) => assignDriver(t.id, e.target.value)}
                          className={`${inputCls} flex-1 min-w-[120px]`}
                          aria-label="Assign driver"
                        >
                          <option value="">Unassigned</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" variant="secondary" onClick={() => pingGps(t)}>
                          <Navigation className="h-3.5 w-3.5" /> Update GPS
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEditTruck(t)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteTruck(t)}
                          className="text-[var(--color-danger)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Drivers section */}
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  <User className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Drivers
                  <span className="rounded-full bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">
                    {drivers.length}
                  </span>
                </h2>
                <Button size="sm" variant="secondary" onClick={openAddDriver}>
                  <Plus className="h-4 w-4" /> Add Driver
                </Button>
              </div>

              {drivers.length === 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-text-muted)]">
                  No drivers yet.
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {drivers.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3.5"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
                        <User className="h-4.5 w-4.5" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                            {d.name}
                          </p>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                            style={{
                              background:
                                d.status === "active"
                                  ? "var(--color-success)22"
                                  : "var(--color-stone-500)22",
                              color:
                                d.status === "active"
                                  ? "var(--color-success)"
                                  : "var(--color-text-muted)",
                            }}
                          >
                            {d.status}
                          </span>
                        </div>
                        <p className="truncate text-xs text-[var(--color-text-muted)]">
                          {d.phone || "—"}
                          {d.license ? ` · ${d.license}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditDriver(d)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteDriver(d)}
                          className="text-[var(--color-danger)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {/* Truck modal */}
      {truckForm && (
        <Modal
          title={editingTruckId ? "Edit Truck" : "Add Truck"}
          onClose={() => {
            setTruckForm(null);
            setEditingTruckId(null);
          }}
        >
          <form onSubmit={submitTruck} className="space-y-4">
            <Field label="Number">
              <input
                required
                value={truckForm.number}
                onChange={(e) => setTruckForm({ ...truckForm, number: e.target.value })}
                placeholder="T-12"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type">
                <input
                  value={truckForm.type}
                  onChange={(e) => setTruckForm({ ...truckForm, type: e.target.value })}
                  placeholder="Dump truck"
                  className={inputCls}
                />
              </Field>
              <Field label="Capacity (cy)">
                <input
                  type="number"
                  step="0.5"
                  value={truckForm.capacityCyd}
                  onChange={(e) => setTruckForm({ ...truckForm, capacityCyd: e.target.value })}
                  placeholder="10"
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Plate">
                <input
                  value={truckForm.plate}
                  onChange={(e) => setTruckForm({ ...truckForm, plate: e.target.value })}
                  placeholder="7ABC123"
                  className={inputCls}
                />
              </Field>
              <Field label="Status">
                <select
                  value={truckForm.status}
                  onChange={(e) =>
                    setTruckForm({
                      ...truckForm,
                      status: e.target.value as FleetTruck["status"],
                    })
                  }
                  className={inputCls}
                >
                  <option value="available">Available</option>
                  <option value="on_route">On Route</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Latitude">
                <input
                  type="number"
                  step="any"
                  value={truckForm.lat}
                  onChange={(e) => setTruckForm({ ...truckForm, lat: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Longitude">
                <input
                  type="number"
                  step="any"
                  value={truckForm.lng}
                  onChange={(e) => setTruckForm({ ...truckForm, lng: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Notes">
              <textarea
                value={truckForm.notes}
                onChange={(e) => setTruckForm({ ...truckForm, notes: e.target.value })}
                rows={2}
                className={`${inputCls} h-auto py-2`}
              />
            </Field>
            <Button type="submit" className="w-full">
              {editingTruckId ? "Save changes" : "Add truck"}
            </Button>
          </form>
        </Modal>
      )}

      {/* Driver modal */}
      {driverForm && (
        <Modal
          title={editingDriverId ? "Edit Driver" : "Add Driver"}
          onClose={() => {
            setDriverForm(null);
            setEditingDriverId(null);
          }}
        >
          <form onSubmit={submitDriver} className="space-y-4">
            <Field label="Name">
              <input
                required
                value={driverForm.name}
                onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
                placeholder="Luis Ortega"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Phone">
                <input
                  value={driverForm.phone}
                  onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
                  placeholder="(510) 555-0100"
                  className={inputCls}
                />
              </Field>
              <Field label="License">
                <input
                  value={driverForm.license}
                  onChange={(e) => setDriverForm({ ...driverForm, license: e.target.value })}
                  placeholder="CDL-A"
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Status">
              <select
                value={driverForm.status}
                onChange={(e) =>
                  setDriverForm({ ...driverForm, status: e.target.value as Driver["status"] })
                }
                className={inputCls}
              >
                <option value="active">Active</option>
                <option value="off">Off</option>
              </select>
            </Field>
            <Field label="Notes">
              <textarea
                value={driverForm.notes}
                onChange={(e) => setDriverForm({ ...driverForm, notes: e.target.value })}
                rows={2}
                className={`${inputCls} h-auto py-2`}
              />
            </Field>
            <Button type="submit" className="w-full">
              {editingDriverId ? "Save changes" : "Add driver"}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
