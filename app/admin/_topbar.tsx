"use client";
import { useRouter } from "next/navigation";
import { useAuth, useLang } from "@/components/providers";
import { LangSwitcher, IconBtn, useIsMobile } from "@/components/ui";

// Client island for the admin header: shows the signed-in admin, language switcher, sign-out.
export function AdminTopbar() {
  const { session, logout } = useAuth();
  const { lang, setLang } = useLang();
  const router = useRouter();
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {!isMobile && session?.staff?.phone && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink-3)" }}>{session.staff.phone}</span>
      )}
      <LangSwitcher lang={lang} onChange={setLang} compact />
      <IconBtn icon="logout" size={17} onClick={() => { logout(); router.replace("/login"); }} style={{ width: 34, height: 34 }} />
    </div>
  );
}
