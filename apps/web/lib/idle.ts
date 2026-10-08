/**
 * Staff screens lock after 15 minutes without input (PCI DSS 8.2.8).
 *
 * The API ends a session that has been idle for 15 minutes too, but the POS
 * polls it every few seconds (the bell, messages, dispatch, the driver app, the
 * offline sync), and every poll counts as use there, so on its own the session
 * never idles out while a POS tab is open. This watches the person instead of
 * the network: only pointer, keyboard and touch input count.
 *
 * The time of the last input is shared between tabs through localStorage. All
 * POS tabs share one session, so a tab nobody is using must not end the session
 * of a cashier who is working in another one.
 */

export const IDLE_LIMIT_MS = 15 * 60 * 1000;

const LAST_INPUT_KEY = "balm_pos_last_input";
const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
/** How often the clock is checked. Browsers may stretch this to a minute in background tabs. */
const CHECK_MS = 15 * 1000;
/** Input arrives many times a second; the shared time is written at most this often. */
const SHARE_MS = 5 * 1000;

function sharedLastInput(): number {
  try {
    return Number(window.localStorage.getItem(LAST_INPUT_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Calls `onIdle` once, after `limitMs` with no input in any POS tab, and stops.
 * Returns a function that stops watching.
 */
export function watchIdle(onIdle: () => void, limitMs = IDLE_LIMIT_MS): () => void {
  let last = Date.now();
  let shared = 0;
  let stopped = false;

  const share = (now: number) => {
    if (now - shared < SHARE_MS) return;
    shared = now;
    try {
      window.localStorage.setItem(LAST_INPUT_KEY, String(now));
    } catch {
      // Storage blocked: each tab goes by its own input.
    }
  };

  const check = () => {
    if (stopped || Date.now() - Math.max(last, sharedLastInput()) < limitMs) return;
    stop();
    onIdle();
  };

  const onInput = () => {
    const now = Date.now();
    // Timers stand still while a device sleeps, so the first input after a
    // longer gap must not extend the session: check before counting it.
    if (now - last >= limitMs) {
      check();
      if (stopped) return;
    }
    last = now;
    share(now);
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") check();
  };

  function stop() {
    stopped = true;
    clearInterval(timer);
    for (const name of INPUT_EVENTS) window.removeEventListener(name, onInput, true);
    document.removeEventListener("visibilitychange", onVisible);
  }

  for (const name of INPUT_EVENTS) window.addEventListener(name, onInput, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisible);
  const timer = setInterval(check, CHECK_MS);
  // Signing in is input.
  share(last);
  return stop;
}
