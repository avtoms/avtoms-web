"use client";
// useAutoRefresh keeps a page's data fresh without the user reloading by hand.
//
// A shop runs several screens at once — an owner on the dashboard, a mechanic closing a job,
// a cashier taking payment — so data goes stale the moment someone else acts. This refetches
// when the tab comes back to the foreground (the common case: you switch away, come back, and
// expect current numbers), when the network returns, and optionally on an interval while the
// tab is actually visible.
//
// The callback is held in a ref so callers can pass an inline function without re-arming the
// listeners on every render, and refetches are skipped while the tab is hidden so a
// backgrounded tab doesn't poll needlessly.
import { useEffect, useRef } from "react";

export function useAutoRefresh(refresh: () => void | Promise<unknown>, opts?: { intervalMs?: number; enabled?: boolean }) {
  const intervalMs = opts?.intervalMs ?? 0;
  const enabled = opts?.enabled ?? true;
  const fn = useRef(refresh);
  fn.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    // Never let two refreshes overlap: a slow request must not queue up behind itself.
    let running = false;
    const run = () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      void Promise.resolve(fn.current()).finally(() => { running = false; });
    };
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    // "online" fires the moment navigator.onLine flips, which is routinely before traffic
    // actually flows again (captive portal, VPN reconnect, laptop wake). Give the connection
    // a moment rather than firing a burst of requests into a half-open network.
    let onlineTimer: ReturnType<typeof setTimeout> | undefined;
    const onOnline = () => { clearTimeout(onlineTimer); onlineTimer = setTimeout(run, 1500); };

    window.addEventListener("focus", run);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = intervalMs > 0 ? setInterval(run, intervalMs) : undefined;

    return () => {
      window.removeEventListener("focus", run);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(onlineTimer);
      if (timer) clearInterval(timer);
    };
  }, [intervalMs, enabled]);
}
