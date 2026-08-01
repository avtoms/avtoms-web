"use client";
// Last-resort boundary: catches errors thrown by the root layout itself, where app/error.tsx
// cannot render. It must supply its own <html>/<body>.
import { useEffect } from "react";
import { isStaleBundleError, reloadOnceForStaleBundle } from "@/lib/stale-bundle";
import { crashLang, crashText } from "@/lib/crash-text";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleBundleError(error);
  const say = crashText();

  useEffect(() => {
    if (stale) reloadOnceForStaleBundle();
  }, [stale]);

  return (
    <html lang={crashLang() === "ru" ? "ru" : "uz"}>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        {!stale && (
          <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24 }}>
            <div style={{ maxWidth: 420, textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{say("error")}</div>
              <div style={{ fontSize: 13.5, color: "#71717a", wordBreak: "break-word" }}>
                {error.message || say("err_unexpected")}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 4 }}>
                <button onClick={reset} style={{ padding: "9px 16px", borderRadius: 9, border: "1px solid #e4e4e7", background: "transparent", fontWeight: 600, cursor: "pointer" }}>
                  {say("err_retry")}
                </button>
                <button onClick={() => window.location.reload()} style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                  {say("err_reload")}
                </button>
              </div>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
