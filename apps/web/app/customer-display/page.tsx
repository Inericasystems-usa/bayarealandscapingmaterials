"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ShoppingCart } from "lucide-react";
import { Logo } from "@/components/Logo";
import { StaffScreenGuard } from "@/components/StaffScreenGuard";
import { displayWsUrl, type DisplayState } from "@/lib/useCustomerDisplay";

const money = (n: number) => `$${(n ?? 0).toFixed(2)}`;

export default function CustomerDisplayPage() {
  const [state, setState] = useState<DisplayState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const channel = new URLSearchParams(window.location.search).get("ws") || "MAIN";
    let closed = false;
    let ws: WebSocket | null = null;
    const connect = () => {
      if (closed) return;
      ws = new WebSocket(displayWsUrl(channel, "display"));
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          setState(JSON.parse(e.data as string) as DisplayState);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, []);

  const idle = !state || state.status === "idle" || state.lines.length === 0;
  const complete = state?.status === "complete";

  return (
    <div data-theme="dark" className="flex h-[100dvh] flex-col bg-[var(--color-moss-950)] text-white">
      <StaffScreenGuard />
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-5">
        <Logo tone="inverted" height={44} />
        <span className={`flex items-center gap-2 text-xs font-medium ${connected ? "text-[var(--color-moss-300)]" : "text-white/40"}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-[var(--color-moss-300)]" : "bg-white/30"}`} />
          {connected ? "Connected" : "Connecting…"}
        </span>
      </header>

      {complete ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <CheckCircle2 className="h-20 w-20 text-[var(--color-moss-300)]" strokeWidth={1.5} />
          <h1 className="font-display text-5xl font-extrabold">Thank you!</h1>
          {state?.orderNumber && <p className="text-xl text-[var(--color-moss-200)]">Order {state.orderNumber}</p>}
          <p className="font-display text-3xl font-bold">{money(state?.total ?? 0)}</p>
          <p className="mt-4 text-[var(--color-moss-200)]">We appreciate your business.</p>
        </div>
      ) : idle ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <h1 className="font-display text-5xl font-extrabold">Welcome</h1>
          <p className="max-w-lg text-xl text-[var(--color-moss-200)]">
            Bulk landscape materials — sand, gravel, mulch, soil &amp; stone. Ask our team for help.
          </p>
          <ShoppingCart className="mt-6 h-12 w-12 text-white/30" strokeWidth={1.5} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-8 py-6">
          {state?.customer && state.customer !== "Walk-in" && (
            <p className="mb-3 text-lg text-[var(--color-moss-200)]">Hello, {state.customer}</p>
          )}
          <ul className="min-h-0 flex-1 divide-y divide-white/10 overflow-auto">
            {state?.lines.map((l, i) => (
              <li key={i} className="flex items-center justify-between py-3.5">
                <div>
                  <p className="text-2xl font-medium">{l.name}</p>
                  <p className="text-base text-[var(--color-moss-200)]">
                    {l.qty} × {l.unitLabel}
                  </p>
                </div>
                <span className="font-display text-2xl font-bold">{money(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1.5 border-t border-white/10 pt-4 text-xl">
            <div className="flex justify-between text-[var(--color-moss-200)]">
              <span>Subtotal</span>
              <span>{money(state?.subtotal ?? 0)}</span>
            </div>
            {(state?.discount ?? 0) > 0 && (
              <div className="flex justify-between text-[var(--color-moss-300)]">
                <span>Discount</span>
                <span>−{money(state?.discount ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between text-[var(--color-moss-200)]">
              <span>Tax ({((state?.taxRate ?? 0) * 100).toFixed(2)}%)</span>
              <span>{money(state?.tax ?? 0)}</span>
            </div>
            <div className="flex justify-between font-display text-4xl font-extrabold">
              <span>Total</span>
              <span>{money(state?.total ?? 0)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
