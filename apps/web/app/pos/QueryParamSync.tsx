"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Reads a named URL query param and pushes it to a setter. Render inside a
 * <Suspense> boundary — that isolates Next's useSearchParams requirement to this
 * tiny node instead of forcing the whole page out of static prerender. Used by
 * the register + customers pages to accept the global search's `?find=` / `?q=`.
 */
export function QueryParamSync({ name, onValue }: { name: string; onValue: (v: string) => void }) {
  const params = useSearchParams();
  useEffect(() => {
    const v = params.get(name);
    if (v) onValue(v);
  }, [params, name, onValue]);
  return null;
}
