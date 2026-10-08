import { describe, it, expect } from "vitest";
import { COMPANY } from "./company";
import { formatTime, openingHoursSpecification, openState } from "./hours";

/**
 * The yard's hours live in COMPANY twice: as display text (`hours`) and as
 * local times (`hoursSpec`, which feeds the JSON-LD and the "Open until" bar).
 * These pin the hours the yard gave and keep the two in step.
 */
describe("yard hours", () => {
  it("are Mon–Fri 7:00 AM – 5:00 PM and Sat–Sun 9:00 AM – 3:30 PM", () => {
    expect(COMPANY.hours.map((h) => `${h.label} ${h.value}`)).toEqual([
      "Mon – Fri 7:00 AM – 5:00 PM",
      "Sat – Sun 9:00 AM – 3:30 PM",
    ]);
  });

  it("read the same as text and as times", () => {
    expect(
      COMPANY.hoursSpec.map((b) => `${formatTime(b.opens)} – ${formatTime(b.closes)}`),
    ).toEqual(COMPANY.hours.map((h) => h.value));
  });

  it("cover each day of the week once", () => {
    const days = COMPANY.hoursSpec.flatMap((b) => [...(b.days as readonly number[])]);
    expect(days.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("publish the weekend in the JSON-LD", () => {
    expect(openingHoursSpecification()).toContainEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Sunday", "Saturday"],
      opens: "09:00",
      closes: "15:30",
    });
  });
});

describe("openState", () => {
  // Instants in UTC; the yard is on Pacific Daylight Time (UTC-7) in October.
  it("is open on a Sunday morning until 3:30 PM", () => {
    expect(openState(new Date("2026-10-11T17:00:00Z"))).toEqual({
      open: true,
      label: "Open until 3:30 PM",
    });
  });

  it("opens at 9:00 AM on a Saturday", () => {
    expect(openState(new Date("2026-10-10T15:00:00Z"))).toEqual({
      open: false,
      label: "Opens 9:00 AM",
    });
  });

  it("after Friday's close, opens Saturday at 9:00 AM", () => {
    expect(openState(new Date("2026-10-10T01:00:00Z"))).toEqual({
      open: false,
      label: "Opens tomorrow 9:00 AM",
    });
  });

  it("after Sunday's close, opens Monday at 7:00 AM", () => {
    expect(openState(new Date("2026-10-11T23:00:00Z"))).toEqual({
      open: false,
      label: "Opens tomorrow 7:00 AM",
    });
  });
});
