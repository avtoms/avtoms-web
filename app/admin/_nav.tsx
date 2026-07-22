"use client";
// Client island for the sidebar nav: highlights the active route via usePathname.
// Kept separate so app/admin/layout.tsx can stay a server component.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BarChart3, Target, Inbox, Users, Car, LayoutList, Plug, Tags, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean };
type Group = { title: string; items: Item[] };

export const NAV_GROUPS: Group[] = [
  {
    title: "Boshqaruv",
    items: [
      { href: "/admin", label: "Umumiy", icon: LayoutDashboard, exact: true },
      { href: "/admin/services", label: "Xizmatlar tahlili", icon: BarChart3 },
    ],
  },
  {
    title: "Sotuv",
    items: [
      { href: "/admin/leads", label: "Lidlar (CRM)", icon: Target },
      { href: "/admin/demo-requests", label: "Demo so'rovlari", icon: Inbox },
    ],
  },
  { title: "Foydalanuvchilar", items: [{ href: "/admin/users", label: "Xodimlar", icon: Users }] },
  {
    title: "Katalog",
    items: [
      { href: "/admin/car-makes", label: "Markalar", icon: Car },
      { href: "/admin/car-models", label: "Modellar", icon: LayoutList },
      { href: "/admin/properties", label: "Xususiyatlar", icon: Tags },
    ],
  },
  { title: "Integratsiyalar", items: [{ href: "/admin/integrations", label: "Integratsiyalar", icon: Plug }] },
];

function isActive(pathname: string, item: Item): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function AdminNav() {
  const pathname = usePathname() || "/admin";
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-2">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground/80">
            {g.title}
          </div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((n) => {
              const on = isActive(pathname, n);
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[14px] font-semibold tracking-[-0.01em] transition-colors",
                    on
                      ? "bg-primary-soft text-primary-emphasis"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {on && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />}
                  <Icon className={cn("size-[18px] shrink-0", on ? "text-primary-emphasis" : "text-muted-foreground")} />
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

const TITLES: { match: (p: string) => boolean; title: string; sub?: string }[] = [
  { match: (p) => p === "/admin", title: "Umumiy ko'rsatkichlar", sub: "Platforma bo'yicha statistika" },
  { match: (p) => p.startsWith("/admin/services"), title: "Xizmatlar tahlili", sub: "Barcha avtoservislar bo'yicha" },
  { match: (p) => p.startsWith("/admin/leads"), title: "Lidlar (CRM)", sub: "Sotuv quvuri va potentsial mijozlar" },
  { match: (p) => p.startsWith("/admin/demo-requests"), title: "Demo so'rovlari", sub: "Landing sahifadan kelgan so'rovlar" },
  { match: (p) => p.startsWith("/admin/users"), title: "Foydalanuvchilar", sub: "Barcha avtoservis xodimlari" },
  { match: (p) => p.startsWith("/admin/car-makes"), title: "Avtomobil markalari", sub: "Katalog boshqaruvi" },
  { match: (p) => p.startsWith("/admin/car-models"), title: "Avtomobil modellari", sub: "Katalog boshqaruvi" },
  { match: (p) => p.startsWith("/admin/properties"), title: "Mahsulot xususiyatlari", sub: "Ombor xususiyatlari katalogi" },
  { match: (p) => p.startsWith("/admin/integrations"), title: "Integratsiyalar", sub: "Tashqi xizmatlar sozlamalari" },
];

export function AdminPageTitle() {
  const pathname = usePathname() || "/admin";
  const found = TITLES.find((t) => t.match(pathname));
  return (
    <div className="min-w-0">
      <h1 className="truncate text-[19px] font-extrabold tracking-[-0.025em] text-foreground">
        {found?.title ?? "Admin panel"}
      </h1>
      {found?.sub && <p className="mt-0.5 hidden truncate text-[12.5px] font-medium text-muted-foreground sm:block">{found.sub}</p>}
    </div>
  );
}
