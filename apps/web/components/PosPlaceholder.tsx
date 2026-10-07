import { Construction } from "lucide-react";

export function PosPlaceholder({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-[var(--radius-xl)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
        <Construction className="h-7 w-7" strokeWidth={1.5} aria-hidden />
      </span>
      <h1 className="font-display text-2xl font-bold text-[var(--color-text-primary)]">{title}</h1>
      <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">{blurb}</p>
    </div>
  );
}
