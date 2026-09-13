"use client";
// Owner console chrome. Desktop (≥860px): a grouped sticky sidebar — the shop's own name at
// the top, live counts on the items that hold a queue, the signed-in person at the bottom —
// beside a page header that each page fills in through <PageHeader> (title, a line of
// context, its own buttons). Mobile (<860px): a sticky header, a bottom tab bar with short
// labels, a drawer for everything else, and a floating "new order" button where orders are
// made. The root carries `app-scope`, which activates the Tailwind + shadcn token bridge so
// everything inherits the runtime theme + dark mode.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid, ClipboardList, CalendarDays, Users, Car, CreditCard, BarChart3, Wallet,
  Tag, Package, Truck, Bell, UserRound, Settings, Plus, Wrench, LogOut, Globe, ShoppingCart,
  Check, ChevronDown, MoreHorizontal, type LucideIcon,
} from "lucide-react";
import { useAuth, useLang } from "@/components/providers";
import { can, canAny, type Permission } from "@/lib/perms";
import type { Session } from "@/lib/session";
import { LANGS } from "@/lib/i18n";
import { useShopProfile } from "@/lib/shop";
import { useNavCounts, type NavCounts } from "@/lib/use-nav-counts";
import { useIsMobile } from "@/components/ui";
import { Spinner } from "@/components/ui-kit/misc";
import { Button } from "@/components/ui-kit/button";
import { Sheet, SheetContent } from "@/components/ui-kit/sheet";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui-kit/dropdown-menu";
import { PageHeaderProvider, type PageHeaderSlots } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { BUILD_VERSION } from "@/lib/version";
import { CreateWOModal } from "./_create-wo";
import { ChatWidget } from "@/components/ai-chat";

// Every nav item names the permission that opens it. A person is shown the shop they were
// hired to run and nothing else — an item they cannot use is not a hint that they should ask,
// it is a button that produces an error.
type CountKey = keyof NavCounts;
type NavItem = { key: string; route: string; also?: string[]; icon: LucideIcon; labelKey: string; shortKey: string; perms: Permission[]; count?: CountKey };
type NavGroup = { titleKey: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { titleKey: "nav_grp_main", items: [
    { key: "dashboard", route: "/dashboard", icon: LayoutGrid, labelKey: "nav_dashboard", shortKey: "nav_short_dashboard", perms: ["finance.view"] },
    { key: "workorders", route: "/work-orders", icon: ClipboardList, labelKey: "nav_workorders", shortKey: "nav_short_workorders", perms: ["orders.view"], count: "workorders" },
    { key: "schedule", route: "/schedule", icon: CalendarDays, labelKey: "nav_schedule", shortKey: "nav_short_schedule", perms: ["customers.manage"], count: "schedule" },
  ]},
  { titleKey: "nav_grp_clients", items: [
    { key: "customers", route: "/customers", icon: Users, labelKey: "nav_customers", shortKey: "nav_short_customers", perms: ["customers.manage"] },
    { key: "vehicles", route: "/vehicles", icon: Car, labelKey: "nav_vehicles", shortKey: "nav_short_vehicles", perms: ["customers.manage"] },
    { key: "reminders", route: "/reminders", icon: Bell, labelKey: "nav_reminders", shortKey: "nav_short_reminders", perms: ["customers.manage"] },
  ]},
  { titleKey: "nav_grp_finance", items: [
    { key: "invoices", route: "/invoices", icon: CreditCard, labelKey: "nav_cash", shortKey: "nav_short_cash", perms: ["finance.manage"], count: "invoices" },
    // Finances and statistics are one section with one row of tabs across both pages (see
    // _finance-nav), so one item stands for both and either page lights it up. Somebody who
    // holds only the manage grant lands on the income statement, the page they can open.
    { key: "statistics", route: "/statistics", also: ["/finances"], icon: BarChart3, labelKey: "nav_money_stats", shortKey: "nav_short_finances", perms: ["finance.view", "finance.manage"] },
    { key: "sales", route: "/sales", icon: ShoppingCart, labelKey: "nav_quick_sale", shortKey: "nav_short_sales", perms: ["sales.view", "sales.manage"] },
  ]},
  { titleKey: "nav_grp_manage", items: [
    { key: "menu", route: "/menu", icon: Tag, labelKey: "nav_services", shortKey: "nav_short_services", perms: ["catalog.manage"] },
    { key: "inventory", route: "/inventory", icon: Package, labelKey: "nav_inventory", shortKey: "nav_short_inventory", perms: ["warehouse.view", "warehouse.manage"], count: "inventory" },
    { key: "contragents", route: "/contragents", icon: Truck, labelKey: "nav_contragents", shortKey: "nav_short_contragents", perms: ["warehouse.manage", "finance.manage"] },
    { key: "staff", route: "/staff", icon: UserRound, labelKey: "nav_staff", shortKey: "nav_short_staff", perms: ["staff.manage"] },
    { key: "settings", route: "/settings", icon: Settings, labelKey: "nav_settings", shortKey: "nav_short_settings", perms: ["settings.manage"] },
  ]},
];
const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

// How loud each queue's badge is: orders in flight are ordinary work, bookings are just
// information, unpaid bills want attention, and stock that is running out is a problem.
const COUNT_TONE: Record<CountKey, string> = {
  workorders: "bg-primary-soft text-primary-emphasis",
  schedule: "bg-secondary text-ink-2",
  invoices: "bg-warning-soft text-warning",
  inventory: "bg-destructive-soft text-destructive",
};

const isActive = (pathname: string, route: string) => pathname === route || pathname.startsWith(route + "/");
const itemActive = (pathname: string, it: NavItem) => isActive(pathname, it.route) || (it.also ?? []).some((r) => isActive(pathname, r));

// The sidebar is headed by the shop, not the product: somebody working in two shops' consoles
// has to know at a glance which one is open. Until the shop has a name, the product's stands in.
function Brand({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 px-5 pb-5 pt-5">
      <div className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-primary text-primary-foreground shadow-[var(--shadow)]">
        <Wrench className="size-5" strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[15px] font-bold tracking-[-0.02em] text-foreground">{name}</div>
        {sub && <div className="truncate text-[12.5px] font-medium text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

// visibleGroups drops the items this person cannot open, and then any group left with none —
// an empty heading is worse than no heading, because it reads as something broken.
function visibleGroups(session: Session | null): NavGroup[] {
  return GROUPS
    .map((g) => ({
      ...g,
      items: g.items
        .filter((it) => canAny(session, ...it.perms))
        // The finance section opens on the analytics, which needs the view grant; somebody
        // holding only the manage grant is sent to the income statement instead.
        .map((it) => (it.key === "statistics" && !can(session, "finance.view") ? { ...it, route: "/finances" } : it)),
    }))
    .filter((g) => g.items.length > 0);
}

function CountBadge({ k, n }: { k: CountKey; n?: number }) {
  if (!n) return null;
  return (
    <span className={cn("grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 font-mono text-[11.5px] font-bold", COUNT_TONE[k])}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function NavList({ pathname, t, groups, counts, onNavigate }: {
  pathname: string; t: (k: string) => string; groups: NavGroup[]; counts: NavCounts; onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-2">
      {groups.map((g) => (
        <div key={g.titleKey}>
          <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/80">
            {t(g.titleKey)}
          </div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const on = itemActive(pathname, it);
              const Icon = it.icon;
              return (
                <Link key={it.key} href={it.route} onClick={onNavigate}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2 text-[14.5px] tracking-[-0.01em] transition-colors",
                    on ? "bg-primary-soft font-semibold text-primary-emphasis" : "font-medium text-ink-2 hover:bg-secondary hover:text-foreground",
                  )}>
                  <Icon className={cn("size-[18px] shrink-0", on ? "text-primary-emphasis" : "text-muted-foreground")} />
                  <span className="min-w-0 flex-1 truncate">{t(it.labelKey)}</span>
                  {it.count && <CountBadge k={it.count} n={counts[it.count]} />}
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
        <button aria-label={cur.label} className="inline-flex h-9 touch:h-11 touch:px-3 items-center gap-1.5 rounded-[9px] border border-border bg-card px-2.5 text-[13px] font-semibold text-foreground outline-none transition-colors hover:bg-secondary">
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

function Initials({ name, className }: { name: string; className?: string }) {
  const initials = (name || "?").split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return <span className={cn("grid shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground", className)}>{initials}</span>;
}

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { session, logout, ready } = useAuth();
  const { lang, setLang, t } = useLang();
  const router = useRouter();
  const pathname = usePathname() || "/dashboard";
  const isMobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);
  const [creating, setCreating] = useState(false);
  const profile = useShopProfile();
  const counts = useNavCounts(session, pathname);

  // Portal targets for <PageHeader>. Callback refs, so a switch between the phone and desktop
  // layouts (which mounts a different header) hands the pages the new slots.
  const [titleEl, setTitleEl] = useState<HTMLElement | null>(null);
  const [metaEl, setMetaEl] = useState<HTMLElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null);
  const [customTitle, setCustomTitleState] = useState(false);
  const setCustomTitle = useCallback((on: boolean) => setCustomTitleState(on), []);
  const slots = useMemo<PageHeaderSlots>(
    () => ({ title: titleEl, meta: metaEl, actions: actionsEl, setCustomTitle }),
    [titleEl, metaEl, actionsEl, setCustomTitle],
  );

  useEffect(() => { setDrawer(false); }, [pathname]);

  if (!ready || !session) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Spinner className="size-7" /></div>;
  }

  const groups = visibleGroups(session);
  // An owner is an owner; anybody else is whatever job they were given, and "staff" when they
  // hold grants but no named role.
  const roleLabel = session.role === "owner" ? t("role_owner") : (session.roleName || t("role_staff"));
  const shopName = profile.name || t("app_name");
  const shopSub = profile.name ? profile.address : t("tagline");
  const allowed = groups.flatMap((g) => g.items);
  const cur = ALL_ITEMS.find((i) => itemActive(pathname, i));
  const user = session.staff ?? { name: "", phone: "" };
  const signOut = () => { logout(); router.replace("/login"); };
  const showNewWo = (pathname === "/dashboard" || pathname === "/work-orders") && can(session, "orders.create");
  const title = cur ? t(cur.labelKey) : t("app_name");
  const modal = <CreateWOModal open={creating} onClose={() => setCreating(false)} />;
  const hasChat = can(session, "ai.use");

  const header = (mobile: boolean) => (
    <header className={cn(
      "sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-card",
      mobile ? "px-4 py-3" : "min-h-[66px] px-7 py-3",
    )}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {mobile && <div className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-primary text-primary-foreground"><Wrench className="size-4" strokeWidth={2.2} /></div>}
        {!customTitle && <h1 className={cn("truncate font-bold tracking-[-0.025em] text-foreground", mobile ? "text-[16px]" : "text-[19px]")}>{title}</h1>}
        <div ref={setTitleEl} className="contents" />
        <div ref={setMetaEl} className={cn("min-w-0 truncate text-[13px] text-muted-foreground", mobile && "hidden")} />
      </div>
      <div className="flex max-w-full items-center gap-2 overflow-x-auto">
        <div ref={setActionsEl} className="flex items-center gap-2 empty:hidden" />
        {!mobile && showNewWo && (
          <Button onClick={() => setCreating(true)}><Plus />{t("new_wo")}</Button>
        )}
        <LangMenu lang={lang} setLang={setLang} />
      </div>
    </header>
  );

  // ── Mobile ──
  if (isMobile) {
    const primary = allowed.slice(0, 4);
    return (
      <PageHeaderProvider value={slots}>
        <div className="app-scope flex min-h-screen flex-col bg-background">
          {header(true)}
          <main className="min-w-0 flex-1 overflow-x-hidden px-4 pb-[calc(84px+env(safe-area-inset-bottom))] pt-4">{children}</main>

          <nav className="fixed inset-x-0 bottom-0 z-45 flex border-t border-border bg-card px-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5">
            {primary.map((it) => {
              const on = itemActive(pathname, it);
              const Icon = it.icon;
              return (
                <Link key={it.key} href={it.route} className={cn("relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[9px] py-1.5 text-[11px] font-semibold", on ? "text-primary-emphasis" : "text-muted-foreground")}>
                  <Icon className="size-[21px]" />
                  <span className="max-w-full truncate px-0.5">{t(it.shortKey)}</span>
                  {it.count && !!counts[it.count] && <span className="absolute right-[calc(50%-20px)] top-1 size-2 rounded-full bg-destructive" />}
                </Link>
              );
            })}
            <button onClick={() => setDrawer(true)} aria-label={t("menu")} className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-[9px] py-1.5 text-[11px] font-semibold text-muted-foreground">
              <MoreHorizontal className="size-[21px]" /> {t("nav_more")}
            </button>
          </nav>

          {/* The floating "new order" button sits where the thumb already is. It stacks above
              the assistant's launcher when that is present, rather than landing on top of it. */}
          {showNewWo && (
            <button onClick={() => setCreating(true)}
              className="fixed right-4 z-40 inline-flex h-13 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-bold text-primary-foreground shadow-[var(--shadow-lg)] active:scale-[0.98]"
              style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${hasChat ? 152 : 88}px)` }}>
              <Plus className="size-5" /> {t("new_wo_short")}
            </button>
          )}

          <Sheet open={drawer} onOpenChange={setDrawer}>
            <SheetContent side="left" className="flex flex-col p-0">
              <Brand name={shopName} sub={shopSub} />
              <NavList pathname={pathname} t={t} groups={groups} counts={counts} onNavigate={() => setDrawer(false)} />
              <div className="border-t border-border p-3">
                <div className="mb-2 flex items-center gap-2.5 px-2">
                  <Initials name={user.name} className="size-9 text-[13px]" />
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-bold text-foreground">{user.name}</div>
                    <div className="truncate font-mono text-[12px] text-muted-foreground">{user.phone}</div>
                  </div>
                </div>
                <button onClick={signOut} className="flex min-h-11 w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-[14px] font-semibold text-destructive hover:bg-destructive-soft">
                  <LogOut className="size-[18px]" /> {t("sign_out")}
                </button>
              </div>
            </SheetContent>
          </Sheet>
          {modal}
          {hasChat && <ChatWidget />}
        </div>
      </PageHeaderProvider>
    );
  }

  // ── Desktop ──
  return (
    <PageHeaderProvider value={slots}>
      <div className="app-scope grid min-h-screen bg-background" style={{ gridTemplateColumns: "250px 1fr" }}>
        <aside className="sticky top-0 flex h-screen flex-col border-r border-border bg-card">
          <Brand name={shopName} sub={shopSub} />
          <NavList pathname={pathname} t={t} groups={groups} counts={counts} />
          <div className="m-3 mb-2 flex items-center gap-2.5 rounded-[12px] bg-secondary/70 px-3 py-2.5" title={user.phone}>
            <Initials name={user.name} className="size-9 text-[13px]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold text-foreground">{user.name}</div>
              <div className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
                <span className="truncate">{roleLabel}</span>
                <span aria-hidden>·</span>
                <span className="size-1.5 shrink-0 rounded-full bg-success" />
                <span>{t("online")}</span>
              </div>
            </div>
            <button onClick={signOut} aria-label={t("sign_out")} title={t("sign_out")} className="grid size-8 shrink-0 place-items-center rounded-[8px] text-muted-foreground hover:bg-card hover:text-destructive"><LogOut className="size-4" /></button>
          </div>
          <div className="px-5 pb-3 text-[10.5px] font-medium text-muted-foreground/70">{BUILD_VERSION}</div>
        </aside>

        <div className="flex min-w-0 flex-col">
          {header(false)}
          <main className="mx-auto w-full max-w-[1280px] flex-1 px-7 py-6">{children}</main>
        </div>
        {modal}
        {hasChat && <ChatWidget />}
      </div>
    </PageHeaderProvider>
  );
}
