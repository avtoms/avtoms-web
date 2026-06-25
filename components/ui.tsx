"use client";
import React, { useEffect, useState } from "react";
import { Icon } from "./icons";
import { useT } from "./providers";
import { STATE_LABEL, type WoState, type FiscalStatus } from "@/lib/enums";
import { LANGS, type Lang } from "@/lib/i18n";
import { qrMatrix } from "@/lib/format";

// SSR-safe media query. useSyncExternalStore reads the real match on the FIRST client
// render (not after an effect), so narrow screens don't flash the desktop layout.
export function useMedia(query: string) {
  const subscribe = React.useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  const getSnapshot = React.useCallback(() => window.matchMedia(query).matches, [query]);
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}
export const useIsMobile = () => useMedia("(max-width: 860px)");

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft" | "dark";
  size?: "sm" | "md" | "lg"; icon?: string; iconRight?: string; full?: boolean;
};
export function Btn({ variant = "secondary", size = "md", icon, iconRight, children, full, style, ...rest }: BtnProps) {
  const pads = size === "sm" ? "7px 12px" : size === "lg" ? "13px 22px" : "10px 16px";
  const fs = size === "sm" ? 13 : size === "lg" ? 16 : 14.5;
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: pads,
    fontSize: `calc(${fs}px * var(--scale))`, fontWeight: 600, fontFamily: "var(--font-sans)",
    borderRadius: "var(--radius-sm)", cursor: "pointer", border: "1px solid transparent", whiteSpace: "nowrap",
    width: full ? "100%" : "auto", lineHeight: 1.1, letterSpacing: "-0.01em",
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: "var(--accent)", color: "var(--accent-ink)", boxShadow: "var(--shadow)" },
    secondary: { background: "var(--surface)", color: "var(--ink)", borderColor: "var(--line-2)" },
    ghost: { background: "transparent", color: "var(--ink-2)" },
    danger: { background: "var(--danger-soft)", color: "var(--danger)" },
    soft: { background: "var(--accent-soft)", color: "var(--accent-2)" },
    dark: { background: "var(--ink)", color: "var(--bg)" },
  };
  return (
    <button {...rest} className="an-btn" style={{ ...base, ...variants[variant], ...style }}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 15 : 17} />}
    </button>
  );
}

export function IconBtn({ icon, size = 18, style, active, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; size?: number; active?: boolean }) {
  return (
    <button {...rest} className="an-btn" style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38,
      borderRadius: "var(--radius-sm)", cursor: "pointer", border: "1px solid " + (active ? "transparent" : "var(--line)"),
      background: active ? "var(--accent-soft)" : "var(--surface)", color: active ? "var(--accent-2)" : "var(--ink-2)", flexShrink: 0, ...style,
    }}>
      <Icon name={icon} size={size} />
    </button>
  );
}

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";
export function Badge({ tone = "neutral", children, dot, style }: { tone?: Tone; children: React.ReactNode; dot?: boolean; style?: React.CSSProperties }) {
  const tones: Record<Tone, { bg: string; fg: string }> = {
    neutral: { bg: "var(--surface-2)", fg: "var(--ink-2)" },
    accent: { bg: "var(--accent-soft)", fg: "var(--accent-2)" },
    ok: { bg: "var(--ok-soft)", fg: "var(--ok)" },
    warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
    danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
    info: { bg: "var(--info-soft)", fg: "var(--info)" },
  };
  const tn = tones[tone] || tones.neutral;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: tn.bg, color: tn.fg, fontSize: "calc(12.5px * var(--scale))", fontWeight: 650, letterSpacing: "-0.01em", lineHeight: 1.2, whiteSpace: "nowrap", ...style }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: 99, background: "currentColor" }} />}
      {children}
    </span>
  );
}

const STATE_TONE: Record<WoState, Tone> = { draft: "neutral", estimated: "info", approved: "accent", in_progress: "warn", ready: "ok", invoiced: "info", closed: "neutral", canceled: "danger" };
export function StateBadge({ state, style }: { state: WoState; style?: React.CSSProperties }) {
  const t = useT();
  return <Badge tone={STATE_TONE[state] || "neutral"} dot style={style}>{t(STATE_LABEL[state])}</Badge>;
}

const FISCAL_TONE: Record<FiscalStatus, Tone> = { pending: "warn", fiscalized: "ok", failed: "danger", voided: "neutral" };
export function FiscalBadge({ status }: { status: FiscalStatus }) {
  const t = useT();
  const key = { pending: "fs_pending", fiscalized: "fs_fiscalized", failed: "fs_failed", voided: "fs_voided" }[status];
  return <Badge tone={FISCAL_TONE[status] || "neutral"} dot>{t(key)}</Badge>;
}

export function Card({ children, style, pad = 18, onClick, hover }: { children: React.ReactNode; style?: React.CSSProperties; pad?: number; onClick?: () => void; hover?: boolean }) {
  return (
    <div onClick={onClick} className={hover ? "an-card-hover" : ""} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: pad, boxShadow: "var(--shadow)", cursor: onClick ? "pointer" : "default", ...style }}>{children}</div>
  );
}

export function Field({ label, children, hint, style }: { label?: string; children: React.ReactNode; hint?: string; style?: React.CSSProperties }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label && <span style={{ fontSize: "calc(13px * var(--scale))", fontWeight: 600, color: "var(--ink-2)" }}>{label}</span>}
      {children}
      {hint && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{hint}</span>}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 13px", fontSize: "calc(14.5px * var(--scale))", fontFamily: "var(--font-sans)",
  color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line-2)", borderRadius: "var(--radius-sm)", outline: "none", boxSizing: "border-box",
};
export function TextInput({ style, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className="an-input" style={{ ...inputStyle, ...style }} />;
}
export function SelectInput({ children, style, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select {...rest} className="an-input" style={{ ...inputStyle, appearance: "none", cursor: "pointer", paddingRight: 34, ...style }}>{children}</select>
      <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ink-3)" }}>
        <Icon name="chevD" size={15} />
      </span>
    </div>
  );
}
export function TextArea({ style, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className="an-input" style={{ ...inputStyle, resize: "vertical", minHeight: 70, ...style }} />;
}

type Opt = string | { value: string; label: string };
export function Segmented({ options, value, onChange, size = "md", style }: { options: Opt[]; value: string; onChange: (v: string) => void; size?: "sm" | "md"; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "inline-flex", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: 3, gap: 2, ...style }}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const lbl = typeof o === "string" ? o : o.label;
        const on = v === value;
        return (
          <button key={v} onClick={() => onChange(v)} className="an-btn" style={{ padding: size === "sm" ? "5px 11px" : "8px 15px", border: "none", cursor: "pointer", borderRadius: "calc(var(--radius-sm) - 2px)", fontSize: "calc(13.5px * var(--scale))", fontWeight: 600, fontFamily: "var(--font-sans)", background: on ? "var(--surface)" : "transparent", color: on ? "var(--ink)" : "var(--ink-3)", boxShadow: on ? "var(--shadow)" : "none", whiteSpace: "nowrap" }}>{lbl}</button>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, maxWidth = 520, mobileSheet = true }: { open: boolean; onClose?: () => void; title?: string; children: React.ReactNode; footer?: React.ReactNode; maxWidth?: number; mobileSheet?: boolean }) {
  const isMobile = useIsMobile();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const sheet = isMobile && mobileSheet;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "oklch(0.15 0.02 60 / 0.45)", backdropFilter: "blur(2px)", display: "flex", alignItems: sheet ? "flex-end" : "center", justifyContent: "center", padding: sheet ? 0 : 20 }}>
      <div onClick={(e) => e.stopPropagation()} className={sheet ? "an-sheet-in" : "an-modal-in"} style={{ background: "var(--surface)", borderRadius: sheet ? "var(--radius-lg) var(--radius-lg) 0 0" : "var(--radius-lg)", width: "100%", maxWidth: sheet ? "100%" : maxWidth, maxHeight: sheet ? "92vh" : "88vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-lg)", overflow: "hidden", border: "1px solid var(--line)" }}>
        {(title || onClose) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <h3 style={{ margin: 0, fontSize: "calc(17px * var(--scale))", fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>{title}</h3>
            <IconBtn icon="x" size={17} onClick={onClose} style={{ width: 34, height: 34 }} />
          </div>
        )}
        <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>{children}</div>
        {footer && <div style={{ display: "flex", gap: 10, padding: "14px 18px", borderTop: "1px solid var(--line)", flexShrink: 0, justifyContent: "flex-end" }}>{footer}</div>}
      </div>
    </div>
  );
}

export function QR({ data, size = 132, color }: { data: string; size?: number; color?: string }) {
  const m = qrMatrix(data || "ofd", 25);
  const n = m.length, cell = size / n;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", background: "#fff", borderRadius: 8, padding: 8, boxSizing: "content-box" }}>
      {m.flatMap((row, y) => row.map((on, x) => (on ? <rect key={x + "-" + y} x={x * cell} y={y * cell} width={cell + 0.4} height={cell + 0.4} fill={color || "#111"} /> : null)))}
    </svg>
  );
}

export function Avatar({ name, size = 36, color }: { name: string; size?: number; color?: string }) {
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: 99, background: color || "var(--accent-soft)", color: color ? "#fff" : "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.38, flexShrink: 0, letterSpacing: "-0.02em" }}>{initials}</div>
  );
}

export function LangSwitcher({ lang, onChange, compact }: { lang: Lang; onChange: (l: Lang) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const cur = LANGS.find((l) => l.code === lang) || LANGS[0];
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} className="an-btn" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: compact ? "8px 10px" : "9px 13px", borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "calc(13.5px * var(--scale))" }}>
        <Icon name="globe" size={16} style={{ color: "var(--ink-3)" }} />
        <span>{compact ? cur.short : cur.label}</span>
        <Icon name="chevD" size={14} style={{ color: "var(--ink-3)" }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
          <div className="an-modal-in" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 91, minWidth: 170, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)", padding: 6 }}>
            {LANGS.map((l) => (
              <button key={l.code} onClick={() => { onChange(l.code); setOpen(false); }} className="an-row-btn" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 11px", border: "none", background: l.code === lang ? "var(--accent-soft)" : "transparent", color: l.code === lang ? "var(--accent-2)" : "var(--ink)", cursor: "pointer", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "calc(14px * var(--scale))", textAlign: "left" }}>
                <span>{l.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>{l.short}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function Empty({ icon = "clipboard", text }: { icon?: string; text?: string }) {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "48px 20px", color: "var(--ink-3)", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={24} />
      </div>
      <span style={{ fontSize: "calc(14px * var(--scale))", fontWeight: 500 }}>{text || t("empty")}</span>
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  // Uses currentColor so it stays visible on any background (incl. accent buttons).
  return <span className="an-spin" style={{ display: "inline-block", width: size, height: size, border: "2px solid color-mix(in oklch, currentColor 28%, transparent)", borderTopColor: "currentColor", borderRadius: "50%" }} />;
}

export function Logo({ size = 40, light }: { size?: number; light?: boolean }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, background: light ? "var(--accent-ink)" : "var(--accent)", color: light ? "var(--accent)" : "var(--accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon name="wrench" size={size * 0.56} strokeWidth={2} />
    </div>
  );
}
