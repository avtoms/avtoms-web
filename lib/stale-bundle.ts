// Recovering from a stale JS bundle after a deploy.
//
// Every build hashes its chunk filenames. When a new web image rolls out while a tab is still
// open, that tab holds the OLD build's chunk names — the moment it navigates to a route whose
// code hasn't loaded yet, the request 404s and React throws a ChunkLoadError. The page looks
// broken ("not found") until the user reloads by hand, which is exactly the failure this
// avoids: reload once, automatically, and the fresh build is picked up.
//
// The once-per-session guard matters: if the reload itself fails the same way, looping would
// make things worse, so the second occurrence falls through to the error UI instead.
const RELOAD_KEY = "an_chunk_reload";

export function isStaleBundleError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  if (!e) return false;
  const msg = e.message ?? "";
  return e.name === "ChunkLoadError"
    || /Loading chunk [^\s]+ failed/i.test(msg)
    || /Loading CSS chunk/i.test(msg)
    || /Failed to fetch dynamically imported module/i.test(msg)
    || /error loading dynamically imported module/i.test(msg);
}

// reloadOnceForStaleBundle reloads the page a single time per session. Returns true when a
// reload was triggered, so callers can render nothing instead of flashing an error first.
export function reloadOnceForStaleBundle(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false; // storage blocked → don't risk a reload loop
  }
  window.location.reload();
  return true;
}

// clearStaleBundleGuard re-arms the guard once the app has rendered successfully, so a later
// deploy in the same session can recover too.
export function clearStaleBundleGuard() {
  try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
}
