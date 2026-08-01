"use client";
// Client island for the sidebar nav: highlights the active route via usePathname.
// Kept separate so app/admin/layout.tsx can stay a server component.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BarChart3, Target, Inbox, Users, Car, LayoutList, Plug, Tags, FolderTree, Store, type LucideIcon,
} from "lucide-react";
import { useLang } from "@/components/providers";
import { cn } from "@/lib/utils";

// Labels are i18n KEYS, not words: this console has a language switcher in its header, and a
// sidebar written in one language would sit there ignoring it.
type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean };
type Group = { title: string; items: Item[] };

export const NAV_GROUPS: Group[] = [
  {
    title: "a_grp_manage",
    items: [
      { href: "/admin", label: "a_nav_overview", icon: LayoutDashboard, exact: true },
      { href: "/admin/services", label: "a_services", icon: BarChart3 },
    ],
  },
  {
    title: "a_grp_sales",
    items: [
      { href: "/admin/leads", label: "a_leads", icon: Target },
      { href: "/admin/demo-requests", label: "a_demo", icon: Inbox },
    ],
  },
  {
    title: "a_grp_users",
    items: [
      { href: "/admin/shops", label: "a_shops", icon: Store },
      { href: "/admin/users", label: "a_staff", icon: Users },
    ],
  },
  {
    title: "a_grp_catalog",
    items: [
      { href: "/admin/car-makes", label: "a_makes", icon: Car },
      { href: "/admin/car-models", label: "a_models", icon: LayoutList },
      { href: "/admin/properties", label: "a_properties", icon: Tags },
      { href: "/admin/catalog", label: "a_catalog_nav", icon: FolderTree },
    ],
  },
  { title: "a_grp_integrations", items: [{ href: "/admin/integrations", label: "a_grp_integrations", icon: Plug }] },
];

function isActive(pathname: string, item: Item): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function AdminNav() {
  const pathname = usePathname() || "/admin";
  const { t } = useLang();
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-2">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground/80">
            {t(g.title)}
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
                  {t(n.label)}
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
  { match: (p) => p === "/admin", title: "a_overview", sub: "a_overview_sub" },
  { match: (p) => p.startsWith("/admin/services"), title: "a_services", sub: "a_services_sub" },
  { match: (p) => p.startsWith("/admin/leads"), title: "a_leads", sub: "a_leads_sub" },
  { match: (p) => p.startsWith("/admin/demo-requests"), title: "a_demo", sub: "a_demo_sub" },
  // Before /admin/services would ever be tried against it — startsWith is order-sensitive,
  // and these two paths share no prefix today but read alike enough to invite one later.
  { match: (p) => p.startsWith("/admin/shops"), title: "a_shops", sub: "a_shops_sub" },
  { match: (p) => p.startsWith("/admin/users"), title: "a_users", sub: "a_users_sub" },
  { match: (p) => p.startsWith("/admin/car-makes"), title: "a_makes_title", sub: "a_catalog_sub" },
  { match: (p) => p.startsWith("/admin/car-models"), title: "a_models_title", sub: "a_catalog_sub" },
  { match: (p) => p.startsWith("/admin/properties"), title: "a_properties_title", sub: "a_properties_sub" },
  { match: (p) => p.startsWith("/admin/catalog"), title: "a_catalog_title", sub: "a_catalog_sub" },
  { match: (p) => p.startsWith("/admin/integrations"), title: "a_grp_integrations", sub: "a_integrations_sub" },
];

export function AdminPageTitle() {
  const pathname = usePathname() || "/admin";
  const { t } = useLang();
  const found = TITLES.find((x) => x.match(pathname));
  return (
    <div className="min-w-0">
      <h1 className="truncate text-[19px] font-extrabold tracking-[-0.025em] text-foreground">
        {t(found?.title ?? "a_panel")}
      </h1>
      {found?.sub && <p className="mt-0.5 hidden truncate text-[12.5px] font-medium text-muted-foreground sm:block">{t(found.sub)}</p>}
    </div>
  );
}
