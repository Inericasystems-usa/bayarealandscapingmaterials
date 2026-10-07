"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Search, Package, Contact } from "lucide-react";
import { api, type ApiProduct, type Customer } from "@/lib/api-client";

/**
 * Global spotlight in the POS header. Searches products + customers (both have
 * efficient lookups: the catalog is small, customers search server-side). Orders
 * are intentionally excluded — they have no server-side text search, so scanning
 * them per keystroke would reintroduce a full-collection load. Selecting a result
 * routes to the relevant page with a query param it reads to pre-filter.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) {
      setProducts([]);
      setCustomers([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [ps, cs] = await Promise.all([
            api.listProducts().then((all) => all.filter((p) => p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term)).slice(0, 5)),
            api.listCustomers({ q: q.trim() }).then((all) => all.slice(0, 5)),
          ]);
          setProducts(ps);
          setCustomers(cs);
        } catch {
          /* offline — dropdown just stays empty */
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href as Route);
  };

  const hasResults = products.length > 0 || customers.length > 0;

  return (
    <div ref={boxRef} className="relative hidden flex-1 sm:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" aria-hidden />
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Search products & customers…"
        aria-label="Global search"
        className="h-9 w-full max-w-md rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)]"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 top-11 z-50 w-full max-w-md overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)]">
          {!hasResults ? (
            <p className="px-3 py-3 text-sm text-[var(--color-text-muted)]">No matches.</p>
          ) : (
            <div className="max-h-[70vh] overflow-auto py-1">
              {products.length > 0 && (
                <Group label="Products">
                  {products.map((p) => (
                    <Row key={p.id} icon={<Package className="h-4 w-4" />} title={p.name} sub={p.category} onClick={() => go(`/pos?find=${encodeURIComponent(p.name)}`)} />
                  ))}
                </Group>
              )}
              {customers.length > 0 && (
                <Group label="Customers">
                  {customers.map((c) => (
                    <Row key={c.id} icon={<Contact className="h-4 w-4" />} title={c.name} sub={c.number} onClick={() => go(`/pos/customers?q=${encodeURIComponent(c.name)}`)} />
                  ))}
                </Group>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      {children}
    </div>
  );
}

function Row({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--color-bg-surface)]"
    >
      <span className="text-[var(--color-text-muted)]">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text-primary)]">{title}</span>
      {sub && <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{sub}</span>}
    </button>
  );
}
