"use client";
// Owner console chrome (NavShell ported from owner.jsx): sidebar on desktop ≥860px,
// bottom tab bar + drawer on mobile. Wired to next/link + usePathname and the live session.
import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo, Avatar, IconBtn, LangSwitcher, Btn, Spinner, useIsMobile } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang } from "@/components/providers";
import { CreateWOModal } from "./_create-wo";

type NavItem = { key: string; route: string; icon: string; labelKey: string };
const ITEMS: NavItem[] = [
  { key: "dashboard", route: "/dashboard", icon: "dashboard", labelKey: "nav_dashboard" },
  { key: "workorders", route: "/work-orders", icon: "clipboard", labelKey: "nav_workorders" },
  { key: "customers", route: "/customers", icon: "users", labelKey: "nav_customers" },
  { key: "invoices", route: "/invoices", icon: "receipt", labelKey: "nav_invoices" },
  { key: "reports", route: "/reports", icon: "chart", labelKey: "nav_reports" },
  { key: "menu", route: "/menu", icon: "list", labelKey: "nav_menu" },
  { key: "staff", route: "/staff", icon: "team", labelKey: "nav_staff" },
  { key: "settings", route: "/settings", icon: "settings", labelKey: "nav_settings" },
];

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { session, logout, ready } = useAuth();
  const { lang, setLang, t } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);
  const [creating, setCreating] = useState(false);

  // Session hydrates from the cookie on mount (and is null during static prerender).
  // Hold the chrome + child pages until it's available so pages can safely read shopId.
  if (!ready || !session) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <Spinner size={28} />
      </div>
    );
  }

  const isActive = (route: string) => pathname === route || pathname.startsWith(route + "/");
  const cur = ITEMS.find((i) => isActive(i.route));
  const user = session?.staff ?? { name: "", phone: "" };

  const signOut = () => { logout(); router.replace("/login"); };

  // "+ New WO" on dashboard + work-orders list (not on the detail page).
  const showNewWo = pathname === "/dashboard" || pathname === "/work-orders";
  const newBtn = showNewWo ? (
    <Btn variant="primary" size={isMobile ? "sm" : "md"} icon="plus" aria-label={isMobile ? t("new_wo") : undefined} onClick={() => setCreating(true)}>{isMobile ? "" : t("new_wo")}</Btn>
  ) : null;

  const navList = ITEMS.map((it) => {
    const on = isActive(it.route);
    return (
      <Link key={it.key} href={it.route} onClick={() => setDrawer(false)} className="an-nav-item" style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 13px", borderRadius: "var(--radius-sm)",
        cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left", textDecoration: "none",
        background: on ? "var(--accent-soft)" : "transparent", color: on ? "var(--accent-2)" : "var(--ink-2)",
        fontWeight: on ? 700 : 600, fontSize: "calc(14.5px * var(--scale))",
      }}>
        <Icon name={it.icon} size={19} /> {t(it.labelKey)}
      </Link>
    );
  });

  const modal = <CreateWOModal open={creating} onClose={() => setCreating(false)} />;

  if (isMobile) {
    const primary = ITEMS.slice(0, 4);
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
        <header style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "color-mix(in oklch, var(--bg), transparent 6%)", borderBottom: "1px solid var(--line)", backdropFilter: "blur(8px)" }}>
          <Logo size={32} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: 16, letterSpacing: "-0.02em" }}>{cur ? t(cur.labelKey) : t("app_name")}</div>
          </div>
          {newBtn}
          <LangSwitcher lang={lang} onChange={setLang} compact />
        </header>
        <main style={{ flex: 1, padding: "16px 16px calc(88px + env(safe-area-inset-bottom))" }}>{children}</main>
        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 45, display: "flex", background: "var(--surface)", borderTop: "1px solid var(--line)", padding: "8px 6px", paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}>
          {primary.map((it) => {
            const on = isActive(it.route);
            return (
              <Link key={it.key} href={it.route} className="an-btn" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "transparent", color: on ? "var(--accent-2)" : "var(--ink-3)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, padding: "4px 0", textDecoration: "none" }}>
                <Icon name={it.icon} size={21} /> {t(it.labelKey).split(" ")[0]}
              </Link>
            );
          })}
          <button onClick={() => setDrawer(true)} aria-label="Menu" className="an-btn" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, padding: "4px 0" }}>
            <Icon name="menu" size={21} /> •••
          </button>
        </nav>
        {drawer && (
          <div onClick={() => setDrawer(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "oklch(0.15 0.02 60 / 0.45)", display: "flex", alignItems: "flex-end" }}>
            <div onClick={(e) => e.stopPropagation()} className="an-sheet-in" style={{ background: "var(--surface)", width: "100%", borderRadius: "var(--radius-lg) var(--radius-lg) 0 0", padding: 14, maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{navList}</div>
              <div style={{ height: 1, background: "var(--line)", margin: "12px 0" }} />
              <button onClick={signOut} className="an-nav-item" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 13px", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontFamily: "var(--font-sans)", background: "transparent", color: "var(--danger)", fontWeight: 600, fontSize: 14.5 }}><Icon name="logout" size={19} /> {t("sign_out")}</button>
            </div>
          </div>
        )}
        {modal}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "grid", gridTemplateColumns: "260px 1fr" }}>
      <aside style={{ borderRight: "1px solid var(--line)", background: "var(--surface)", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "20px 18px" }}>
          <Logo size={38} />
          <div><div style={{ fontWeight: 800, color: "var(--ink)", fontSize: 17, letterSpacing: "-0.02em" }}>{t("app_name")}</div><div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 500 }}>{t("role_owner")}</div></div>
        </div>
        <div style={{ flex: 1, padding: "6px 12px", display: "flex", flexDirection: "column", gap: 3, overflowY: "auto" }}>{navList}</div>
        <div style={{ padding: 12, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px" }}>
            <Avatar name={user.name} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, color: "var(--ink)", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div><div style={{ fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{user.phone}</div></div>
            <IconBtn icon="logout" size={17} onClick={signOut} style={{ width: 34, height: 34 }} />
          </div>
        </div>
      </aside>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{ position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "16px 28px", background: "color-mix(in oklch, var(--bg), transparent 6%)", borderBottom: "1px solid var(--line)", backdropFilter: "blur(8px)" }}>
          <h1 style={{ margin: 0, fontSize: "calc(21px * var(--scale))", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.025em" }}>{cur ? t(cur.labelKey) : ""}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{newBtn}<LangSwitcher lang={lang} onChange={setLang} /></div>
        </header>
        <main style={{ flex: 1, padding: "24px 28px", maxWidth: 1240, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>{children}</main>
      </div>
      {modal}
    </div>
  );
}
