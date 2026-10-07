import type { Role } from "../modules/users.js";

/**
 * Server-side authorization map — the single source of truth the API enforces.
 * Mirrors the web's `lib/permissions.ts` so nav (client) and access control
 * (server) agree. A user's effective access = their explicit `permissions`
 * override, or the role default when that is null. admin/manager always pass.
 */
export const PERMISSION_KEYS = [
  "register",
  "orders",
  "customers",
  "messages",
  "inventory",
  "dispatch",
  "purchasing",
  "vendors",
  "drawer",
  "reports",
  "employees",
  "access",
  "helpdesk",
  "ai",
  "settings",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const ALL: string[] = [...PERMISSION_KEYS];

export const ROLE_DEFAULTS: Record<Role, string[]> = {
  admin: ALL,
  manager: ALL,
  cashier: ["register", "orders", "customers", "messages", "inventory", "dispatch", "drawer", "reports"],
  trainee: ["register", "orders", "customers", "inventory"],
  driver: ["dispatch"],
};

export function effectivePermissions(user: { role: Role; permissions: string[] | null }): string[] {
  return user.permissions ?? ROLE_DEFAULTS[user.role] ?? [];
}

export function can(user: { role: Role; permissions: string[] | null }, key: string): boolean {
  // admin/manager always have everything, even if an override is misconfigured.
  if (user.role === "admin" || user.role === "manager") return true;
  return effectivePermissions(user).includes(key);
}
