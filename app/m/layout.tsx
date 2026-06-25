"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useAuth, useLang } from "@/components/providers";
import { Logo, LangSwitcher, IconBtn } from "@/components/ui";

export default function MechanicLayout({ children }: { children: React.ReactNode }) {
  const { session, logout } = useAuth();
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  const name = session?.staff.name || "";
  const phone = session?.staff.phone || "";

  const signOut = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 60,
          background: "color-mix(in oklch, var(--bg), transparent 6%)",
          borderBottom: "1px solid var(--line)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            padding: "11px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Logo size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 800,
                color: "var(--ink)",
                fontSize: "calc(15px * var(--scale))",
                letterSpacing: "-0.02em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name || t("role_mechanic")}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
              {phone}
            </div>
          </div>
          <LangSwitcher lang={lang} onChange={setLang} compact />
          <IconBtn icon="logout" onClick={signOut} aria-label={t("sign_out")} />
        </div>
      </header>

      <main style={{ flex: 1, width: "100%", maxWidth: 1040, margin: "0 auto", padding: "16px 16px 40px", boxSizing: "border-box" }}>
        {children}
      </main>
    </div>
  );
}
