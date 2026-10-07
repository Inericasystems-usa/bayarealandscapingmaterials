"use client";

import { useState, useEffect } from "react";
import {
  Wallet,
  CreditCard,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@balm/ui";
import {
  api,
  type RegisterSession,
  type TerminalStatus,
} from "@/lib/api-client";

const money = (n: number) =>
  `$${(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "—";

type TestResult =
  | { ok: true; secret: string; simulated: boolean }
  | { ok: false; message: string };

export default function RegisterPage() {
  const [terminal, setTerminal] = useState<TerminalStatus | null>(null);
  const [active, setActive] = useState<RegisterSession | null>(null);
  const [sessions, setSessions] = useState<RegisterSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all([
      api.terminalStatus(),
      api.terminalRegisterActive(),
      api.listRegister(),
    ])
      .then(([status, act, list]) => {
        if (cancelled) return;
        setTerminal(status);
        setActive(act);
        setSessions(
          [...list].sort(
            (a, b) =>
              new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setTerminal(null);
          setActive(null);
          setSessions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.connectionToken();
      setTestResult({ ok: true, secret: res.secret, simulated: res.simulated });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : "Connection failed",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div>
          <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
            Drawer &amp; Terminal
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Register-session history &middot; Stripe Terminal status
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
            Can&apos;t reach the API — start it with{" "}
            <code className="rounded bg-[var(--color-bg-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-text-primary)]">
              pnpm dev
            </code>{" "}
            in apps/api.
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center py-16 text-sm text-[var(--color-text-muted)]">
            Loading drawer &amp; terminal…
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* ── Payment Terminal ───────────────────────────── */}
              <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
                <div className="flex items-center gap-2">
                  <CreditCard
                    className="h-5 w-5 text-[var(--color-text-brand)]"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                    Payment Terminal
                  </h2>
                  {terminal && (
                    <span
                      className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide"
                      style={
                        terminal.mode === "live"
                          ? {
                              backgroundColor: "var(--color-moss-100)",
                              color: "var(--color-success)",
                            }
                          : {
                              backgroundColor: "var(--color-bg-surface)",
                              color: "var(--color-warning)",
                            }
                      }
                    >
                      {terminal.mode === "live" ? "Live" : "Simulated"}
                    </span>
                  )}
                </div>

                <dl className="mt-3 space-y-1.5 text-sm">
                  <Row
                    label="Configured"
                    value={terminal?.configured ? "Yes" : "No"}
                  />
                  {terminal?.publishableKey && (
                    <Row
                      label="Publishable key"
                      value={terminal.publishableKey}
                      mono
                    />
                  )}
                  {terminal?.location && (
                    <Row label="Location" value={terminal.location} />
                  )}
                </dl>

                <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                  Simulated until STRIPE_SECRET_KEY + a reader are configured
                  (Settings → Registers/Locations).
                </p>

                <div className="mt-4 flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={testConnection}
                    disabled={testing}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${testing ? "animate-spin" : ""}`}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    {testing ? "Testing…" : "Test connection"}
                  </Button>
                </div>

                {testResult &&
                  (testResult.ok ? (
                    <div
                      className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm"
                      style={{
                        backgroundColor: "var(--color-bg-surface)",
                        color: testResult.simulated
                          ? "var(--color-info)"
                          : "var(--color-success)",
                      }}
                    >
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span>
                        Connection OK ·{" "}
                        <span className="font-mono">
                          {testResult.secret.slice(0, 16)}…
                        </span>{" "}
                        ({testResult.simulated ? "simulated" : "live"})
                      </span>
                    </div>
                  ) : (
                    <div
                      className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm"
                      style={{
                        backgroundColor: "var(--color-bg-surface)",
                        color: "var(--color-danger)",
                      }}
                    >
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span>{testResult.message}</span>
                    </div>
                  ))}
              </section>

              {/* ── Active Drawer ──────────────────────────────── */}
              <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
                <div className="flex items-center gap-2">
                  <Wallet
                    className="h-5 w-5 text-[var(--color-text-brand)]"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                    Active Drawer
                  </h2>
                  {active && (
                    <span
                      className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide"
                      style={{
                        backgroundColor: "var(--color-moss-100)",
                        color: "var(--color-success)",
                      }}
                    >
                      Open
                    </span>
                  )}
                </div>

                {active ? (
                  <>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="font-mono text-base font-bold text-[var(--color-text-primary)]">
                        {active.number}
                      </span>
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {active.userName}
                      </span>
                    </div>
                    <dl className="mt-3 space-y-1.5 text-sm">
                      <Row label="Opened" value={fmtTime(active.openedAt)} />
                      <Row
                        label="Opening float"
                        value={money(active.openingFloat)}
                      />
                      <Row label="Cash sales" value={money(active.cashSales)} />
                      <Row label="Card sales" value={money(active.cardSales)} />
                      <Row
                        label="Expected cash"
                        value={money(active.expectedCash)}
                        strong
                      />
                    </dl>
                  </>
                ) : (
                  <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-text-muted)]">
                    No drawer open — open one from the Register screen.
                  </div>
                )}
              </section>
            </div>

            {/* ── Session History ──────────────────────────────── */}
            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
              <div className="flex items-center gap-2">
                <Receipt
                  className="h-5 w-5 text-[var(--color-text-brand)]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                  Session History
                </h2>
                <span className="ml-auto text-xs text-[var(--color-text-muted)]">
                  {sessions.length} session{sessions.length === 1 ? "" : "s"}
                </span>
              </div>

              {sessions.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-[var(--color-text-muted)]">
                        <th className="pb-2 font-medium">REG #</th>
                        <th className="pb-2 font-medium">Cashier</th>
                        <th className="pb-2 font-medium">Opened</th>
                        <th className="pb-2 font-medium">Closed</th>
                        <th className="pb-2 text-right font-medium">Float</th>
                        <th className="pb-2 text-right font-medium">Cash</th>
                        <th className="pb-2 text-right font-medium">Card</th>
                        <th className="pb-2 text-right font-medium">Orders</th>
                        <th className="pb-2 text-right font-medium">Expected</th>
                        <th className="pb-2 text-right font-medium">Counted</th>
                        <th className="pb-2 text-right font-medium">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {sessions.map((s) => {
                        const stillOpen = s.status === "open";
                        const varianceColor =
                          s.variance === 0
                            ? "var(--color-success)"
                            : s.variance < 0
                              ? "var(--color-danger)"
                              : "var(--color-warning)";
                        return (
                          <tr key={s.id}>
                            <td className="py-2 font-mono text-xs text-[var(--color-text-primary)]">
                              {s.number}
                            </td>
                            <td className="py-2 text-[var(--color-text-secondary)]">
                              {s.userName}
                            </td>
                            <td className="py-2 text-[var(--color-text-secondary)]">
                              {fmtTime(s.openedAt)}
                            </td>
                            <td className="py-2 text-[var(--color-text-secondary)]">
                              {fmtTime(s.closedAt)}
                            </td>
                            <td className="py-2 text-right text-[var(--color-text-secondary)]">
                              {money(s.openingFloat)}
                            </td>
                            <td className="py-2 text-right text-[var(--color-text-secondary)]">
                              {money(s.cashSales)}
                            </td>
                            <td className="py-2 text-right text-[var(--color-text-secondary)]">
                              {money(s.cardSales)}
                            </td>
                            <td className="py-2 text-right text-[var(--color-text-secondary)]">
                              {s.orderCount}
                            </td>
                            <td className="py-2 text-right text-[var(--color-text-secondary)]">
                              {money(s.expectedCash)}
                            </td>
                            <td className="py-2 text-right text-[var(--color-text-secondary)]">
                              {stillOpen ? "—" : money(s.countedCash)}
                            </td>
                            <td className="py-2 text-right font-semibold">
                              {stillOpen ? (
                                <span className="text-[var(--color-text-muted)]">
                                  —
                                </span>
                              ) : (
                                <span style={{ color: varianceColor }}>
                                  {money(s.variance)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-text-muted)]">
                  No register sessions yet.
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  mono,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-[var(--color-text-secondary)]">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right ${
          strong
            ? "font-display text-base font-bold text-[var(--color-text-primary)]"
            : "font-medium text-[var(--color-text-primary)]"
        } ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
