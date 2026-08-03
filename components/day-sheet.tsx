"use client";
// The day sheet: everything a shop earned and spent on one chosen day, named document by
// document.
//
// The figures above it (revenue, cost, profit) are a single number per line, which is enough
// to know a day went well and never enough to know why. This is the "why": which cars were in,
// what went over the counter, what was paid out — each with its own subtotal, so the totals on
// the cards above can be read back to the rows that made them.
//
// It is composed in the browser from the same rules the server's profit-and-loss uses, so the
// two agree by construction rather than by coincidence:
//
//   revenue = work orders CREATED that day that reached invoiced or closed
//           + counter sales made that day that were not voided
//   overhead = expenses incurred that day
//
// The "created that day" part is worth stating plainly, because it is not obvious: an order
// opened on Monday and closed on Friday is Monday's revenue. Orders opened that day and still
// open are listed too, greyed, marked as not yet counted — leaving them out would make the
// sheet look like the whole day when it is only the finished part of it.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Skeleton } from "@/components/ui-kit/misc";
import { StateBadge } from "@/components/ui";
import { useLang } from "@/components/providers";
import { api } from "@/lib/api";
import { money, num, orderLabel } from "@/lib/format";
import { expenseCategory } from "@/lib/system-text";
import { PaidBadge } from "@/components/payment-picker";
import { woStateFromProto, paymentFromProto, paymentLabelKey } from "@/lib/enums";
import { cn } from "@/lib/utils";
import type { WorkOrder, Sale, ShopExpense } from "@/lib/types";

const saleLabel = (s: Sale) => "S-" + String(num(s.saleNo) || 0).padStart(4, "0");
// An order's revenue is its lines net of the whole-order discount — the same arithmetic the
// server's profit-and-loss does, not the `total` column, which carries VAT.
const orderRevenue = (w: WorkOrder) => num(w.subtotal) - num(w.discountAmount);
const COUNTS_TOWARD_REVENUE = new Set(["invoiced", "closed"]);

// The time the shop's own clock said, not UTC — a car booked in at two in the afternoon should
// read 14:00 to the person who booked it in.
//
// The window around it is UTC midnight to UTC midnight, like every other window in the console,
// which for a shop five hours ahead covers 05:00 to 05:00 local. Every hour a workshop actually
// trades falls inside that, so the two never disagree in practice; a sale rung up at two in the
// morning would land on the previous day, and is a price worth paying to keep single days
// adding up exactly to the month above them.
const clock = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
};

export function DaySheet({ shopId, from, to }: { shopId: string; from: string; to: string }) {
  const { t, lang } = useLang();
  const [orders, setOrders] = useState<WorkOrder[] | null>(null);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [expenses, setExpenses] = useState<ShopExpense[] | null>(null);

  const load = useCallback(async () => {
    setOrders(null); setSales(null); setExpenses(null);
    // Orders have no date filter on the wire, so the day is picked out here. Sales and
    // expenses are asked for by range, which is why only the orders call is unbounded.
    const [o, s, e] = await Promise.all([
      api.listWorkOrders(shopId).catch(() => [] as WorkOrder[]),
      api.listSales(shopId, from, to).catch(() => [] as Sale[]),
      api.listExpenses(shopId, from, to).catch(() => [] as ShopExpense[]),
    ]);
    const lo = from, hi = to;
    setOrders(o.filter((w) => (w.createdAt ?? "") >= lo && (w.createdAt ?? "") <= hi));
    setSales(s);
    setExpenses(e);
  }, [shopId, from, to]);

  useEffect(() => { load(); }, [load]);

  const earned = useMemo(() => {
    const counted = (orders ?? []).filter((w) => COUNTS_TOWARD_REVENUE.has(woStateFromProto(w.state)));
    const live = (sales ?? []).filter((s) => !s.voided);
    return {
      counted,
      orderTotal: counted.reduce((a, w) => a + orderRevenue(w), 0),
      live,
      saleTotal: live.reduce((a, s) => a + num(s.total), 0),
      spent: (expenses ?? []).reduce((a, e) => a + num(e.amount), 0),
    };
  }, [orders, sales, expenses]);

  if (orders === null || sales === null || expenses === null) {
    return <div className="grid gap-3 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 w-full" />)}</div>;
  }

  const quiet = orders.length === 0 && sales.length === 0 && expenses.length === 0;
  if (quiet) {
    return (
      <Card className="p-8 text-center">
        <div className="text-[14px] font-semibold text-foreground">{t("day_nothing")}</div>
        <div className="mt-1 text-[13px] text-muted-foreground">{t("day_nothing_hint")}</div>
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-3 lg:grid-cols-3">
      {/* ── the cars ── */}
      <Section
        title={t("day_orders")}
        count={orders.length}
        total={earned.orderTotal}
        totalLabel={t("day_counted_revenue")}
        empty={t("day_no_orders")}
      >
        {orders.map((w) => {
          const state = woStateFromProto(w.state);
          const counted = COUNTS_TOWARD_REVENUE.has(state);
          return (
            <Link
              key={w.id}
              href={`/work-orders/${w.id}`}
              className={cn(
                "flex min-h-11 items-center gap-2.5 border-b border-border px-4 py-2.5 transition-colors last:border-0 hover:bg-secondary/60",
                !counted && "opacity-60",
              )}
            >
              <span className="w-11 shrink-0 font-mono text-[12.5px] font-bold text-muted-foreground">{clock(w.createdAt)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold text-foreground">
                  {orderLabel(w)}{w.plate ? " · " + w.plate : ""}
                </div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {[w.make, w.model].filter(Boolean).join(" ")}{w.customerName ? " · " + w.customerName : ""}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-mono text-[13.5px] font-bold text-foreground">{money(orderRevenue(w))}</span>
                <StateBadge state={state} />
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </Section>

      {/* ── the counter ── */}
      <Section
        title={t("day_sales")}
        count={sales.length}
        total={earned.saleTotal}
        totalLabel={t("day_counted_revenue")}
        empty={t("day_no_sales")}
      >
        {sales.map((s) => (
          <div
            key={s.id}
            className={cn("flex min-h-11 items-center gap-2.5 border-b border-border px-4 py-2.5 last:border-0", s.voided && "opacity-60")}
          >
            <span className="w-11 shrink-0 font-mono text-[12.5px] font-bold text-muted-foreground">{clock(s.createdAt)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[13.5px] font-bold text-foreground">{saleLabel(s)}</div>
              <div className="truncate text-[12px] text-muted-foreground">
                {(s.items ?? []).length} {t("day_items")} · {t(paymentLabelKey(paymentFromProto(s.paymentMethod)))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className={cn("font-mono text-[13.5px] font-bold", s.voided ? "text-muted-foreground line-through" : "text-foreground")}>
                {money(num(s.total))}
              </span>
              {s.voided && <Badge tone="neutral">{t("voided")}</Badge>}
            </div>
          </div>
        ))}
      </Section>

      {/* ── what went out ── */}
      <Section
        title={t("day_expenses")}
        count={expenses.length}
        total={earned.spent}
        totalLabel={t("day_paid_out")}
        empty={t("day_no_expenses")}
        tone="danger"
      >
        {expenses.map((e) => (
          <div key={e.id} className="flex min-h-11 items-center gap-2.5 border-b border-border px-4 py-2.5 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-foreground">{expenseCategory(lang, e.category)}</div>
              {(e.payee || e.note) && (
                <div className="truncate text-[12px] text-muted-foreground">{[e.payee, e.note].filter(Boolean).join(" · ")}</div>
              )}
              {/* Counting a day's till means knowing which of these came out of it. */}
              <PaidBadge paid={e} className="mt-1" />
            </div>
            <span className="shrink-0 font-mono text-[13.5px] font-bold text-destructive">−{money(num(e.amount))}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

// Section is one column of the sheet: a heading with how many, the rows, and the subtotal that
// the cards above are made of.
function Section({
  title, count, total, totalLabel, empty, tone = "ok", children,
}: {
  title: string; count: number; total: number; totalLabel: string; empty: string;
  tone?: "ok" | "danger"; children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="text-[13.5px] font-bold text-foreground">{title}</span>
        <Badge tone="neutral">{count}</Badge>
      </div>
      {count === 0
        ? <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">{empty}</div>
        : <div className="max-h-[420px] overflow-y-auto">{children}</div>}
      <div className="flex items-center justify-between gap-2 border-t border-border bg-secondary/40 px-4 py-2.5">
        <span className="text-[12px] font-semibold text-muted-foreground">{totalLabel}</span>
        <span className={cn("font-mono text-[15px] font-extrabold", tone === "danger" ? "text-destructive" : "text-success")}>
          {tone === "danger" && total > 0 ? "−" : ""}{money(total)}
        </span>
      </div>
    </Card>
  );
}
