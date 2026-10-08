import type { Metadata } from "next";
import { Monitor, Smartphone, Download, ShieldCheck, Cpu, ArrowRight } from "lucide-react";
import { Button } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { PwaInstall } from "@/components/PwaInstall";

export const metadata: Metadata = {
  title: "Download the POS App",
  description:
    "Install the Bay Area Landscaping Materials POS as a Windows desktop app, or run it on any tablet.",
  alternates: { canonical: "/download" },
  robots: { index: false, follow: false },
};

const FEATURES = [
  { icon: Cpu, title: "Full POS + operations", body: "Register, inventory, dispatch, purchasing, reports, and time clock — one app." },
  { icon: ShieldCheck, title: "Secure staff sign-in", body: "Role-based accounts for cashiers, drivers, and managers with PIN or password." },
  { icon: Smartphone, title: "Tablet ready", body: "A one-tap tablet mode enlarges the register for touch screens at the counter." },
] as const;

export default function DownloadPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="For staff"
        title="Get the BALM POS app"
        subtitle="Install the point-of-sale and operations console as a Windows desktop app, or run it on any tablet in the yard."
      />

      <Section density="default">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Windows desktop (.exe) */}
          <div className="flex flex-col rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-7 shadow-[var(--shadow-md)]">
            <span className="inline-grid h-12 w-12 place-items-center rounded-[var(--radius-lg)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
              <Monitor className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <h2 className="mt-5 font-display text-2xl font-bold text-[var(--color-text-primary)]">
              Windows Desktop App
            </h2>
            <p className="mt-2 flex-1 text-[var(--color-text-secondary)]">
              A native installer (.exe) that runs the POS in its own window — ideal for the
              counter PC. Built with Electron; auto-launches at the register.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <a href="/downloads/BALM-POS-Setup.exe" download>
                <Button size="lg" className="w-full">
                  <Download className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  Download for Windows (.exe)
                </Button>
              </a>
              <p className="text-xs text-[var(--color-text-muted)]">
                Windows 10/11 · 64-bit. The installer is produced from{" "}
                <code className="rounded bg-[var(--color-bg-surface)] px-1 py-0.5">apps/desktop</code>{" "}
                via <code className="rounded bg-[var(--color-bg-surface)] px-1 py-0.5">pnpm build:win</code>.
                If the link 404s, the build hasn&apos;t been run yet — use the installable web app
                on the right meanwhile.
              </p>
            </div>
          </div>

          {/* Installable web app (PWA) */}
          <div className="flex flex-col rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-7 shadow-[var(--shadow-md)]">
            <span className="inline-grid h-12 w-12 place-items-center rounded-[var(--radius-lg)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
              <Smartphone className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <h2 className="mt-5 font-display text-2xl font-bold text-[var(--color-text-primary)]">
              Install as an App (Windows / Tablet)
            </h2>
            <p className="mt-2 flex-1 text-[var(--color-text-secondary)]">
              No download needed — install the POS directly from your browser as a standalone app.
              Works on Windows, iPad, and Android tablets, and updates automatically.
            </p>
            <div className="mt-5 space-y-3">
              <PwaInstall />
              {/* A plain link on purpose: the POS needs a full page load to get its
                  own security policy and none of this page's tags. */}
              <a href="/pos" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-text-brand)] hover:underline">
                Open the POS in the browser
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </a>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="moss" density="compact">
        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <span className="inline-grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] text-[var(--color-moss-700)]">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="mt-3 font-display text-lg font-semibold text-[var(--color-text-primary)]">{title}</h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{body}</p>
            </div>
          ))}
        </div>
      </Section>
    </PageShell>
  );
}
