"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useLang, useToast } from "@/components/providers";
import { Btn, Field, Badge, LangSwitcher, Logo, Spinner, useIsMobile } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api, ApiError } from "@/lib/api";
import { formatNational, isValidUzPhone, toE164 } from "@/lib/phone";

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
    <div style={{ display: "flex", gap: 9, justifyContent: "space-between" }}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} value={d.trim()} inputMode="numeric" maxLength={1}
          onChange={(e) => set(i, e.target.value.replace(/\D/g, "").slice(-1))}
          onKeyDown={(e) => { if (e.key === "Backspace" && !d.trim() && i > 0) refs.current[i - 1]?.focus(); }}
          className="an-input" style={{ width: "100%", aspectRatio: "1", textAlign: "center", fontSize: "calc(24px * var(--scale))", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--ink)", background: "var(--surface)", border: "1.5px solid var(--line-2)", borderRadius: "var(--radius-sm)", outline: "none", minWidth: 0 }} />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const { lang, setLang, t } = useLang();
  const { login } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [resend, setResend] = useState(60);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== "otp") return;
    setResend(60);
    const iv = setInterval(() => setResend((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [step]);

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
      router.replace(s.role === "mechanic" ? "/m" : "/dashboard");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      setOtp("");
      setBusy(false);
    }
  };

  const brand = (
    <div style={{ flex: isMobile ? "none" : "1 1 0", background: "var(--accent)", color: "var(--accent-ink)", padding: isMobile ? "26px 22px" : "48px 44px", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden", minHeight: isMobile ? "auto" : "100%" }}>
      <div style={{ position: "absolute", right: -80, top: -60, width: 280, height: 280, borderRadius: "50%", background: "var(--accent-2)", opacity: 0.35 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
        <Logo size={isMobile ? 36 : 46} light />
        <div>
          <div style={{ fontSize: isMobile ? 19 : 24, fontWeight: 800, letterSpacing: "-0.03em" }}>{t("app_name")}</div>
          <div style={{ fontSize: isMobile ? 12 : 14, opacity: 0.85, fontWeight: 500 }}>{t("tagline")}</div>
        </div>
      </div>
      {!isMobile && (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 18, maxWidth: 360 }}>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.03em" }}>
            {lang === "ru" ? "Весь автосервис в одном окне" : lang === "uzc" ? "Бутун автосервис битта ойнада" : "Butun avtoservis bitta oynada"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[[t("nav_workorders"), "clipboard"], [t("fiscal_qr"), "receipt"], [t("nav_reports"), "chart"]].map(([txt, ic]) => (
              <div key={txt} style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 15, fontWeight: 600, opacity: 0.95 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent-ink)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={ic} size={16} /></div>
                {txt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const form = (
    <div style={{ flex: isMobile ? "1" : "1 1 0", display: "flex", flexDirection: "column", padding: isMobile ? "22px" : "48px 44px", background: "var(--bg)", position: "relative" }}>
      <div style={{ position: "absolute", top: isMobile ? 18 : 28, right: isMobile ? 18 : 28 }}>
        <LangSwitcher lang={lang} onChange={setLang} compact={isMobile} />
      </div>
      <div style={{ margin: "auto", width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 22 }}>
        {step === "phone" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <h1 style={{ margin: 0, fontSize: "calc(27px * var(--scale))", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.03em" }}>{t("login_phone_title")}</h1>
              <p style={{ margin: 0, fontSize: "calc(15px * var(--scale))", color: "var(--ink-2)" }}>{t("login_phone_sub")}</p>
            </div>
            <Field label={t("phone")}>
              <div style={{ display: "flex", alignItems: "stretch", border: "1px solid var(--line-2)", borderRadius: "var(--radius-sm)", overflow: "hidden", background: "var(--surface)" }}>
                <span style={{ display: "flex", alignItems: "center", padding: "0 13px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--ink-2)", borderRight: "1px solid var(--line)", background: "var(--surface-2)" }}>+998</span>
                <input value={formatNational(phone)} onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendCode(); }} placeholder="90 123 45 67" inputMode="tel" className="an-input"
                  style={{ flex: 1, border: "none", outline: "none", padding: "12px 13px", fontSize: "calc(15.5px * var(--scale))", fontFamily: "var(--font-mono)", background: "transparent", color: "var(--ink)" }} />
              </div>
            </Field>
            <Btn variant="primary" size="lg" iconRight={busy ? undefined : "chevR"} full onClick={sendCode} disabled={busy}>
              {busy ? <Spinner /> : t("send_code")}
            </Btn>
          </>
        )}
        {step === "otp" && (
          <>
            <button onClick={() => setStep("phone")} className="an-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontSize: 14, fontWeight: 600, padding: 0, alignSelf: "flex-start" }}>
              <Icon name="arrowL" size={16} /> {t("back")}
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <h1 style={{ margin: 0, fontSize: "calc(27px * var(--scale))", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.03em" }}>{t("otp_title")}</h1>
              <p style={{ margin: 0, fontSize: "calc(15px * var(--scale))", color: "var(--ink-2)" }}>{t("otp_sub")}</p>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--ink)", fontSize: 15 }}>+998 {formatNational(phone)}</span>
            </div>
            <OtpBoxes value={otp} onChange={setOtp} onComplete={verify} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Badge tone="accent" dot>{t("otp_dev_hint")}</Badge>
              <button disabled={resend > 0} onClick={sendCode} className="an-btn" style={{ border: "none", background: "transparent", color: resend > 0 ? "var(--ink-3)" : "var(--accent-2)", cursor: resend > 0 ? "default" : "pointer", fontSize: 13.5, fontWeight: 600 }}>
                {resend > 0 ? t("resend") + " (" + resend + ")" : t("resend")}
              </button>
            </div>
            <Btn variant="primary" size="lg" full onClick={() => verify()} disabled={otp.length !== 6 || busy} style={otp.length !== 6 ? { opacity: 0.5 } : {}}>
              {busy ? <Spinner /> : t("verify")}
            </Btn>
            <Btn variant="ghost" size="sm" full onClick={() => setOtp("000000")}>↳ {t("otp_dev_hint")}</Btn>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: isMobile ? "column" : "row", background: "var(--bg)" }}>
      {brand}
      {form}
    </div>
  );
}
