"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Tablet, LogOut, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@balm/ui";
import { api } from "@/lib/api-client";
import { Logo } from "@/components/Logo";
import { GlobalSearch } from "./GlobalSearch";
import { OfflineIndicator } from "./OfflineIndicator";
import { PosBell } from "./PosBell";
import { PosClock } from "./PosClock";
import { useAuth } from "./auth";
import { LoginScreen } from "./LoginScreen";
import { DriverApp } from "./DriverApp";
import { OnboardingWizard } from "./OnboardingWizard";
import { FEATURES, GROUP_ORDER, can, featureForPath } from "@/lib/permissions";

const TABLET_KEY = "balm_pos_tablet";

export function PosChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [tablet, setTablet] = useState(false);

  useEffect(() => {
    setTablet(window.localStorage.getItem(TABLET_KEY) === "1");
  }, []);

  const [drawerWarn, setDrawerWarn] = useState<string | null>(null);

  // First-run onboarding gate (admins/managers only; others skip it).
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      setNeedsOnboarding(false);
      return;
    }
    let alive = true;
    api.getSettings()
      .then((s) => alive && setNeedsOnboarding(!s.onboardingComplete))
      .catch(() => alive && setNeedsOnboarding(false));
    return () => {
      alive = false;
    };
  }, [user]);

  const toggleTablet = () =>
    setTablet((v) => {
      const next = !v;
      window.localStorage.setItem(TABLET_KEY, next ? "1" : "0");
      return next;
    });

  // Cashiers/managers must close (check out) their register drawer before
  // clocking out for the day.
  const handleSignOut = async () => {
    if (user && (user.role === "cashier" || user.role === "manager")) {
      try {
        const s = await api.terminalRegisterActive();
        if (s) {
          setDrawerWarn(s.number);
          return;
        }
      } catch {
        /* offline — allow sign out */
      }
    }
    logout();
  };

  if (loading) {
    return (
      <div data-theme="dark" className="grid h-[100dvh] place-items-center bg-[var(--color-moss-950)]">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--color-moss-300)]" />
      </div>
    );
  }
  if (!user) return <LoginScreen />;
  // Drivers get a dedicated, mobile-first delivery app — not the POS console.
  if (user.role === "driver") return <DriverApp />;
  // First-run setup wizard for a fresh install (admin/manager).
  if (needsOnboarding === null) {
    return (
      <div data-theme="dark" className="grid h-[100dvh] place-items-center bg-[var(--color-moss-950)]">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--color-moss-300)]" />
      </div>
    );
  }
  if (needsOnboarding) return <OnboardingWizard onDone={() => setNeedsOnboarding(false)} />;

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Route guard: block features the user isn't permitted to see.
  const feature = featureForPath(pathname);
  const blocked = feature ? !can(user, feature.key) : false;

  return (
    <div data-theme="dark" className="flex h-[100dvh] overflow-hidden bg-[var(--color-bg-page)]">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="flex w-16 shrink-0 flex-col gap-0.5 border-r border-[var(--color-border)] bg-[var(--color-moss-950)] py-3 lg:w-60 lg:px-3">
        <Link href="/pos" className="mb-2 flex items-center justify-center px-2 py-1 lg:justify-start">
          <Logo tone="inverted" height={34} />
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="POS">
          {GROUP_ORDER.map((group) => {
            const items = FEATURES.filter((f) => f.group === group && can(user, f.key));
            if (!items.length) return null;
            return (
              <div key={group} className="pt-1.5">
                <p className="hidden px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[color-mix(in_oklab,var(--color-moss-300)_50%,transparent)] lg:block">
                  {group}
                </p>
                {items.map(({ key, label, href, icon: Icon, exact }) => {
                  const active = exact ? pathname === href : pathname.startsWith(href);
                  return (
                    <Link
                      key={key}
                      href={href as Route}
                      className={cn(
                        "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-[var(--color-moss-700)] text-white shadow-[var(--shadow-sm)]"
                          : "text-[var(--color-moss-200)] hover:bg-[var(--color-moss-800)] hover:text-white",
                      )}
                      aria-current={active ? "page" : undefined}
                      title={label}
                    >
                      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="hidden lg:inline">{label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="mt-1 hidden items-center gap-2 rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--color-moss-800)_40%,transparent)] px-3 py-2 text-[11px] text-[var(--color-moss-300)] lg:flex">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-moss-600)] text-[10px] font-bold text-white">
            {initials}
          </span>
          <span className="truncate capitalize">{user.role}</span>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4">
          <GlobalSearch />
          <div className="flex-1 sm:hidden" />

          <OfflineIndicator />

          <button
            onClick={toggleTablet}
            title="Tablet mode"
            className={cn(
              "grid h-9 w-9 place-items-center rounded-[var(--radius-md)]",
              tablet ? "bg-[var(--color-moss-100)] text-[var(--color-moss-700)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]",
            )}
          >
            <Tablet className="h-5 w-5" strokeWidth={1.75} />
          </button>

          <PosClock />
          <PosBell />

          <div className="flex items-center gap-2 pl-1">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-moss-600)] text-sm font-semibold text-white">
              {initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight text-[var(--color-text-primary)]">{user.name}</span>
              <span className="block text-xs capitalize leading-tight text-[var(--color-text-muted)]">{user.role}</span>
            </span>
            <button
              onClick={handleSignOut}
              title="Sign out (clocks you out)"
              className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-danger)]"
            >
              <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          </div>
        </header>

        <main className={cn("min-h-0 flex-1 overflow-auto", tablet && "pos-tablet")}>
          {blocked ? (
            <div className="grid h-full place-items-center p-8">
              <div className="max-w-sm text-center">
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[var(--radius-xl)] bg-[color-mix(in_oklab,var(--color-clay-500)_15%,transparent)] text-[var(--color-warning)]">
                  <ShieldAlert className="h-7 w-7" strokeWidth={1.5} />
                </span>
                <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">No access</h1>
                <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
                  Your account ({user.role}) can&apos;t open <strong>{feature?.label}</strong>. Ask a manager to grant
                  access in Access Control.
                </p>
                <Link
                  href="/pos"
                  className="mt-5 inline-flex items-center rounded-[var(--radius-md)] bg-[var(--color-action)] px-4 py-2 text-sm font-semibold text-[var(--color-action-fg)]"
                >
                  Back to Register
                </Link>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {/* Must close the drawer before clocking out */}
      {drawerWarn && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={() => setDrawerWarn(null)}>
          <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-center shadow-[var(--shadow-xl)]" onClick={(e) => e.stopPropagation()}>
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[color-mix(in_oklab,var(--color-clay-500)_15%,transparent)] text-[var(--color-warning)]">
              <ShieldAlert className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">Close your drawer first</h2>
            <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
              Register drawer <strong>{drawerWarn}</strong> is still open. Count and close it before clocking out for the day.
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setDrawerWarn(null)} className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]">
                Not yet
              </button>
              <Link
                href="/pos"
                onClick={() => setDrawerWarn(null)}
                className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-action)] py-2 text-sm font-semibold text-[var(--color-action-fg)]"
              >
                Go to Register
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
