"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  UserPlus,
  Pencil,
  UserX,
  Shield,
  Mail,
  Phone,
  KeyRound,
  X,
} from "lucide-react";
import { Button } from "@balm/ui";
import { api, type AuthUser, type Role } from "@/lib/api-client";
import { useAuth } from "../auth";

const OFFLINE_NOTE =
  "Can't reach the API — start it with `pnpm dev` in apps/api.";
const FORBIDDEN_NOTE =
  "Only admins and managers can create or edit employee accounts.";

const ROLES: { value: Role; label: string }[] = [
  { value: "trainee", label: "Trainee" },
  { value: "cashier", label: "Cashier" },
  { value: "driver", label: "Driver" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
];

// Role → token-driven badge colors (text + 18% tinted background via color-mix)
const ROLE_BADGE: Record<Role, { label: string; color: string }> = {
  admin: { label: "Admin", color: "var(--color-danger)" },
  manager: { label: "Manager", color: "var(--color-info)" },
  cashier: { label: "Cashier", color: "var(--color-success)" },
  trainee: { label: "Trainee", color: "var(--color-warning)" },
  driver: { label: "Driver", color: "var(--color-text-muted)" },
};

type FormState = {
  name: string;
  email: string;
  role: Role;
  phone: string;
  pin: string;
  password: string;
};

const EMPTY: FormState = {
  name: "",
  email: "",
  role: "cashier",
  phone: "",
  pin: "",
  password: "",
};

export default function EmployeesPage() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listUsers();
      setUsers(data);
    } catch {
      setError(OFFLINE_NOTE);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    const c: Record<Role, number> = { admin: 0, manager: 0, cashier: 0, trainee: 0, driver: 0 };
    for (const u of users) if (u.active) c[u.role] += 1;
    return c;
  }, [users]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    setPanelOpen(true);
  }

  function openEdit(u: AuthUser) {
    setEditing(u);
    setForm({
      name: u.name ?? "",
      email: u.email ?? "",
      role: u.role,
      phone: u.phone ?? "",
      pin: "",
      password: "",
    });
    setFormError(null);
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setEditing(null);
    setFormError(null);
  }

  const upd = (k: keyof FormState, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  function friendlyError(err: unknown): string {
    const msg = err instanceof Error ? err.message : "";
    if (/403|forbidden|admin|manager/i.test(msg)) return FORBIDDEN_NOTE;
    if (/failed to fetch|networkerror|load failed/i.test(msg)) return OFFLINE_NOTE;
    return msg || "Something went wrong. Please try again.";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setFormError("Name is required.");
    if (!form.email.trim()) return setFormError("Email is required.");
    // PIN required when creating; on edit it's optional (blank = keep current).
    if (!editing && !/^\d{4,6}$/.test(form.pin)) return setFormError("PIN must be 4–6 digits.");
    if (form.pin && !/^\d{4,6}$/.test(form.pin)) return setFormError("PIN must be 4–6 digits.");

    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        phone: form.phone.trim(),
        ...(form.pin.trim() ? { pin: form.pin } : {}),
        ...(form.password.trim() ? { password: form.password } : {}),
      };
      if (editing) {
        await api.updateUser(editing.id, body);
      } else {
        await api.createUser(body);
      }
      closePanel();
      await load();
    } catch (err) {
      setFormError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(u: AuthUser) {
    if (!window.confirm(`Deactivate ${u.name}'s account? They won't be able to sign in.`))
      return;
    try {
      await api.deactivateUser(u.id);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
            <Users className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
              Employees
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {loading
                ? "Loading…"
                : `${counts.admin} admin · ${counts.manager} manager · ${counts.cashier} cashier · ${counts.driver} driver`}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Create accounts for cashiers, delivery drivers, managers.
            </p>
          </div>
        </div>

        <Button size="sm" onClick={openAdd} disabled={!canManage} title={canManage ? undefined : FORBIDDEN_NOTE}>
          <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Add Employee
        </Button>
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]"
              />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="grid place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-16 text-center">
            <Users className="h-8 w-8 text-[var(--color-text-muted)]" strokeWidth={1.5} aria-hidden />
            <p className="mt-3 text-sm font-medium text-[var(--color-text-secondary)]">
              {error ? "No employees to show." : "No employees yet."}
            </p>
            {!error && canManage && (
              <button
                onClick={openAdd}
                className="mt-3 text-sm font-medium text-[var(--color-text-brand)] hover:underline"
              >
                Add your first employee
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="px-4 py-2.5 font-semibold">Employee</th>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Phone</th>
                  <th className="px-4 py-2.5 font-semibold">PIN</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {users.map((u) => {
                  const badge = ROLE_BADGE[u.role];
                  return (
                    <tr
                      key={u.id}
                      className={`align-middle ${u.active ? "" : "opacity-50"}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--color-text-primary)]">
                          {u.name}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                          <Mail className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                          <span className="truncate">{u.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            color: badge.color,
                            backgroundColor: `color-mix(in srgb, ${badge.color} 16%, transparent)`,
                          }}
                        >
                          {u.role === "admin" && (
                            <Shield className="h-3 w-3" strokeWidth={2} aria-hidden />
                          )}
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {u.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                            {u.phone}
                          </span>
                        ) : (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 font-mono text-[var(--color-text-muted)]"
                          title="PINs are encrypted — use Edit to reset"
                        >
                          ••••
                          <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.active ? (
                          <span className="text-xs font-medium text-[var(--color-success)]">
                            Active
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-[var(--color-text-muted)]">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(u)}
                            disabled={!canManage}
                            aria-label={`Edit ${u.name}`}
                            title={canManage ? "Edit" : FORBIDDEN_NOTE}
                            className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                          </button>
                          {u.active && (
                            <button
                              onClick={() => deactivate(u)}
                              disabled={!canManage}
                              aria-label={`Deactivate ${u.name}`}
                              title={canManage ? "Deactivate" : FORBIDDEN_NOTE}
                              className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <UserX className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit / Add side panel ──────────────────────────────── */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            aria-label="Close panel"
            onClick={closePanel}
            className="absolute inset-0 bg-black/50"
          />
          <div className="relative flex h-full w-full max-w-md flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                {editing ? "Edit Employee" : "Add Employee"}
              </h2>
              <button
                onClick={closePanel}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </div>

            <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
                <Field label="Name" required>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => upd("name", e.target.value)}
                    placeholder="Maria Lopez"
                    className={inputCls}
                  />
                </Field>

                <Field label="Email" required>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => upd("email", e.target.value)}
                    placeholder="maria@bayarealandscapingmaterials.com"
                    className={inputCls}
                  />
                </Field>

                <Field label="Role">
                  <select
                    value={form.role}
                    onChange={(e) => upd("role", e.target.value)}
                    className={inputCls}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Phone">
                  <input
                    value={form.phone}
                    onChange={(e) => upd("phone", e.target.value)}
                    placeholder="(510) 555-0100"
                    className={inputCls}
                  />
                </Field>

                <Field label={editing ? "Reset PIN" : "PIN"} required={!editing}>
                  <input
                    required={!editing}
                    inputMode="numeric"
                    value={form.pin}
                    onChange={(e) =>
                      upd("pin", e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder={editing ? "Leave blank to keep current" : "4–6 digits"}
                    className={inputCls}
                  />
                  <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                    {editing
                      ? "PINs are encrypted and can't be viewed — enter a new one to reset."
                      : "Quick-login PIN for the POS."}
                  </span>
                </Field>

                <Field label="Password">
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => upd("password", e.target.value)}
                    placeholder="12+ characters, letters and numbers (required for admins and managers; leave empty for PIN-only counter staff)"
                    className={inputCls}
                  />
                </Field>

                {formError && (
                  <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-danger)]">
                    {formError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
                <Button type="button" variant="secondary" size="sm" onClick={closePanel}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  <KeyRound className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {saving ? "Saving…" : editing ? "Save changes" : "Create account"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)]";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {label}
        {required && <span className="text-[var(--color-danger)]"> *</span>}
      </span>
      {children}
    </label>
  );
}
