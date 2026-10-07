"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { Calculator as CalcIcon, ArrowRight, HelpCircle } from "lucide-react";
import { Button, Card } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { trackCalculatorCompleted } from "@/lib/analytics";
import { BULK_MATERIALS, findBulkMaterial } from "@/lib/bulk-materials";
import hero from "@/public/image/tool_hero.png";

const TIPS = [
  "Measure your area carefully in feet",
  'Depth varies by material — mulch 2-3", gravel 2-4"',
  "Add 10% extra for settling and waste",
  "For irregular shapes, break into rectangles and add results",
  '1 cubic yard covers ~162 sq ft at 2" depth',
  "1 cubic yard weighs approximately 2,000-2,800 lbs",
];

const inputClass =
  "w-full h-10 px-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:border-[var(--color-border-focus)]";

interface Result {
  cubicYards: number;
  materialId: string;
}

export default function CalculatorPage() {
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("2");
  const [materialId, setMaterialId] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const resultMaterial = findBulkMaterial(result?.materialId);

  const calculateMaterial = () => {
    if (!length || !width || !depth) return;
    const l = parseFloat(length);
    const w = parseFloat(width);
    const d = parseFloat(depth) / 12;
    const cubicFeet = l * w * d;
    const cubicYards = cubicFeet / 27;
    const rounded = Math.ceil(cubicYards * 10) / 10;
    // A click with unparseable dimensions produces NaN — not a calculation.
    if (!Number.isFinite(rounded) || rounded <= 0) return;
    setResult({ cubicYards: rounded, materialId });

    // `calculator_completed` names the material, so it fires only when one was
    // selected. A dimensions-only calculation still shows the yardage — it just
    // isn't a material event. No dollar figure is reported: the site publishes
    // no prices, and an invented one would land in GA4 and Ads.
    const material = findBulkMaterial(materialId);
    if (material) {
      trackCalculatorCompleted({ material: material.name, cubicYards: rounded });
    }
  };

  // Deep link that pre-fills the quote form with what was just calculated.
  // Cast: typedRoutes can't verify a query string built at runtime, but the
  // base route ("/request-quote") is a real one.
  const quoteHref = (result
    ? `/request-quote?${new URLSearchParams({
        ...(result.materialId ? { material: result.materialId } : {}),
        quantity: String(result.cubicYards),
      }).toString()}`
    : "/request-quote") as Route;

  return (
    <PageShell>
      <PageHero
        eyebrow="Estimate Your Needs"
        title="Material Calculator"
        subtitle="Calculate how much material you need for your project."
        imageUrl={hero.src}
      />

      <Section tone="moss" containerSize="default">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Calculator */}
          <Card padding="lg">
            <h2 className="mb-6 font-display text-2xl font-semibold text-[var(--color-text-primary)]">
              Enter Dimensions
            </h2>
            <div className="space-y-5">
              <div>
                <label
                  htmlFor="material"
                  className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  Material
                </label>
                <select
                  id="material"
                  value={materialId}
                  onChange={(e) => setMaterialId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose a material (optional)</option>
                  {BULK_MATERIALS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Optional — pick one to carry it into your quote. Yardage works either way.
                </p>
              </div>
              <div>
                <label
                  htmlFor="length"
                  className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  Length (feet)
                </label>
                <input
                  id="length"
                  type="number"
                  inputMode="decimal"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  placeholder="e.g., 20"
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="width"
                  className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  Width (feet)
                </label>
                <input
                  id="width"
                  type="number"
                  inputMode="decimal"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="e.g., 15"
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="depth"
                  className="mb-2 block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                  Depth (inches)
                </label>
                <input
                  id="depth"
                  type="number"
                  inputMode="decimal"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value)}
                  placeholder="e.g., 2"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Common: 1-3&quot; mulch, 2-4&quot; gravel, 4-6&quot; base rock
                </p>
              </div>

              <Button
                type="button"
                size="lg"
                onClick={calculateMaterial}
                className="w-full"
              >
                <CalcIcon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                Calculate
              </Button>

              {result !== null && (
                <div className="rounded-[var(--radius-lg)] bg-[var(--color-action)] p-6 text-[var(--color-action-fg)]">
                  <h3 className="mb-2 text-lg font-bold">You need:</h3>
                  <div className="mb-2 font-display text-5xl font-light">
                    {result.cubicYards}
                  </div>
                  <p className="font-medium">cubic yards of material</p>

                  {resultMaterial ? (
                    <p className="mt-3 border-t border-[var(--color-action-fg)]/25 pt-3 text-sm">
                      <span className="font-semibold">Contact us for pricing</span> on{" "}
                      {resultMaterial.name} — we&apos;ll quote the material and delivery
                      together.
                    </p>
                  ) : null}

                  <p className="mt-2 text-xs opacity-80">
                    Add 10% extra for settling and waste
                  </p>

                  <Link href={quoteHref} className="mt-4 block">
                    <Button type="button" size="lg" variant="secondary" className="w-full">
                      Get this quoted
                      <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </Card>

          {/* Tips + Help */}
          <div>
            <Card padding="lg">
              <h2 className="mb-6 font-display text-2xl font-semibold text-[var(--color-text-primary)]">
                Tips for Accurate Estimates
              </h2>
              <div className="space-y-4">
                {TIPS.map((tip, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-action)] text-[var(--color-action-fg)]">
                      <span className="text-xs font-bold">{i + 1}</span>
                    </div>
                    <span className="text-[var(--color-text-secondary)]">{tip}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card variant="inverted" padding="lg" className="mt-8">
              <h3 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold">
                <HelpCircle className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                Need Help?
              </h3>
              <p className="mb-4 text-[var(--color-text-inverted)] opacity-80">
                Our experts can help you estimate the right amount of material for your
                project.
              </p>
              <Link href="/request-quote">
                <Button type="button" size="lg" className="w-full">
                  Request a Quote
                  <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </Section>
    </PageShell>
  );
}
