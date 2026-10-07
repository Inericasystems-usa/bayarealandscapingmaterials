import Link from "next/link";
import type { Route } from "next";
import type { TermBullet, TermPart } from "@/lib/sms-terms";

/**
 * Renders the SMS programme bullets from lib/sms-terms.
 *
 * Shared by the Terms of Service page and the SMS terms modal so the two can
 * never drift — a carrier audit compares what was shown against what was filed.
 * No hooks and no state, so it works in a Server Component and inside the
 * client modal alike.
 */

function Part({ part }: { part: TermPart }) {
  if (typeof part === "string") return <>{part}</>;
  if ("strong" in part) return <strong>{part.strong}</strong>;
  return (
    <Link
      href={part.link.href as Route}
      className="text-[var(--color-text-brand)] hover:underline"
    >
      {part.link.label}
    </Link>
  );
}

export function SmsTermsBullets({
  bullets,
  className = "mt-3 list-disc space-y-1 pl-5",
}: {
  bullets: readonly TermBullet[];
  className?: string;
}) {
  return (
    <ul className={className}>
      {bullets.map((bullet) => (
        <li key={bullet.id}>
          {bullet.lead ? <strong>{bullet.lead}</strong> : null}
          {bullet.parts.map((part, i) => (
            <Part key={i} part={part} />
          ))}
        </li>
      ))}
    </ul>
  );
}
