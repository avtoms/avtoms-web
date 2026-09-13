"use client";
// Finances and statistics are one section in the redesign — "Moliya va statistika" — with one
// row of tabs across both. Underneath they stay two pages (the income statement and expense
// ledger on one, the analytics on the other), so this row switches tabs in place when the tab
// lives on the page already open, and navigates when it lives on the other.
import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, useLang } from "@/components/providers";
import { can } from "@/lib/perms";
import { cn } from "@/lib/utils";

export type FinanceTab = "overview" | "pl" | "money" | "work" | "products" | "customers" | "expenses";

const TABS: { key: FinanceTab; labelKey: string; page: "/statistics" | "/finances"; tab: string; manage?: boolean }[] = [
  { key: "overview", labelKey: "ft_overview", page: "/statistics", tab: "overview" },
  { key: "pl", labelKey: "ft_pl", page: "/finances", tab: "stats", manage: true },
  { key: "money", labelKey: "ft_cash", page: "/statistics", tab: "money" },
  { key: "work", labelKey: "ft_work", page: "/statistics", tab: "work" },
  { key: "products", labelKey: "ft_stock", page: "/statistics", tab: "products" },
  { key: "customers", labelKey: "ft_customers", page: "/statistics", tab: "customers" },
  { key: "expenses", labelKey: "expenses", page: "/finances", tab: "expenses", manage: true },
];

export function FinanceTabs({ current, onTab }: { current: FinanceTab; onTab: (pageTab: string) => void }) {
  const { t } = useLang();
  const { session } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  // The income statement and the ledger need the finance-manage grant; somebody who may only
  // look at the figures is not offered a tab that would refuse them.
  const tabs = TABS.filter((x) => !x.manage || can(session, "finance.manage"));
  return (
    <div className="inline-flex max-w-full flex-wrap gap-0.5 self-start rounded-[10px] bg-secondary p-1">
      {tabs.map((x) => (
        <button key={x.key} aria-pressed={current === x.key}
          onClick={() => (pathname === x.page ? onTab(x.tab) : router.push(`${x.page}?tab=${x.tab}`))}
          className={cn("min-h-9 rounded-[8px] px-3.5 text-[13.5px] font-semibold transition-colors touch:min-h-11",
            current === x.key ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground hover:text-foreground")}>
          {t(x.labelKey)}
        </button>
      ))}
    </div>
  );
}
