import { COMPANY } from "@/lib/company";

/**
 * Opening-hours logic, driven by COMPANY.hoursSpec so the "Open until 5:00 PM"
 * indicator and the JSON-LD openingHoursSpecification can never disagree.
 *
 * Everything resolves in the YARD's timezone, not the visitor's: a customer in
 * New York must be told when the Richmond yard is open, not when it is 5 PM
 * where they are.
 *
 * MUST be called client-side only (after mount). Rendering "Open now" on the
 * server would bake a build-time answer into static HTML and hydrate wrong.
 */

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Schema.org day URLs for the day indexes in COMPANY.hoursSpec. */
export function schemaDay(day: number): string {
  return DAY_NAMES[day] ?? "Monday";
}

/** openingHoursSpecification for JSON-LD, generated from the single source. */
export function openingHoursSpecification() {
  return COMPANY.hoursSpec.map((block) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: (block.days as readonly number[]).map(schemaDay),
    opens: block.opens,
    closes: block.closes,
  }));
}

/** Minutes since midnight for "HH:MM". */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** "17:00" → "5:00 PM" */
export function formatTime(hhmm: string): string {
  const total = toMinutes(hhmm);
  const h24 = Math.floor(total / 60);
  const minutes = total % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** The yard's current day-of-week and minutes-since-midnight. */
function nowAtYard(now: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: COMPANY.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});

  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    day: Math.max(0, short.indexOf(parts.weekday ?? "Mon")),
    minutes: Number(parts.hour ?? "0") * 60 + Number(parts.minute ?? "0"),
  };
}

function blockFor(day: number) {
  // `as const` on COMPANY narrows each `days` tuple to its literal members, which
  // makes the union's `includes` parameter `never`. Widen to compare by value.
  return COMPANY.hoursSpec.find((b) => (b.days as readonly number[]).includes(day));
}

export interface OpenState {
  open: boolean;
  /** "Open until 5:00 PM" / "Opens 7:00 AM" / "Opens Monday 7:00 AM" */
  label: string;
}

/**
 * Whether the yard is open right now, and the line to show for it.
 * Closed answers name the next opening — including the day when that is not today.
 */
export function openState(now: Date = new Date()): OpenState {
  const { day, minutes } = nowAtYard(now);
  const today = blockFor(day);

  if (today) {
    const opens = toMinutes(today.opens);
    const closes = toMinutes(today.closes);
    if (minutes >= opens && minutes < closes) {
      return { open: true, label: `Open until ${formatTime(today.closes)}` };
    }
    if (minutes < opens) {
      return { open: false, label: `Opens ${formatTime(today.opens)}` };
    }
  }

  // Closed for the day (or closed today entirely) — find the next open day.
  for (let ahead = 1; ahead <= 7; ahead++) {
    const nextDay = (day + ahead) % 7;
    const block = blockFor(nextDay);
    if (block) {
      const when = ahead === 1 ? "tomorrow" : schemaDay(nextDay);
      return { open: false, label: `Opens ${when} ${formatTime(block.opens)}` };
    }
  }
  return { open: false, label: "Closed" };
}
