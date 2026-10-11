"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Calculator, Circle, FileText, Ruler, Square } from "lucide-react";
import { buttonVariants, cn } from "@balm/ui";
import { trackCalculatorCompleted } from "@/lib/analytics";
import {
  estimate,
  formatUsd,
  type CalculatorPlan,
  type EstimateInput,
  type PriceInfo,
  type Shape,
} from "@/lib/catalog/estimate";
import { quotePath } from "@/lib/catalog/shared";

/**
 * "How much do I need?" for one product, preset to that material: the depth,
 * extra allowance, coverage rate and selling step all come from the plan the
 * server picked (lib/catalog/estimate.ts planFor). Results update as you type;
 * the button carries the rounded quantity into the quote form.
 *
 * Prices arrive as a prop only when the storefront shows them.
 */

const SHAPES: { value: Shape; label: string; Icon: typeof Square }[] = [
  { value: "rectangle", label: "Rectangle", Icon: Square },
  { value: "circle", label: "Circle", Icon: Circle },
  { value: "area", label: "I know the area", Icon: Ruler },
];

const field =
  "h-12 w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-base text-[var(--color-text-primary)] transition-colors placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-moss-400)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)]";
const label = "mb-1.5 block text-sm font-semibold text-[var(--color-text-primary)]";

function num(s: string): number {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

export function ProductCalculator({
  slug,
  name,
  plan,
  price,
  quoteUnit,
}: {
  slug: string;
  name: string;
  plan: CalculatorPlan;
  price: PriceInfo | null;
  /** Unit the quote link carries (the product's base unit). */
  quoteUnit: string;
}) {
  const id = useId();
  const usesArea = plan.kind !== "count";
  const depthOptions =
    plan.kind === "volume" || plan.kind === "weight" ? plan.depths : plan.kind === "bags" ? plan.thicknesses : [];
  const [shape, setShape] = useState<Shape>("rectangle");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [area, setArea] = useState("");
  const [depth, setDepth] = useState(String(depthOptions[0] ?? 0));
  const [includeExtra, setIncludeExtra] = useState(true);
  const [count, setCount] = useState("1");

  const input: EstimateInput = {
    shape,
    length: num(length),
    width: num(width),
    area: num(area),
    depth: num(depth),
    includeExtra,
    count: num(count),
  };
  const result = useMemo(
    () => estimate(plan, input, price),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, price, shape, length, width, area, depth, includeExtra, count],
  );

  const extraPct = "extraPct" in plan ? plan.extraPct : 0;
  const depthWord = plan.kind === "bags" ? "Slab thickness" : "Depth";
  const hint = plan.kind === "volume" || plan.kind === "weight" ? plan.depthHint : null;

  return (
    <div className="calc-card grid overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-md)] lg:grid-cols-[1.15fr_1fr]">
      {/* ── Inputs ── */}
      <form className="space-y-6 p-5 sm:p-7" onSubmit={(e) => e.preventDefault()} aria-labelledby={`${id}-title`}>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
            <Calculator className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id={`${id}-title`} className="font-display text-xl font-semibold text-[var(--color-text-primary)]">
              How much {name} do I need?
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">Set up for this material. Results update as you type.</p>
          </div>
        </div>

        {usesArea ? (
          <>
            <fieldset>
              <legend className={label}>Shape of the area</legend>
              <div className="grid grid-cols-3 gap-2">
                {SHAPES.map(({ value, label: text, Icon }) => (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer flex-col items-center gap-1 rounded-[var(--radius-md)] border px-2 py-2.5 text-center text-xs font-medium transition-all duration-200 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-border-focus)] sm:text-sm",
                      shape === value
                        ? "border-[var(--color-action)] bg-[var(--color-moss-50)] text-[var(--color-moss-800)] shadow-[var(--shadow-sm)]"
                        : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:-translate-y-0.5 hover:border-[var(--color-moss-400)]",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${id}-shape`}
                      value={value}
                      checked={shape === value}
                      onChange={() => setShape(value)}
                      className="sr-only"
                    />
                    <Icon className="h-4 w-4" aria-hidden />
                    {text}
                  </label>
                ))}
              </div>
            </fieldset>

            {shape === "area" ? (
              <div>
                <label htmlFor={`${id}-area`} className={label}>
                  Area (square feet)
                </label>
                <input
                  id={`${id}-area`}
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint="done"
                  placeholder="e.g. 250"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className={field}
                />
              </div>
            ) : (
              <div className={cn("grid gap-4", shape === "rectangle" ? "grid-cols-2" : "grid-cols-1")}>
                <div>
                  <label htmlFor={`${id}-len`} className={label}>
                    {shape === "circle" ? "Diameter (feet)" : "Length (feet)"}
                  </label>
                  <input
                    id={`${id}-len`}
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint="next"
                    placeholder="e.g. 20"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    className={field}
                  />
                </div>
                {shape === "rectangle" ? (
                  <div>
                    <label htmlFor={`${id}-wid`} className={label}>
                      Width (feet)
                    </label>
                    <input
                      id={`${id}-wid`}
                      inputMode="decimal"
                      autoComplete="off"
                      enterKeyHint="done"
                      placeholder="e.g. 10"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      className={field}
                    />
                  </div>
                ) : null}
              </div>
            )}

            {depthOptions.length ? (
              <fieldset>
                <legend className={label}>{depthWord} (inches)</legend>
                <div className="flex flex-wrap items-center gap-2">
                  {depthOptions.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={num(depth) === d}
                      onClick={() => setDepth(String(d))}
                      className={cn(
                        "h-11 min-w-14 rounded-full border px-4 text-sm font-semibold transition-all duration-200",
                        num(depth) === d
                          ? "border-[var(--color-action)] bg-[var(--color-action)] text-[var(--color-action-fg)]"
                          : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:border-[var(--color-moss-400)] hover:text-[var(--color-text-primary)]",
                      )}
                    >
                      {d}&Prime;
                    </button>
                  ))}
                  <label className="sr-only" htmlFor={`${id}-depth`}>
                    Custom {depthWord.toLowerCase()} in inches
                  </label>
                  <input
                    id={`${id}-depth`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={depth}
                    onChange={(e) => setDepth(e.target.value)}
                    className={cn(field, "h-11 w-20 text-center")}
                  />
                </div>
                {hint ? <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">{hint}</p> : null}
              </fieldset>
            ) : null}

            {extraPct || plan.kind === "bags" ? (
              <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={includeExtra}
                  onChange={(e) => setIncludeExtra(e.target.checked)}
                  className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-action)]"
                />
                <span>
                  Add {plan.kind === "bags" ? 5 : extraPct}% extra
                  {"extraReason" in plan ? ` ${plan.extraReason}` : ""} (recommended)
                </span>
              </label>
            ) : null}
          </>
        ) : (
          <div>
            <label htmlFor={`${id}-count`} className={label}>
              How many {price ? price.unitPlural : "units"}?
            </label>
            <input
              id={`${id}-count`}
              inputMode="numeric"
              autoComplete="off"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className={cn(field, "max-w-40")}
            />
            {plan.kind === "count" && plan.note ? (
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">{plan.note}</p>
            ) : null}
          </div>
        )}
      </form>

      {/* ── Result ── */}
      <div className="relative flex flex-col justify-between gap-6 bg-[var(--color-moss-900)] p-5 text-white sm:p-7">
        <div aria-live="polite" aria-atomic="true">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-moss-200)]">You&apos;ll need about</p>
          {result ? (
            <div key={`${result.quantity}-${result.cost}`} className="calc-pop">
              <p className="mt-2 font-display text-5xl font-light tracking-tight sm:text-6xl">
                {result.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                <span className="ml-2 text-xl font-normal text-[var(--color-moss-100)]">{result.unitLabel}</span>
              </p>
              {result.cost !== null ? (
                <p className="mt-3 text-lg">
                  <span className="font-semibold">{formatUsd(result.cost)}</span>{" "}
                  <span className="text-sm text-[var(--color-moss-200)]">material, before tax &amp; delivery</span>
                </p>
              ) : null}
              <ul className="mt-4 space-y-1.5 text-sm text-[var(--color-moss-100)]">
                {result.details.map((d) => (
                  <li key={d} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1 w-1 flex-none rounded-full bg-[var(--color-moss-300)]" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-lg text-[var(--color-moss-100)]">
              {usesArea ? "Enter your measurements to see the amount." : "Enter a quantity to see the total."}
            </p>
          )}
        </div>
        <div className="space-y-3">
          <Link
            href={quotePath(slug, quoteUnit, result?.quantity) as Route}
            onClick={() => {
              if (result && plan.kind === "volume") trackCalculatorCompleted({ material: name, cubicYards: result.quantity });
            }}
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full rounded-full bg-white text-[var(--color-moss-950)] hover:bg-[var(--color-moss-100)]",
            )}
          >
            <FileText className="h-5 w-5" aria-hidden />
            {result ? `Quote ${result.quantity.toLocaleString("en-US")} ${result.unitLabel}` : "Request a quote"}
          </Link>
          <p className="text-xs leading-relaxed text-[var(--color-moss-200)]">
            Estimates use typical figures for loose material; the yard confirms the exact amount and price.
          </p>
        </div>
      </div>
    </div>
  );
}
