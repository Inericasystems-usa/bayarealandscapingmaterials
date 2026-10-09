"use client";

import { useEffect, useRef } from "react";
import { trackMaterialPageView } from "@/lib/analytics";

/** Reports one view of a product page (the `material_page_view` event). */
export function ProductViewTracker({ name, slug }: { name: string; slug: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackMaterialPageView({ material: name, slug });
  }, [name, slug]);
  return null;
}
