"use client";
// Owner console chrome, rebuilt on the shadcn/ui kit. Desktop (≥860px): grouped sticky
// sidebar + content. Mobile (<860px): sticky header with a burger that opens a Sheet drawer,
// plus a bottom tab bar. The root carries `app-scope`, which activates the Tailwind + shadcn
// token bridge so everything inherits the runtime theme + dark mode.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ClipboardList, CalendarClock, Users, Car, Receipt, BarChart3, Wallet,
  Tags, Package, Truck, Bell, UsersRound, Settings, Menu as MenuIcon, Plus, Wrench, LogOut, Globe, ShoppingCart,
  Check, ChevronDown, type LucideIcon,
} from "lucide-react";
import { useAuth, useLang } from "@/components/providers";
import { can, canAny, type Permission } from "@/lib/perms";
import type { Session } from "@/lib/session";
import { LANGS } from "@/lib/i18n";
import { useIsMobile } from "@/components/ui";
import { Spinner } from "@/components/ui-kit/misc";
import { Button } from "@/components/ui-kit/button";
import { UserAvatar } from "@/components/ui-kit/avatar";
import { Sheet, SheetContent } from "@/components/ui-kit/sheet";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui-kit/dropdown-menu";
import { cn } from "@/lib/utils";
import { BUILD_VERSION } from "@/lib/version";
import { CreateWOModal } from "./_create-wo";
import { ChatWidget } from "@/components/ai-chat";

// Every nav item names the permission that opens it. A person is shown the shop they were
// hired to run and nothing else — an item they cannot use is not a hint that they should ask,
// it is a button that produces an error.
type NavItem = { key: string; route: string; icon: LucideIcon; labelKey: string; perms: Permission[] };
type NavGroup = { titleKey: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { titleKey: "nav_grp_main", items: [
    { key: "dashboard", route: "/dashboard", icon: LayoutDashboard, labelKey: "nav_dashboard", perms: ["finance.view"] },
    { key: "workorders", route: "/work-orders", icon: ClipboardList, labelKey: "nav_workorders", perms: ["orders.view"] },
    { key: "schedule", route: "/schedule", icon: CalendarClock, labelKey: "nav_schedule", perms: ["customers.manage"] },
  ]},
  { titleKey: "nav_grp_clients", items: [
    { key: "customers", route: "/customers", icon: Users, labelKey: "nav_customers", perms: ["customers.manage"] },
    { key: "vehicles", route: "/vehicles", icon: Car, labelKey: "nav_vehicles", perms: ["customers.manage"] },
  ]},
  { titleKey: "nav_grp_finance", items: [
    { key: "sales", route: "/sales", icon: ShoppingCart, labelKey: "nav_sales", perms: ["sales.view", "sales.manage"] },
    { key: "invoices", route: "/invoices", icon: Receipt, labelKey: "nav_invoices", perms: ["finance.manage"] },
    { key: "finances", route: "/finances", icon: Wallet, labelKey: "nav_finances", perms: ["finance.manage"] },
    { key: "statistics", route: "/statistics", icon: BarChart3, labelKey: "statistics", perms: ["finance.view"] },
  ]},
  { titleKey: "nav_grp_manage", items: [
    { key: "menu", route: "/menu", icon: Tags, labelKey: "nav_menu", perms: ["catalog.manage"] },
    { key: "inventory", route: "/inventory", icon: Package, labelKey: "nav_inventory", perms: ["warehouse.view", "warehouse.manage"] },
    { key: "contragents", route: "/contragents", icon: Truck, labelKey: "nav_contragents", perms: ["warehouse.manage", "finance.manage"] },
    { key: "reminders", route: "/reminders", icon: Bell, labelKey: "nav_reminders", perms: ["customers.manage"] },
    { key: "staff", route: "/staff", icon: UsersRound, labelKey: "nav_staff", perms: ["staff.manage"] },
    { key: "settings", route: "/settings", icon: Settings, labelKey: "nav_settings", perms: ["settings.manage"] },
  ]},
];
const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

const isActive = (pathname: string, route: string) => pathname === route || pathname.startsWith(route + "/");

// The subtitle says which hat the person is wearing. It used to say "Owner" to everybody,
// which was true when only owners could get here — a cashier reading it would reasonably
// conclude the console had signed them in as somebody else.
function Brand({ t, subtitle }: { t: (k: string) => string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 px-5 pb-4 pt-5">
      <div className="grid size-9 place-items-center rounded-[10px] bg-primary text-primary-foreground shadow-[var(--shadow)]">
        <Wrench className="size-[19px]" strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <div className="text-[15px] font-extrabold tracking-[-0.02em] text-foreground">{t("app_name")}</div>
        <div className="truncate text-[11.5px] font-medium text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}

// visibleGroups drops the items this person cannot open, and then any group left with none —
// an empty heading is worse than no heading, because it reads as something broken.
function visibleGroups(session: Session | null): NavGroup[] {
  return GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => canAny(session, ...it.perms)) }))
    .filter((g) => g.items.length > 0);
}

function NavList({ pathname, t, groups, onNavigate }: { pathname: string; t: (k: string) => string; groups: NavGroup[]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-2">
      {groups.map((g) => (
        <div key={g.titleKey}>
          <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground/80">
            {t(g.titleKey)}
          </div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const on = isActive(pathname, it.route);
              const Icon = it.icon;
              return (
                <Link key={it.key} href={it.route} onClick={onNavigate}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[14px] font-semibold tracking-[-0.01em] transition-colors",
                    on ? "bg-primary-soft text-primary-emphasis" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}>
                  {on && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />}
                  <Icon className={cn("size-[18px] shrink-0", on ? "text-primary-emphasis" : "text-muted-foreground")} />
                  {t(it.labelKey)}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function LangMenu({ lang, setLang }: { lang: string; setLang: (l: any) => void }) {
  const cur = LANGS.find((l) => l.code === lang) || LANGS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-border bg-card px-2.5 text-[13px] font-semibold text-foreground shadow-[var(--shadow)] outline-none transition-colors hover:bg-secondary">
          <Globe className="size-4 text-muted-foreground" />
          <span className="hidden sm:inline">{cur.short}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {LANGS.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => setLang(l.code)} className={cn(l.code === lang && "bg-primary-soft text-primary-emphasis")}>
            <span className="flex-1">{l.label}</span>
            {l.code === lang ? <Check className="size-4 !text-primary-emphasis" /> : <span className="text-[11px] font-bold text-muted-foreground">{l.short}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { session, logout, ready } = useAuth();
  const { lang, setLang, t } = useLang();
  const router = useRouter();
  const pathname = usePathname() || "/dashboard";
  const isMobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => { setDrawer(false); }, [pathname]);

  if (!ready || !session) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Spinner className="size-7" /></div>;
  }

  const groups = visibleGroups(session);
  // An owner is an owner; anybody else is whatever job they were given, and "staff" when they
  // hold grants but no named role.
  const subtitle = session.role === "owner" ? t("role_owner") : (session.roleName || t("role_staff"));
  const allowed = groups.flatMap((g) => g.items);
  const cur = ALL_ITEMS.find((i) => isActive(pathname, i.route));
  const user = session.staff ?? { name: "", phone: "" };
  const signOut = () => { logout(); router.replace("/login"); };
  const showNewWo = (pathname === "/dashboard" || pathname === "/work-orders") && can(session, "orders.create");
  const title = cur ? t(cur.labelKey) : t("app_name");
  const modal = <CreateWOModal open={creating} onClose={() => setCreating(false)} />;

  const newBtn = showNewWo ? (
    <Button size={isMobile ? "sm" : "default"} onClick={() => setCreating(true)}>
      <Plus />{!isMobile && t("new_wo")}
    </Button>
  ) : null;

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-border bg-card pl-1 pr-2.5 shadow-[var(--shadow)] outline-none transition-colors hover:bg-secondary">
          <UserAvatar name={user.name} className="size-7" />
          <span className="hidden max-w-[130px] truncate text-[13px] font-semibold text-foreground md:inline">{user.name}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel className="normal-case">
          <div className="flex flex-col gap-0.5 py-0.5">
            <span className="text-[13.5px] font-bold tracking-normal text-foreground">{user.name}</span>
            {user.phone && <span className="font-mono text-[12px] font-medium tracking-normal text-muted-foreground">{user.phone}</span>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={signOut}><LogOut /> {t("sign_out")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ── Mobile ──
  if (isMobile) {
    const primary = allowed.slice(0, 4);
    return (
      <div className="app-scope flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-40 flex items-center gap-2.5 border-b border-border bg-[color-mix(in_oklch,var(--bg),transparent_6%)] px-4 py-3 backdrop-blur-md">
          <div className="grid size-8 place-items-center rounded-[9px] bg-primary text-primary-foreground"><Wrench className="size-4" strokeWidth={2.2} /></div>
          <div className="min-w-0 flex-1"><div className="truncate text-[16px] font-extrabold tracking-[-0.02em] text-foreground">{title}</div></div>
          {newBtn}
          <LangMenu lang={lang} setLang={setLang} />
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 pb-[calc(84px+env(safe-area-inset-bottom))] pt-4">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-45 flex border-t border-border bg-card px-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5">
          {primary.map((it) => {
            const on = isActive(pathname, it.route);
            const Icon = it.icon;
            return (
              <Link key={it.key} href={it.route} className={cn("flex flex-1 flex-col items-center gap-0.5 rounded-[9px] py-1.5 text-[11px] font-semibold", on ? "text-primary-emphasis" : "text-muted-foreground")}>
                <Icon className="size-[21px]" /> {t(it.labelKey).split(" ")[0]}
              </Link>
            );
          })}
          <button onClick={() => setDrawer(true)} aria-label={t("menu")} className="flex flex-1 flex-col items-center gap-0.5 rounded-[9px] py-1.5 text-[11px] font-semibold text-muted-foreground">
            <MenuIcon className="size-[21px]" /> •••
          </button>
        </nav>

        <Sheet open={drawer} onOpenChange={setDrawer}>
          <SheetContent side="left" className="p-0">
            <Brand t={t} subtitle={subtitle} />
            <NavList pathname={pathname} t={t} groups={groups} onNavigate={() => setDrawer(false)} />
            <div className="border-t border-border p-3">
              <button onClick={signOut} className="flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-[14px] font-semibold text-destructive hover:bg-destructive-soft">
                <LogOut className="size-[18px]" /> {t("sign_out")}
              </button>
            </div>
          </SheetContent>
        </Sheet>
        {modal}
        {can(session, "ai.use") && <ChatWidget />}
      </div>
    );
  }

  // ── Desktop ──
  return (
    <div className="app-scope grid min-h-screen bg-background" style={{ gridTemplateColumns: "260px 1fr" }}>
      <aside className="sticky top-0 flex h-screen flex-col border-r border-border bg-card">
        <Brand t={t} subtitle={subtitle} />
        <NavList pathname={pathname} t={t} groups={groups} />
        <div className="m-3 flex items-center gap-2.5 rounded-[12px] bg-secondary/70 px-3 py-2.5">
          <UserAvatar name={user.name} className="size-9" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold text-foreground">{user.name}</div>
            <div className="truncate font-mono text-[12px] text-muted-foreground">{user.phone}</div>
          </div>
          <button onClick={signOut} aria-label={t("sign_out")} className="grid size-8 shrink-0 place-items-center rounded-[8px] text-muted-foreground hover:bg-card hover:text-destructive"><LogOut className="size-4" /></button>
        </div>
        <div className="px-5 pb-3 text-[10.5px] font-medium text-muted-foreground/70">{BUILD_VERSION}</div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-[color-mix(in_oklch,var(--bg),transparent_6%)] px-7 py-3.5 backdrop-blur-md">
          <h1 className="truncate text-[19px] font-extrabold tracking-[-0.025em] text-foreground">{title}</h1>
          <div className="flex items-center gap-2">{newBtn}<LangMenu lang={lang} setLang={setLang} />{userMenu}</div>
        </header>
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-7 py-6">{children}</main>
      </div>
      {modal}
      {can(session, "ai.use") && <ChatWidget />}
    </div>
  );
}
