"use client";
// Client island for the sidebar nav: highlights the active route via usePathname.
// Kept separate so app/admin/layout.tsx can stay a server component.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

type Item = { href: string; label: string; icon: string; exact?: boolean };
type Group = { title: string; items: Item[] };

export const NAV_GROUPS: Group[] = [
  {
    title: "Boshqaruv",
    items: [
      { href: "/admin", label: "Umumiy", icon: "dashboard", exact: true },
      { href: "/admin/services", label: "Xizmatlar tahlili", icon: "chart" },
    ],
  },
  {
    title: "Sotuv",
    items: [
      { href: "/admin/leads", label: "Lidlar (CRM)", icon: "users" },
      { href: "/admin/demo-requests", label: "Demo so'rovlari", icon: "bell" },
    ],
  },
  { title: "Foydalanuvchilar", items: [{ href: "/admin/users", label: "Xodimlar", icon: "users" }] },
  {
    title: "Katalog",
    items: [
      { href: "/admin/car-makes", label: "Markalar", icon: "car" },
      { href: "/admin/car-models", label: "Modellar", icon: "list" },
    ],
  },
  { title: "Integratsiyalar", items: [{ href: "/admin/integrations", label: "Integratsiyalar", icon: "bell" }] },
];

function isActive(pathname: string, item: Item): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function AdminNav() {
  const pathname = usePathname() || "/admin";
  return (
    <nav style={{ flex: 1, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <div style={{ padding: "0 11px 6px", fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {g.title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {g.items.map((n) => {
              const on = isActive(pathname, n);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className="an-btn"
                  style={{
                    display: "flex", alignItems: "center", gap: 11, padding: "10px 12px",
                    borderRadius: "var(--radius-sm)", textDecoration: "none",
                    color: on ? "var(--accent-2)" : "var(--ink-2)",
                    background: on ? "var(--accent-soft)" : "transparent",
                    fontWeight: on ? 700 : 600, fontSize: 14.5, letterSpacing: "-0.01em",
                  }}
                >
                  <Icon name={n.icon} size={18} style={{ color: on ? "var(--accent-2)" : "var(--ink-3)" }} />
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

const TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: (p) => p === "/admin", title: "Umumiy ko'rsatkichlar" },
  { match: (p) => p.startsWith("/admin/services"), title: "Xizmatlar tahlili" },
  { match: (p) => p.startsWith("/admin/leads"), title: "Lidlar (CRM)" },
  { match: (p) => p.startsWith("/admin/demo-requests"), title: "Demo so'rovlari" },
  { match: (p) => p.startsWith("/admin/users"), title: "Foydalanuvchilar" },
  { match: (p) => p.startsWith("/admin/car-makes"), title: "Avtomobil markalari" },
  { match: (p) => p.startsWith("/admin/car-models"), title: "Avtomobil modellari" },
  { match: (p) => p.startsWith("/admin/integrations"), title: "Integratsiyalar" },
];

export function AdminPageTitle() {
  const pathname = usePathname() || "/admin";
  const found = TITLES.find((t) => t.match(pathname));
  return (
    <h1 style={{ margin: 0, fontSize: "calc(20px * var(--scale))", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.025em" }}>
      {found?.title ?? "Admin panel"}
    </h1>
  );
}
