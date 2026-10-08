import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IDLE_LIMIT_MS, watchIdle } from "./idle";

/**
 * The staff-screen idle lock. EventTargets stand in for window and document,
 * a Map for localStorage, and fake timers move the clock.
 */

const MINUTE = 60 * 1000;
let storage: Map<string, string>;
let win: EventTarget;
let doc: EventTarget & { visibilityState: string };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T08:00:00Z"));
  storage = new Map();
  win = Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    },
  });
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  Object.defineProperty(globalThis, "window", { configurable: true, value: win });
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
});

afterEach(() => {
  vi.useRealTimers();
});

const input = (type = "pointerdown") => win.dispatchEvent(new Event(type));

describe("watchIdle", () => {
  it("locks 15 minutes after the last input, once", () => {
    const onIdle = vi.fn();
    watchIdle(onIdle);
    vi.advanceTimersByTime(IDLE_LIMIT_MS - MINUTE);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MINUTE);
    expect(onIdle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(IDLE_LIMIT_MS);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("counts pointer, keyboard and touch input, and nothing else", () => {
    const onIdle = vi.fn();
    watchIdle(onIdle);
    for (const type of ["pointerdown", "keydown", "touchstart"]) {
      vi.advanceTimersByTime(10 * MINUTE);
      input(type);
    }
    expect(onIdle).not.toHaveBeenCalled();
    // Background polling and other page activity are not input.
    vi.advanceTimersByTime(10 * MINUTE);
    win.dispatchEvent(new Event("message"));
    doc.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(5 * MINUTE);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("stays signed in while another POS tab has input", () => {
    const onIdle = vi.fn();
    watchIdle(onIdle);
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(5 * MINUTE);
      storage.set("balm_pos_last_input", String(Date.now()));
    }
    expect(onIdle).not.toHaveBeenCalled();
  });

  it("shares this tab's input with the others", () => {
    watchIdle(vi.fn());
    vi.advanceTimersByTime(MINUTE);
    input("keydown");
    expect(Number(storage.get("balm_pos_last_input"))).toBe(Date.now());
  });

  it("locks on the first input after a sleep longer than the limit, instead of counting it", () => {
    const onIdle = vi.fn();
    watchIdle(onIdle);
    // The device slept: the clock moved, the timers did not run.
    vi.setSystemTime(Date.now() + 20 * MINUTE);
    input();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("checks at once when the tab is shown again", () => {
    const onIdle = vi.fn();
    watchIdle(onIdle);
    vi.setSystemTime(Date.now() + 16 * MINUTE);
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("does nothing once stopped (signed out)", () => {
    const onIdle = vi.fn();
    const stop = watchIdle(onIdle);
    stop();
    vi.advanceTimersByTime(2 * IDLE_LIMIT_MS);
    input();
    expect(onIdle).not.toHaveBeenCalled();
  });
});
