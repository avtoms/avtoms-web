"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { translate, translateProp, type Lang } from "@/lib/i18n";
import { clearStaleBundleGuard, isStaleBundleError, reloadOnceForStaleBundle } from "@/lib/stale-bundle";
import { applyTheme, type ThemeName, type FontName, type Density } from "@/lib/theme";
import { getSession, setSession as persist, clearSession, type Session } from "@/lib/session";
import { sessionFromTokenPair } from "@/lib/session";
import { setSessionClearedHandler } from "@/lib/api";
import type { TokenPair } from "@/lib/types";

/* ── i18n ── */
const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string; tp: (name: string) => string }>({
  lang: "uz", setLang: () => {}, t: (k) => k, tp: (n) => n,
});
export const useLang = () => useContext(LangCtx);
export const useT = () => useContext(LangCtx).t;

/* ── theme ── */
const ThemeCtx = createContext<{
  theme: ThemeName; font: FontName; density: Density;
  set: (p: Partial<{ theme: ThemeName; font: FontName; density: Density }>) => void;
}>({ theme: "steel", font: "manrope", density: "comfy", set: () => {} });
export const useTheme = () => useContext(ThemeCtx);

/* ── auth ── */
const AuthCtx = createContext<{
  session: Session | null;
  login: (tp: TokenPair) => Session;
  logout: () => void;
  ready: boolean;
}>({ session: null, login: () => ({} as Session), logout: () => {}, ready: false });
export const useAuth = () => useContext(AuthCtx);

/* ── toast ── */
type Toast = { id: string; msg: string; icon: string; tone: "ok" | "danger" | "accent" };
const ToastCtx = createContext<{ toast: (msg: string, opts?: { icon?: string; tone?: Toast["tone"] }) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

export function Providers({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("uz");
  const [theme, setTheme] = useState<ThemeName>("steel");
  const [font, setFont] = useState<FontName>("manrope");
  const [density, setDensity] = useState<Density>("comfy");
  const [session, setSessionState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // hydrate from storage on mount
  useEffect(() => {
    const sl = (localStorage.getItem("an_lang") as Lang) || "uz";
    setLangState(sl);
    try {
      const tw = JSON.parse(localStorage.getItem("an_tweaks") || "{}");
      if (tw.theme) setTheme(tw.theme);
      if (tw.font) setFont(tw.font);
      if (tw.density) setDensity(tw.density);
    } catch {}
    setSessionState(getSession());
    setReady(true);
  }, []);

  // A deploy replaces the hashed JS chunks this tab was served. Navigating afterwards asks
  // for a chunk that no longer exists, which surfaces as a "not found"-looking failure with
  // no way forward but a manual reload. Catch those (they escape the React error boundary
  // when they come from a navigation or a dynamic import) and reload once to pick up the new
  // build. Reaching this effect at all means the app rendered, so re-arm the guard first.
  useEffect(() => {
    clearStaleBundleGuard();
    const onError = (e: ErrorEvent) => { if (isStaleBundleError(e.error ?? e)) reloadOnceForStaleBundle(); };
    const onRejection = (e: PromiseRejectionEvent) => { if (isStaleBundleError(e.reason)) reloadOnceForStaleBundle(); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => { applyTheme(theme, font, density); }, [theme, font, density]);
  useEffect(() => { localStorage.setItem("an_tweaks", JSON.stringify({ theme, font, density })); }, [theme, font, density]);

  const setLang = useCallback((l: Lang) => { localStorage.setItem("an_lang", l); setLangState(l); }, []);
  const t = useCallback((k: string) => translate(lang, k), [lang]);
  const tp = useCallback((n: string) => translateProp(lang, n), [lang]);
  const set = useCallback((p: Partial<{ theme: ThemeName; font: FontName; density: Density }>) => {
    if (p.theme) setTheme(p.theme);
    if (p.font) setFont(p.font);
    if (p.density) setDensity(p.density);
  }, []);

  const login = useCallback((tp: TokenPair) => {
    const s = sessionFromTokenPair(tp);
    persist(s);
    setSessionState(s);
    return s;
  }, []);
  const logout = useCallback(() => { clearSession(); setSessionState(null); }, []);

  // The API layer discards the session when the server refuses the refresh token. Mirror that
  // into React state, or the console keeps rendering and firing requests against a session
  // that no longer exists — each one re-triggering the redirect.
  useEffect(() => {
    setSessionClearedHandler(() => setSessionState(null));
    return () => setSessionClearedHandler(null);
  }, []);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toast = useCallback((msg: string, opts?: { icon?: string; tone?: Toast["tone"] }) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((x) => [...x, { id, msg, icon: opts?.icon || "check", tone: opts?.tone || "ok" }]);
    timers.current[id] = setTimeout(() => setToasts((x) => x.filter((i) => i.id !== id)), 2800);
  }, []);

  return (
    <LangCtx.Provider value={{ lang, setLang, t, tp }}>
      <ThemeCtx.Provider value={{ theme, font, density, set }}>
        <AuthCtx.Provider value={{ session, login, logout, ready }}>
          <ToastCtx.Provider value={{ toast }}>
            {children}
            <ToastHost toasts={toasts} />
          </ToastCtx.Provider>
        </AuthCtx.Provider>
      </ThemeCtx.Provider>
    </LangCtx.Provider>
  );
}

function ToastHost({ toasts }: { toasts: Toast[] }) {
  return (
    <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 400, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", pointerEvents: "none" }}>
      {toasts.map((it) => (
        <div key={it.id} className="an-toast-in" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: "var(--ink)", color: "var(--bg)", borderRadius: 999, boxShadow: "var(--shadow-lg)", fontSize: "calc(14px * var(--scale))", fontWeight: 600, maxWidth: "90vw" }}>
          {it.msg}
        </div>
      ))}
    </div>
  );
}
