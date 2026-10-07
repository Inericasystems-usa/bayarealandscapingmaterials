"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api-client";
import {
  getPending,
  dequeueSale,
  pendingCount,
  onPendingChange,
  onReachableChange,
  isReachable,
  isNetworkError,
} from "./offline";

/**
 * Drains the offline sale queue whenever the API is reachable — on mount, on
 * reconnect, and on a slow interval as a safety net. Mount once (in PosChrome)
 * so queued sales replay no matter which POS page is open. Returns live state
 * for the header indicator.
 */
export function useOfflineSync(): { pending: number; syncing: boolean; online: boolean } {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const busy = useRef(false);

  useEffect(() => {
    setPending(pendingCount());
    setOnline(isReachable());
    const offPending = onPendingChange(setPending);
    const offReach = onReachableChange(setOnline);

    // Always attempt when there are queued sales — each createOrder call doubles
    // as the reachability probe (a success flips us back online via the client).
    const sync = async (): Promise<void> => {
      if (busy.current || getPending().length === 0) return;
      busy.current = true;
      setSyncing(true);
      try {
        for (const sale of getPending()) {
          try {
            await api.createOrder(sale.payload as Parameters<typeof api.createOrder>[0]);
            dequeueSale(sale.clientId); // server has it (idempotent by clientId)
          } catch (e) {
            if (isNetworkError(e)) break; // still offline — try again on the next tick
            dequeueSale(sale.clientId); // permanent failure — drop so it can't wedge the queue
          }
        }
      } finally {
        busy.current = false;
        setSyncing(false);
      }
    };

    void sync();
    const offReachSync = onReachableChange((up) => {
      if (up) void sync();
    });
    const interval = setInterval(() => void sync(), 15_000);
    return () => {
      offPending();
      offReach();
      offReachSync();
      clearInterval(interval);
    };
  }, []);

  return { pending, syncing, online };
}
