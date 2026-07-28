"use client";
// Route-level error boundary. Without one, a render error or a stale chunk after a deploy
// leaves a blank screen with no way forward but a manual reload. A stale bundle self-heals
// (reload once); anything else gets a readable message and a retry.
import { useEffect } from "react";
import { isStaleBundleError, reloadOnceForStaleBundle } from "@/lib/stale-bundle";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleBundleError(error);

  useEffect(() => {
    if (stale) reloadOnceForStaleBundle();
  }, [stale]);

  // A reload is already under way — render nothing rather than flashing an error first.
  if (stale) return null;

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Xatolik yuz berdi</div>
        <div style={{ fontSize: 13.5, color: "var(--ink-3, #71717a)", wordBreak: "break-word" }}>
          {error.message || "Kutilmagan xatolik"}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 4 }}>
          <button
            onClick={reset}
            style={{ padding: "9px 16px", borderRadius: 9, border: "1px solid var(--line, #e4e4e7)", background: "transparent", fontWeight: 600, cursor: "pointer" }}
          >
            Qayta urinish
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: "var(--accent, #2563eb)", color: "#fff", fontWeight: 600, cursor: "pointer" }}
          >
            Yangilash
          </button>
        </div>
      </div>
    </div>
  );
}
