import {
  ShoppingCart,
  ReceiptText,
  Contact,
  MessageSquare,
  Package,
  Truck,
  ClipboardList,
  Factory,
  Wallet,
  LayoutDashboard,
  LifeBuoy,
  Users,
  ShieldCheck,
  Settings,
  Sparkles,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import type { AuthUser, Role } from "@/lib/api-client";

/**
 * Feature/permission registry — the single source of truth for the POS nav AND
 * the access-control matrix. A user's effective access = their explicit
 * `permissions` override, or the role default when that is null.
 */
export interface Feature {
  key: string;
  label: string;
  href: string;
  group: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const FEATURES: Feature[] = [
  { key: "register", label: "Register", href: "/pos", group: "Sell", icon: ShoppingCart, exact: true },
  { key: "orders", label: "Orders", href: "/pos/orders", group: "Sell", icon: ReceiptText },
  { key: "customers", label: "Customers", href: "/pos/customers", group: "Sell", icon: Contact },
  { key: "messages", label: "Messages", href: "/pos/messages", group: "Sell", icon: MessageSquare },

  { key: "inventory", label: "Inventory", href: "/pos/inventory", group: "Operations", icon: Package },
  { key: "dispatch", label: "Dispatch", href: "/pos/dispatch", group: "Operations", icon: Truck },
  { key: "purchasing", label: "Purchasing", href: "/pos/purchasing", group: "Operations", icon: ClipboardList },
  { key: "vendors", label: "Vendors", href: "/pos/vendors", group: "Operations", icon: Factory },

  { key: "drawer", label: "Drawer & Terminal", href: "/pos/register", group: "Till & Reports", icon: Wallet },
  { key: "reports", label: "Reports", href: "/pos/reports", group: "Till & Reports", icon: LayoutDashboard },

  { key: "employees", label: "Employees", href: "/pos/employees", group: "Admin", icon: Users },
  { key: "access", label: "Access Control", href: "/pos/access", group: "Admin", icon: ShieldCheck },
  { key: "audit", label: "Audit Log", href: "/pos/audit", group: "Admin", icon: ScrollText },
  { key: "helpdesk", label: "Helpdesk", href: "/pos/helpdesk", group: "Admin", icon: LifeBuoy },
  { key: "ai", label: "AI Assist", href: "/pos/ai", group: "Admin", icon: Sparkles },
  { key: "settings", label: "Settings", href: "/pos/settings", group: "Admin", icon: Settings },
];

export const GROUP_ORDER = ["Sell", "Operations", "Till & Reports", "Admin"];

/**
 * Product edition / entitlement.
 *
 * "owned"       — the perpetual, no-subscription build shipped to a specific
 *                 store (e.g. BALM, R&S). Full POS + website sync, but AI is
 *                 withheld.
 * "subscription"— the $49/mo build: everything including AI, gated on an active
 *                 subscription.
 *
 * The edition is baked at build time via NEXT_PUBLIC_POS_EDITION, so shipping a
 * store an updated build is exactly how you later "force them onto subscription
 * and unlock AI". A future runtime entitlement check (server-driven, so it can
 * be flipped without a rebuild) should override this via `resolveEdition()`.
 */
export type Edition = "owned" | "subscription";

export const EDITION: Edition =
  (process.env.NEXT_PUBLIC_POS_EDITION as Edition) === "subscription" ? "subscription" : "owned";

/** Feature keys available only to the subscription edition (AI-powered). */
export const SUBSCRIPTION_ONLY = new Set<string>(["ai"]);

/** True when a feature is included in the current edition (independent of the user's role). */
export function editionAllows(key: string, edition: Edition = EDITION): boolean {
  return edition === "subscription" || !SUBSCRIPTION_ONLY.has(key);
}

export const PERMISSION_KEYS = FEATURES.map((f) => f.key);

const ALL = [...PERMISSION_KEYS];

export const ROLE_DEFAULTS: Record<Role, string[]> = {
  admin: ALL,
  manager: ALL,
  // Cashier: Register, Orders, Customers, Messages, Inventory, Dispatch, Drawer & Terminal, Reports
  cashier: ["register", "orders", "customers", "messages", "inventory", "dispatch", "drawer", "reports"],
  // Trainee: Register, Orders, Customers, Inventory
  trainee: ["register", "orders", "customers", "inventory"],
  // Drivers primarily use the driver app; in the POS they see Dispatch.
  driver: ["dispatch"],
};

/** Manager/admin can edit anyone's access; everyone can edit nothing else. */
export function canManageAccess(user: AuthUser | null): boolean {
  return user?.role === "admin" || user?.role === "manager";
}

export function effectivePermissions(user: Pick<AuthUser, "role" | "permissions">): string[] {
  return user.permissions ?? ROLE_DEFAULTS[user.role] ?? [];
}

export function can(user: Pick<AuthUser, "role" | "permissions"> | null, key: string): boolean {
  if (!user) return false;
  // Edition gate wins over role: an AI feature stays hidden in the "owned" build
  // even for admins, until the store is moved onto the subscription edition.
  if (!editionAllows(key)) return false;
  // admin/manager always have everything, even if an override is misconfigured.
  if (user.role === "admin" || user.role === "manager") return true;
  return effectivePermissions(user).includes(key);
}

export function featureForPath(pathname: string): Feature | null {
  // Most-specific match first (so /pos/orders beats /pos).
  const sorted = [...FEATURES].sort((a, b) => b.href.length - a.href.length);
  return sorted.find((f) => (f.exact ? pathname === f.href : pathname.startsWith(f.href))) ?? null;
}
