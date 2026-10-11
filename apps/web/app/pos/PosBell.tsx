"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, AlertTriangle, PackageCheck, Check } from "lucide-react";
import { api, type AppNotification } from "@/lib/api-client";

export function PosBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api.listNotifications();
      setItems(res.data);
      setUnread(res.unreadCount);
    } catch {
      /* API offline — bell stays empty */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const markAll = async () => {
    await api.markAllNotificationsRead().catch(() => {});
    void load();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-9 w-9 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-xl)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                Notifications {unread > 0 && <span className="text-[var(--color-text-muted)]">({unread})</span>}
              </span>
              {unread > 0 && (
                <button onClick={markAll} className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-brand)] hover:underline">
                  <Check className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-auto">
              {items.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">All caught up.</li>
              ) : (
                items.slice(0, 12).map((n) => (
                  <li
                    key={n.id}
                    className={`flex gap-3 border-b border-[var(--color-border)] px-4 py-3 ${n.read ? "opacity-60" : ""}`}
                  >
                    <span
                      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                        n.type === "low_stock"
                          ? "bg-[color-mix(in_oklab,var(--color-clay-500)_15%,transparent)] text-[var(--color-warning)]"
                          : "bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
                      }`}
                    >
                      {n.type === "low_stock" ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : (
                        <PackageCheck className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{n.title}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">{n.body}</p>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
