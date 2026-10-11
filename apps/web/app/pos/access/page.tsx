"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, RotateCcw, Lock, Loader2 } from "lucide-react";
import { api, type AuthUser } from "@/lib/api-client";
import { FEATURES, GROUP_ORDER, effectivePermissions } from "@/lib/permissions";

const ROLE_BADGE: Record<string, string> = {
  admin: "var(--color-danger)",
  manager: "var(--color-info)",
  cashier: "var(--color-success)",
  trainee: "var(--color-warning)",
  driver: "var(--color-text-muted)",
};

export default function AccessPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = () =>
    api
      .listUsers()
      .then((u) => setUsers(u.filter((x) => x.role !== "driver")))
      .catch(() => setError(true))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (selId || !users.length) return;
    const first = users.find((u) => u.role !== "admin") ?? users[0];
    if (first) setSelId(first.id);
  }, [users, selId]);

  const selected = users.find((u) => u.id === selId) ?? null;
  const isAdmin = selected?.role === "admin";
  const perms = new Set(selected ? effectivePermissions(selected) : []);
  const hasOverride = selected?.permissions != null;

  const persist = async (next: string[] | null) => {
    if (!selected) return;
    setUsers((us) => us.map((u) => (u.id === selected.id ? { ...u, permissions: next } : u)));
    try {
      await api.updateUser(selected.id, { permissions: next });
    } catch {
      setError(true);
    }
  };

  const toggle = async (key: string) => {
    if (!selected || isAdmin) return;
    const cur = new Set(effectivePermissions(selected));
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    const next = FEATURES.map((f) => f.key).filter((k) => cur.has(k));
    setSavingKey(key);
    await persist(next);
    setSavingKey(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">Access Control</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Grant or revoke features per employee. Defaults follow the role; toggling creates an override.
          </p>
        </div>
      </div>

      {error && (
        <div className="border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-clay-500)_10%,transparent)] px-5 py-2 text-sm text-[var(--color-warning)]">
          Can&apos;t reach the API — start it with <code>pnpm dev</code> in apps/api.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_1fr]">
        {/* Users */}
        <div className="min-h-0 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] lg:border-b-0 lg:border-r">
          {loading ? (
            <div className="grid place-items-center py-10 text-[var(--color-text-muted)]"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <ul className="p-2">
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => setSelId(u.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 py-2.5 text-left ${
                      selId === u.id ? "bg-[var(--color-moss-100)]" : "hover:bg-[var(--color-bg-surface)]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">{u.name}</span>
                      <span className="block text-xs capitalize text-[var(--color-text-muted)]">
                        {u.role}
                        {u.permissions != null && u.role !== "admin" ? " · custom" : ""}
                      </span>
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ROLE_BADGE[u.role] }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Permissions for selected user */}
        <div className="min-h-0 overflow-auto p-5">
          {!selected ? (
            <p className="text-sm text-[var(--color-text-muted)]">Select an employee.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">{selected.name}</h2>
                  <p className="text-sm capitalize text-[var(--color-text-muted)]">
                    {selected.role}
                    {isAdmin ? " · full access (locked)" : hasOverride ? " · custom access" : " · role default"}
                  </p>
                </div>
                {!isAdmin && hasOverride && (
                  <button
                    onClick={() => persist(null)}
                    className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
                  >
                    <RotateCcw className="h-4 w-4" /> Reset to role default
                  </button>
                )}
              </div>

              {isAdmin && (
                <div className="mb-4 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                  <Lock className="h-4 w-4" /> Admins always have full access.
                </div>
              )}

              <div className="space-y-5">
                {GROUP_ORDER.map((group) => (
                  <div key={group}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">{group}</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {FEATURES.filter((f) => f.group === group).map((f) => {
                        const on = isAdmin || perms.has(f.key);
                        const Icon = f.icon;
                        return (
                          <button
                            key={f.key}
                            onClick={() => toggle(f.key)}
                            disabled={isAdmin}
                            className={`flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors disabled:opacity-70 ${
                              on
                                ? "border-[var(--color-action)] bg-[var(--color-moss-100)]"
                                : "border-[var(--color-border)] hover:bg-[var(--color-bg-surface)]"
                            }`}
                          >
                            <span className="flex items-center gap-2.5">
                              <Icon className={`h-4 w-4 ${on ? "text-[var(--color-moss-700)]" : "text-[var(--color-text-muted)]"}`} strokeWidth={1.75} />
                              <span className={`text-sm font-medium ${on ? "text-[var(--color-moss-800)]" : "text-[var(--color-text-secondary)]"}`}>
                                {f.label}
                              </span>
                            </span>
                            {savingKey === f.key ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[var(--color-text-muted)]" />
                            ) : (
                              <span
                                className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${
                                  on ? "justify-end bg-[var(--color-action)]" : "justify-start bg-[var(--color-bg-sunken)]"
                                }`}
                              >
                                <span className="h-4 w-4 rounded-full bg-white" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
