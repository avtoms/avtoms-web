"use client";
// Responsive client shell for the admin console. Keeps app/admin/layout.tsx a server
// component (it reads getServerSession); the session identity + children are passed in.
// Desktop (>=860px): sticky sidebar + content grid.
// Mobile (<860px): sidebar hidden; sticky top bar with a hamburger that opens a slide-in
// drawer containing the nav + admin identity. Content goes full width.
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Avatar, IconBtn, useIsMobile } from "@/components/ui";
import { AdminTopbar } from "./_topbar";
import { AdminNav, AdminPageTitle } from "./_nav";
import { usePathname } from "next/navigation";

function SidebarInner({ name, phone }: { name: string; phone: string }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "20px 18px 18px" }}>
        <div
          style={{
            width: 38, height: 38, borderRadius: 11, background: "var(--ink)", color: "var(--bg)",
            display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow)",
          }}
        >
          <Icon name="settings" size={21} />
        </div>
        <div>
          <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: 16, letterSpacing: "-0.02em" }}>Admin konsoli</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 500 }}>Auto-Garaj</div>
        </div>
      </div>

      <AdminNav />

      <div
        style={{
          margin: 12, padding: "11px 12px", borderRadius: "var(--radius)", background: "var(--surface-2)",
          display: "flex", alignItems: "center", gap: 11, minWidth: 0,
        }}
      >
        <Avatar name={name} size={36} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {phone || "—"}
          </div>
        </div>
      </div>
    </>
  );
}

export function AdminShell({ name, phone, children }: { name: string; phone: string; children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();

  // Close the drawer on navigation and lock body scroll while it's open.
  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const headerPad = isMobile ? "14px 16px" : "16px 28px";
  const mainPad = isMobile ? "18px 16px" : "24px 28px";

  return (
    <div
      style={{
        minHeight: "100vh", background: "var(--bg)",
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "256px 1fr",
      }}
    >
      {!isMobile && (
        <aside
          style={{
            borderRight: "1px solid var(--line)", background: "var(--surface)", display: "flex",
            flexDirection: "column", position: "sticky", top: 0, height: "100vh",
          }}
        >
          <SidebarInner name={name} phone={phone} />
        </aside>
      )}

      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 14, padding: headerPad,
            background: "color-mix(in oklch, var(--bg), transparent 6%)",
            borderBottom: "1px solid var(--line)", backdropFilter: "blur(8px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {isMobile && (
              <IconBtn icon="menu" size={20} onClick={() => setDrawer(true)} aria-label="Menyu" style={{ width: 38, height: 38 }} />
            )}
            <AdminPageTitle />
          </div>
          <AdminTopbar />
        </header>
        <main style={{ flex: 1, padding: mainPad, maxWidth: 1180, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          {children}
        </main>
      </div>

      {isMobile && drawer && (
        <div
          onClick={() => setDrawer(false)}
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "oklch(0.15 0.02 60 / 0.45)", backdropFilter: "blur(2px)", display: "flex" }}
        >
          <style>{"@keyframes an-drawer-in { from { transform: translateX(-100%); } to { transform: none; } }"}</style>
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(280px, 84vw)", height: "100%", background: "var(--surface)",
              borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column",
              boxShadow: "var(--shadow-lg)", overflowY: "auto",
              animation: "an-drawer-in .22s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 12px 0" }}>
              <IconBtn icon="x" size={17} onClick={() => setDrawer(false)} aria-label="Yopish" style={{ width: 34, height: 34 }} />
            </div>
            <SidebarInner name={name} phone={phone} />
          </aside>
        </div>
      )}
    </div>
  );
}
