"use client";
// Sign-in, after the redesign: the product on the left — what it does, drawn as the order card
// a shop sees all day — and the door on the right: login and password, or a code by SMS.
// Both ways in are the ones the auth service has; nothing is offered that it cannot do.
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ClipboardList, Receipt, BarChart3, Wrench, ArrowLeft, ChevronRight } from "lucide-react";
import { useAuth, useLang, useToast } from "@/components/providers";
import { LangSwitcher, Spinner, useIsMobile } from "@/components/ui";
import { PlatePreview } from "@/components/plate";
import { api, ApiError } from "@/lib/api";
import { homeFor } from "@/lib/perms";
import { formatNational, isValidUzPhone, toE164 } from "@/lib/phone";
import { BUILD_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

function OtpBoxes({ value, onChange, onComplete }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, " ").split("").slice(0, 6);
  const set = (i: number, d: string) => {
    const arr = value.padEnd(6, " ").split("");
    arr[i] = d;
    const next = arr.join("").trimEnd();
    onChange(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
    if (next.replace(/\s/g, "").length === 6) onComplete(next.replace(/\s/g, ""));
  };
  return (
    <div className="flex justify-between gap-2">
      {digits.map((d, i) => (
        // inputMode is "text", not "numeric": a numeric keypad on a phone has no letters on
        // it, so a code containing any would be impossible to type on the device most people
        // sign in from. autoComplete="one-time-code" keeps the important mobile path intact —
        // a real SMS code is still offered for autofill and never has to be typed at all.
        <input key={i} ref={(el) => { refs.current[i] = el; }} value={d.trim()} inputMode="text" maxLength={1}
          autoComplete={i === 0 ? "one-time-code" : "off"} autoCapitalize="none" autoCorrect="off"
          // Letters are accepted as well as digits: a real SMS code is always numeric, but the
          // configured fallback code need not be. Lower-cased so the comparison cannot fail on
          // capitalisation alone.
          onChange={(e) => set(i, e.target.value.replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(-1))}
          onKeyDown={(e) => { if (e.key === "Backspace" && !d.trim() && i > 0) refs.current[i - 1]?.focus(); }}
          className="aspect-square w-full min-w-0 rounded-[10px] border-[1.5px] border-input bg-card text-center font-mono text-[24px] font-bold text-foreground outline-none focus:border-primary focus:ring-[3px] focus:ring-ring/20" />
      ))}
    </div>
  );
}

const inputCls = "h-12 w-full rounded-[10px] border border-input bg-card px-3.5 text-[15.5px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-[3px] focus:ring-ring/20";

export default function LoginPage() {
  const { lang, setLang, t } = useLang();
  const { login } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const isMobile = useIsMobile();

  // "password" is the default because it is the door most staff are given now; "phone" is
  // still here, because clients sign in by number and so does every account issued before
  // passwords existed.
  const [step, setStep] = useState<"password" | "phone" | "otp">("password");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [resend, setResend] = useState(60);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (step !== "otp") return;
    setResend(60);
    const iv = setInterval(() => setResend((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [step]);

  const signIn = async () => {
    if (!loginName.trim() || !password || busy) return;
    setBusy(true);
    try {
      const tp = await api.signIn(loginName.trim(), password);
      const s = login(tp);
      const dest = homeFor(s);
      // Same hand-off as the code flow: an admin's console is on another origin.
      if (s.role === "admin") { window.location.assign(dest); return; }
      router.replace(dest);
    } catch (e) {
      // The server answers a wrong password and an unknown login identically, on purpose, so
      // there is nothing more specific to say here than what it said.
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      setPassword("");
      setBusy(false);
    }
  };

  const sendCode = async () => {
    if (!isValidUzPhone(phone)) { toast(t("bad_phone"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      const r = await api.requestOtp(toE164(phone));
      setChallengeId(r.challengeId);
      setStep("otp");
      setOtp("");
      toast(t("send_code"), { icon: "send" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code?: string) => {
    const c = code || otp;
    if (c.length !== 6 || busy) return;
    setBusy(true);
    try {
      const tp = await api.verifyOtp(challengeId, c);
      const s = login(tp);
      const dest = homeFor(s);
      // An admin is handed to the console on its own domain, and middleware can only do that
      // with a cross-origin redirect — which the client-side router cannot follow.
      if (s.role === "admin") { window.location.assign(dest); return; }
      router.replace(dest);
    } catch (e) {
      // 403 means the code was right and access is the problem: the account is waiting on
      // an admin, or has been switched off. That is a dead end rather than a retry, so it
      // gets its own page instead of an error on a form the person will only try again.
      if (e instanceof ApiError && e.status === 403) {
        router.replace("/pending?phone=" + encodeURIComponent(phone));
        return;
      }
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      setOtp("");
      setBusy(false);
    }
  };

  const FEATURES: [React.ReactNode, string, string][] = [
    [<ClipboardList key="a" className="size-5" />, t("login_f1_title"), t("login_f1_sub")],
    [<Receipt key="b" className="size-5" />, t("login_f2_title"), t("login_f2_sub")],
    [<BarChart3 key="c" className="size-5" />, t("login_f3_title"), t("login_f3_sub")],
  ];

  const brand = (
    <div className={cn("relative flex flex-col justify-between overflow-hidden bg-primary text-primary-foreground", isMobile ? "px-5 py-6" : "min-h-screen flex-1 px-12 py-12")}>
      <div className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-40 left-40 size-[380px] rounded-full bg-white/[0.06]" />
      <div className="relative flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-[12px] bg-white text-primary"><Wrench className="size-6" strokeWidth={2.2} /></span>
        <div>
          <div className="text-[20px] font-bold tracking-[-0.02em]">{t("app_name")}</div>
          <div className="text-[13px] opacity-85">{t("tagline")}</div>
        </div>
      </div>
      {!isMobile && (
        <div className="relative flex max-w-[460px] flex-col gap-7">
          <h2 className="text-[42px] font-bold leading-[1.08] tracking-[-0.03em]">{t("login_headline")}</h2>
          {/* What the product is about, drawn as the thing a shop looks at all day: an order
              card on its way through the workshop. An illustration, not anybody's data. */}
          <div className="rounded-[14px] bg-white p-4 text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[14px] font-semibold text-ink-2">Z-0048</span>
              <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-[12px] font-semibold text-warning">{t("st_in_progress")} · 2/3</span>
            </div>
            <div className="mt-2.5 flex items-center gap-3">
              <PlatePreview plate="01A777AB" size="sm" />
              <span className="text-[15px] font-bold">Chevrolet Gentra</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full w-2/3 rounded-full bg-warning" /></div>
            <div className="mt-2.5 flex items-center justify-between text-[12.5px] text-muted-foreground">
              <span>{t("login_card_note")}</span>
              <span className="font-mono font-bold text-foreground">450 000</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-5">
            {FEATURES.map(([icon, title, sub]) => (
              <div key={title} className="flex flex-col gap-1.5">
                <span className="opacity-90">{icon}</span>
                <span className="text-[14px] font-bold">{title}</span>
                <span className="text-[12.5px] leading-snug opacity-80">{sub}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const tab = (key: "password" | "phone", label: string) => (
    <button onClick={() => { setStep(key); setForgot(false); }} aria-pressed={step === key || (key === "phone" && step === "otp")}
      className={cn("h-10 flex-1 rounded-[9px] text-[14px] font-semibold transition-colors",
        step === key || (key === "phone" && step === "otp") ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground hover:text-foreground")}>
      {label}
    </button>
  );

  const form = (
    <div className={cn("relative flex flex-1 flex-col bg-background", isMobile ? "px-5 py-6" : "min-h-screen px-12 py-10")}>
      <div className="flex justify-end">
        <LangSwitcher lang={lang} onChange={setLang} compact={isMobile} />
      </div>
      <div className="m-auto flex w-full max-w-[420px] flex-col gap-5 py-8">
        <div>
          <h1 className="text-[30px] font-bold tracking-[-0.03em] text-foreground">{t("login_phone_title")}</h1>
          <p className="mt-1 text-[15px] text-ink-2">{t("login_sub_account")}</p>
        </div>

        <div className="flex gap-1 rounded-[12px] bg-secondary p-1">
          {tab("password", t("tab_login_pw"))}
          {tab("phone", t("tab_phone"))}
        </div>

        {step === "password" && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13.5px] font-semibold text-ink-2">{t("login_label")}</span>
              {/* Lower-cased as it is typed, matching how the server stores and compares it. */}
              <input value={loginName} onChange={(e) => setLoginName(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") signIn(); }} placeholder="login"
                autoComplete="username" autoCapitalize="none" autoCorrect="off" className={cn(inputCls, "font-mono")} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between text-[13.5px] font-semibold text-ink-2">
                {t("password_label")}
                <button type="button" onClick={() => setForgot((v) => !v)} className="text-[13px] font-semibold text-primary-emphasis hover:underline">{t("forgot_pw")}</button>
              </span>
              <span className="relative">
                <input value={password} type={showPw ? "text" : "password"} onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") signIn(); }} placeholder="••••••"
                  autoComplete="current-password" className={cn(inputCls, "pr-12 font-mono")} />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? t("hide_pw") : t("show_pw")}
                  className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[8px] text-muted-foreground hover:bg-secondary hover:text-foreground">
                  {showPw ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </button>
              </span>
            </label>
            {/* A forgotten password cannot be recovered, only replaced — by the owner, from
                the staff screen — or sidestepped with a code sent to the phone on the account. */}
            {forgot && (
              <div className="rounded-[10px] bg-secondary px-3.5 py-3 text-[13px] leading-snug text-ink-2">
                {t("forgot_pw_hint")}{" "}
                <button onClick={() => { setStep("phone"); setForgot(false); }} className="font-semibold text-primary-emphasis hover:underline">{t("use_phone")}</button>
              </div>
            )}
            <button onClick={signIn} disabled={busy || !loginName.trim() || !password}
              className="flex h-12 items-center justify-center rounded-[10px] bg-primary text-[15.5px] font-semibold text-primary-foreground shadow-[var(--shadow)] transition-[filter] hover:brightness-[0.96] disabled:opacity-50">
              {busy ? <Spinner /> : t("sign_in")}
            </button>
          </>
        )}
        {step === "phone" && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13.5px] font-semibold text-ink-2">{t("phone")}</span>
              <span className="flex h-12 items-stretch overflow-hidden rounded-[10px] border border-input bg-card focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/20">
                <span className="flex items-center border-r border-border bg-secondary px-3.5 font-mono font-semibold text-ink-2">+998</span>
                <input value={formatNational(phone)} onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendCode(); }} placeholder="90 123 45 67" inputMode="tel"
                  className="min-w-0 flex-1 bg-transparent px-3.5 font-mono text-[15.5px] text-foreground outline-none" />
              </span>
            </label>
            <p className="-mt-2 text-[13px] text-muted-foreground">{t("login_phone_sub")}</p>
            <button onClick={sendCode} disabled={busy}
              className="flex h-12 items-center justify-center gap-1.5 rounded-[10px] bg-primary text-[15.5px] font-semibold text-primary-foreground shadow-[var(--shadow)] transition-[filter] hover:brightness-[0.96] disabled:opacity-50">
              {busy ? <Spinner /> : <>{t("send_code")} <ChevronRight className="size-4" /></>}
            </button>
          </>
        )}
        {step === "otp" && (
          <>
            <button onClick={() => setStep("phone")} className="inline-flex items-center gap-1.5 self-start text-[14px] font-semibold text-ink-2 hover:text-foreground">
              <ArrowLeft className="size-4" /> {t("back")}
            </button>
            <div>
              <div className="text-[18px] font-bold text-foreground">{t("otp_title")}</div>
              <p className="text-[14px] text-ink-2">{t("otp_sub")}</p>
              <span className="font-mono text-[15px] font-semibold text-foreground">+998 {formatNational(phone)}</span>
            </div>
            <OtpBoxes value={otp} onChange={setOtp} onComplete={verify} />
            <div className="flex justify-end">
              <button disabled={resend > 0} onClick={sendCode} className={cn("text-[13.5px] font-semibold", resend > 0 ? "text-muted-foreground" : "text-primary-emphasis hover:underline")}>
                {resend > 0 ? `${t("resend")} (${resend})` : t("resend")}
              </button>
            </div>
            <button onClick={() => verify()} disabled={otp.length !== 6 || busy}
              className="flex h-12 items-center justify-center rounded-[10px] bg-primary text-[15.5px] font-semibold text-primary-foreground shadow-[var(--shadow)] transition-[filter] hover:brightness-[0.96] disabled:opacity-50">
              {busy ? <Spinner /> : t("verify")}
            </button>
          </>
        )}
      </div>
      <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
        <span>{t("login_help")}</span>
        <span>{BUILD_VERSION}</span>
      </div>
    </div>
  );

  return (
    <div className={cn("app-scope flex min-h-screen bg-background", isMobile ? "flex-col" : "flex-row")}>
      {brand}
      {form}
    </div>
  );
}
