"use client";

import { useCallback, useEffect, useRef } from "react";

/** Derive the :3001 display socket URL from the API host. */
export function displayWsUrl(channel: string, role: "register" | "display"): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  let host = "localhost";
  try {
    host = new URL(base).hostname;
  } catch {
    /* default */
  }
  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${host}:3001/?role=${role}&ws=${encodeURIComponent(channel)}`;
}

export interface DisplayState {
  store: string;
  status: "active" | "complete" | "idle";
  customer: string;
  lines: { name: string; unitLabel: string; qty: number; lineTotal: number }[];
  subtotal: number;
  discount?: number;
  tax: number;
  taxRate: number;
  total: number;
  orderNumber?: string;
}

/**
 * Register-side publisher. Opens a WebSocket to the display relay and returns a
 * `publish(state)` function. Reconnects if the socket drops.
 */
export function useCustomerDisplay(channel: string | null) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!channel || typeof window === "undefined") return;
    let closed = false;
    let ws: WebSocket | null = null;
    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(displayWsUrl(channel, "register"));
        wsRef.current = ws;
        ws.onclose = () => {
          if (!closed) setTimeout(connect, 2000);
        };
        ws.onerror = () => ws?.close();
      } catch {
        /* relay offline */
      }
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
      wsRef.current = null;
    };
  }, [channel]);

  return useCallback((state: DisplayState) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(state));
  }, []);
}
