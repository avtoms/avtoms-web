"use client";
// One demo-lead row with a status switcher (new → contacted → closed). Calls the admin API
// and refreshes the server component on change.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { DemoRequest } from "@/lib/types";

const STATUSES: { key: string; label: string; color: string; soft: string }[] = [
  { key: "new", label: "Yangi", color: "var(--accent-2)", soft: "var(--accent-soft)" },
  { key: "contacted", label: "Bog'lanildi", color: "var(--warn)", soft: "var(--warn-soft)" },
  { key: "closed", label: "Yopilgan", color: "var(--ink-3)", soft: "var(--surface-2)" },
];

const LANGS: Record<string, string> = { uz: "UZ", ru: "RU", en: "EN" };

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export function DemoRow({ req, last }: { req: DemoRequest; last: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(req.status || "new");
  const [busy, setBusy] = useState(false);

  const setTo = async (s: string) => {
    if (busy || s === status) return;
    setBusy(true);
    const prev = status;
    setStatus(s); // optimistic
    try {
      await api.setDemoRequestStatus(req.id, s);
      router.refresh();
    } catch (e) {
      setStatus(prev);
      alert(e instanceof ApiError ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  const cur = STATUSES.find((s) => s.key === status) ?? STATUSES[0];

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 18px", borderBottom: last ? "none" : "1px solid var(--line)", opacity: status === "closed" ? 0.62 : 1 }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: cur.soft, color: cur.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, fontFamily: "var(--font-sans)" }}>
        {(req.name || "?").trim().slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(15px * var(--scale))" }}>{req.name}</span>
          {req.shop && <span style={{ fontSize: 13, color: "var(--ink-2)" }}>· {req.shop}</span>}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 6, padding: "1px 6px" }}>{LANGS[req.lang ?? "uz"] ?? (req.lang ?? "").toUpperCase()}</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 5, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <a href={`tel:${req.phone}`} style={{ fontFamily: "var(--font-mono)", color: "var(--accent-2)", textDecoration: "none", fontWeight: 600 }}>{req.phone}</a>
          {req.city && <span style={{ color: "var(--ink-2)" }}>{req.city}</span>}
          <span style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{fmtDate(req.createdAt)}</span>
        </div>
        {req.message && <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 7, background: "var(--surface-2)", borderRadius: 8, padding: "8px 11px", lineHeight: 1.5 }}>{req.message}</div>}
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "wrap", maxWidth: 230, justifyContent: "flex-end" }}>
        {STATUSES.map((s) => {
          const on = s.key === status;
          return (
            <button key={s.key} disabled={busy} onClick={() => setTo(s.key)} className="an-btn"
              style={{ padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: busy ? "wait" : "pointer", fontFamily: "var(--font-sans)",
                border: on ? "1px solid " + s.color : "1px solid var(--line)",
                background: on ? s.soft : "transparent", color: on ? s.color : "var(--ink-3)" }}>
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
