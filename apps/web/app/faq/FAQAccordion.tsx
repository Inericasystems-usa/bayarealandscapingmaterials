"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@balm/ui";

interface FaqItem {
  q: string;
  a: string;
}

export function FAQAccordion({ items }: { items: readonly FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      {items.map((item, idx) => {
        const isOpen = openIndex === idx;
        const buttonId = `faq-button-${idx}`;
        const panelId = `faq-panel-${idx}`;
        return (
          <li key={item.q}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-[var(--color-bg-surface)]"
              >
                <span className="font-sans text-lg font-semibold text-[var(--color-text-primary)]">
                  {item.q}
                </span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-[var(--color-text-secondary)] transition-transform",
                    isOpen && "rotate-180",
                  )}
                  strokeWidth={1.5}
                  aria-hidden
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="px-6 pb-6"
            >
              <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
                {item.a}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
