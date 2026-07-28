"use client";
// Statistics: the shop in one screen, for one period.
//
// It replaces the old Reports page, where four of eight report tiles had never returned a
// row — they were fed by an event projection that only knew what had crossed the broker
// since it shipped. Everything here is computed live from the work-order service's own
// tables, so it covers the shop's whole history, and it arrives in a single call so every
// figure on the page describes the same window.
//
// Chart choices follow the dataviz rules: the categorical palette (--chart-1..3) is the
// validated one; magnitude comparisons use a single hue; two series only ever share a plot
// when they share a unit; every multi-series chart carries a legend so identity is never
// colour alone.
import React, { useCallback, useMemo, useState } from "react";
import { BarChart3, Banknote, Car, Download, Package, Wrench } from "lucide-react";
import { Card } from "@/components/ui-kit/card";
import { Button } from "@/components/ui-kit/button";
import { Badge } from "@/components/ui-kit/badge";
import { Skeleton, Separator } from "@/components/ui-kit/misc";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui-kit/tabs";
import { Empty } from "@/components/ui";
import { ChartCard, DonutChart, HBarChart, RankRow, TrendChart, type BarDatum } from "@/components/admin/charts";
import { useAuth, useLang, useToast } from "@/components/providers";
import { useAutoRefresh } from "@/lib/use-refresh";
import { api, ApiError } from "@/lib/api";
import { money, num, shortDate } from "@/lib/format";
import { woStateFromProto, STATE_LABEL } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { PeriodPicker, usePeriod } from "../_period";
import { MoneyTile, SecTitle, StatCard } from "../_shared";
import type { ItemStat, Statistics } from "@/lib/types";

const CHART = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const hours = (h?: number) => `${Math.round((h ?? 0) * 10) / 10}`;
// A quantity may be fractional (3.5 litres), so it is formatted rather than rounded away.
const qty = (q?: number) => String(Math.round((q ?? 0) * 100) / 100);

export default function StatisticsPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();
  const period = usePeriod();
  const { from, to } = period.range;

  const [st, setSt] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSt(await api.getStatistics(shopId, from, to));
    } catch (e) {
      setSt(null);
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [shopId, from, to, t, toast]);

  React.useEffect(() => { void load(); }, [load]);
  useAutoRefresh(load);

  const revenue = num(st?.revenue), cogs = num(st?.costOfGoods), gross = num(st?.grossMargin);
  const overhead = num(st?.overhead), net = num(st?.netProfit);

  // ── the CSV the old Reports page was uniquely good for ──
  const exportCsv = () => {
    if (!st) return;
    const rows: string[][] = [[t("statistics"), `${shortDate(from)} — ${shortDate(to)}`], []];
    const push = (title: string, head: string[], body: (string | number)[][]) => {
      rows.push([title], head, ...body.map((r) => r.map(String)), []);
    };
    push(t("profit_loss"), [t("key"), t("amount")], [
      [t("revenue"), revenue], [t("cost_of_goods"), cogs], [t("gross_margin"), gross],
      [t("overhead"), overhead], [t("net_profit"), net], [t("discount"), num(st.discountsGiven)],
      [t("orders"), st.orderCount ?? 0], [t("nav_sales"), st.saleCount ?? 0],
    ]);
    push(t("rep_top_products"), [t("product"), t("sku"), t("sold_qty"), t("revenue"), t("gross_margin")],
      (st.topProducts ?? []).map((p) => [p.name, p.sku ?? "", qty(p.quantity), num(p.revenue), num(p.margin)]));
    push(t("rep_menu"), [t("service"), t("sold_qty"), t("revenue"), t("gross_margin")],
      (st.topServices ?? []).map((p) => [p.name, qty(p.quantity), num(p.revenue), num(p.margin)]));
    push(t("rep_mechanic"), [t("role_mechanic"), t("orders"), t("hours_short"), t("revenue")],
      (st.mechanics ?? []).map((m) => [m.name || m.mechanicId, m.jobs ?? 0, hours(m.hours), num(m.revenue)]));
    push(t("nav_vehicles"), [t("vehicle"), t("plate"), t("orders"), t("revenue")],
      (st.topVehicles ?? []).map((v) => [[v.make, v.model].filter(Boolean).join(" "), v.plate ?? "", v.orders ?? 0, num(v.revenue)]));

    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `statistics-${from.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t("export_csv"), { icon: "download" });
  };

  // Revenue and cost share a unit, so they belong on one axis — a second scale would invent
  // a relationship the data does not have.
  const trend = useMemo(() => (st?.byDay ?? []).map((d) => ({
    label: d.day.slice(5).replace("-", "."),
    revenue: num(d.revenue),
    cost: num(d.cost),
  })), [st]);

  const funnelBars = useMemo<BarDatum[]>(() => (st?.funnel ?? [])
    .filter((b) => (b.count ?? 0) > 0)
    .map((b) => ({ label: t(STATE_LABEL[woStateFromProto(b.state)]), value: b.count ?? 0 })), [st, t]);

  const paymentSlices = useMemo(() => {
    const byMethod = new Map<string, number>();
    for (const p of st?.payments ?? []) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + num(p.amount));
    const order = ["cash", "card", "other"];
    return order.filter((m) => (byMethod.get(m) ?? 0) > 0).map((m, i) => ({
      key: m, label: t(m === "cash" ? "pay_cash" : m === "card" ? "pay_card" : "pay_other"),
      value: byMethod.get(m) ?? 0, color: CHART[i % CHART.length],
    }));
  }, [st, t]);

  // Which makes come through the door. Derived from the ranked cars, so it is "of the cars
  // that spent the most", which the subtitle says out loud.
  const makeBars = useMemo<BarDatum[]>(() => {
    const byMake = new Map<string, number>();
    for (const v of st?.topVehicles ?? []) {
      const k = v.make?.trim() || t("vehicle");
      byMake.set(k, (byMake.get(k) ?? 0) + (v.orders ?? 0));
    }
    return [...byMake.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
  }, [st, t]);

  if (loading && !st) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-[360px] rounded-[10px]" />
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-[14px]" />)}
        </div>
        <Skeleton className="h-[300px] w-full rounded-[14px]" />
      </div>
    );
  }
  if (!st) return <Empty icon="alert" text={t("error")} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-[-0.025em] text-foreground">{t("statistics")}</h1>
          <div className="mt-0.5 text-[13px] font-medium text-muted-foreground">
            {shortDate(from)} — {shortDate(to)}
          </div>
        </div>
        <Button variant="secondary" onClick={exportCsv}><Download />{t("export_csv")}</Button>
      </div>

      <PeriodPicker p={period} />

      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview"><BarChart3 className="size-3.5" />{t("overview")}</TabsTrigger>
          <TabsTrigger value="money"><Banknote className="size-3.5" />{t("nav_finances")}</TabsTrigger>
          <TabsTrigger value="work"><Wrench className="size-3.5" />{t("stat_work")}</TabsTrigger>
          <TabsTrigger value="products"><Package className="size-3.5" />{t("nav_inventory")}</TabsTrigger>
          <TabsTrigger value="customers"><Car className="size-3.5" />{t("nav_customers")}</TabsTrigger>
        </TabsList>

        {/* ── overview ── */}
        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            <StatCard label={t("revenue")} value={money(revenue)} sub={t("soum")} icon="money" tone="accent" big />
            <StatCard label={t("net_profit")} value={money(net)} sub={pct(net, revenue) + "% " + t("margin")} icon="chart" tone={net >= 0 ? "ok" : "danger"} />
            <StatCard label={t("orders")} value={st.orderCount ?? 0} sub={`+${st.saleCount ?? 0} ${t("nav_sales").toLowerCase()}`} icon="clipboard" tone="neutral" />
            <StatCard label={t("avg_ticket")} value={money(st.avgTicket)} sub={t("soum")} icon="receipt" tone="neutral" />
            <StatCard label={t("worked_hours")} value={hours(st.workedHours)} sub={t("hours_short")} icon="clock" tone="info" />
            <StatCard label={t("stock_value")} value={money(st.stockValue)} sub={t("right_now")} icon="list" tone="warn" />
          </div>

          <ChartCard title={t("revenue_vs_cost")} subtitle={t("per_day")}>
            <TrendChart
              data={trend}
              series={[
                { key: "revenue", label: t("revenue"), color: CHART[0] },
                { key: "cost", label: t("cost_of_goods"), color: CHART[1] },
              ]}
              formatter={(v) => money(v)}
            />
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={t("orders_by_status")} subtitle={t("created_in_period")}>
              <HBarChart data={funnelBars} color={CHART[0]} />
            </ChartCard>
            <ChartCard title={t("income_by_method")} subtitle={t("paid_invoices")}>
              {paymentSlices.length === 0
                ? <div className="grid h-[168px] place-items-center text-[13px] text-muted-foreground">{t("no_income")}</div>
                : <DonutChart data={paymentSlices} centerValue={money(paymentSlices.reduce((s, x) => s + x.value, 0))} centerLabel={t("total_income")} formatter={(v) => money(v)} />}
            </ChartCard>
          </div>
        </TabsContent>

        {/* ── money ── */}
        <TabsContent value="money" className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MoneyTile label={t("revenue")} value={revenue} tone="ok"
              hint={`${t("nav_workorders")} ${money(st.orderRevenue)} · ${t("nav_sales")} ${money(st.salesRevenue)}`} />
            <MoneyTile label={t("expenses")} value={cogs + overhead} tone="danger"
              hint={`${t("cost_of_goods")} ${money(cogs)} · ${t("overhead")} ${money(overhead)}`} />
            <MoneyTile label={t("net_profit")} value={net} tone={net < 0 ? "danger" : "accent"}
              hint={`${pct(net, revenue)}% ${t("margin")}`} />
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3.5 text-[15px] font-bold text-foreground">{t("income_statement")}</div>
            <div className="px-5 py-2">
              <PLRow label={t("revenue")} value={revenue} pct={100} />
              <PLRow label={t("cost_of_goods")} value={-cogs} pct={-pct(cogs, revenue)} />
              <Separator className="my-1.5" />
              <PLRow label={t("gross_margin")} value={gross} pct={pct(gross, revenue)} strong />
              {(st.byCategory ?? []).map((b) => (
                <PLRow key={b.category} label={b.category} value={-num(b.amount)} pct={-pct(num(b.amount), revenue)} muted />
              ))}
              <PLRow label={t("overhead")} value={-overhead} pct={-pct(overhead, revenue)} />
              <Separator className="my-1.5" />
              <PLRow label={t("net_profit")} value={net} pct={pct(net, revenue)} strong tone={net >= 0 ? "ok" : "danger"} />
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={t("income_by_method")} subtitle={t("paid_invoices")}>
              <div className="flex flex-col gap-1">
                {(st.payments ?? []).length === 0 && <div className="py-8 text-center text-[13px] text-muted-foreground">{t("no_income")}</div>}
                {(st.payments ?? []).map((p, i) => {
                  const total = (st.payments ?? []).reduce((s, x) => s + num(x.amount), 0);
                  return (
                    <RankRow key={i}
                      name={t(p.method === "cash" ? "pay_cash" : p.method === "card" ? "pay_card" : "pay_other")}
                      sub={p.cardNumber || undefined}
                      value={money(p.amount)}
                      share={total > 0 ? num(p.amount) / total : 0}
                      color={CHART[p.method === "cash" ? 0 : p.method === "card" ? 1 : 2]}
                      right={<span className="w-14 shrink-0 text-right font-mono text-[12px] text-muted-foreground">{p.count ?? 0} {t("payments_n")}</span>}
                    />
                  );
                })}
              </div>
            </ChartCard>
            <ChartCard title={t("cg_debts")} subtitle={t("cg_all_time")}>
              <div className="flex flex-col gap-3 py-1">
                <MoneyTile label={t("cg_total_payable")} value={num(st.payable)} tone="danger" hint={t("cg_not_expense_short")} />
                <MoneyTile label={t("cg_total_receivable")} value={num(st.receivable)} tone="ok" />
              </div>
            </ChartCard>
            <ChartCard title={t("discount")} subtitle={t("given_in_period")}>
              <div className="flex flex-col gap-2 py-2">
                <div className="font-mono text-[30px] font-extrabold tracking-[-0.03em] text-foreground">{money(st.discountsGiven)}</div>
                <div className="text-[13px] text-muted-foreground">{pct(num(st.discountsGiven), revenue + num(st.discountsGiven))}% {t("of_revenue")}</div>
              </div>
            </ChartCard>
          </div>
        </TabsContent>

        {/* ── work ── */}
        <TabsContent value="work" className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label={t("worked_hours")} value={hours(st.workedHours)} sub={t("hours_short")} icon="clock" tone="info" />
            <StatCard label={t("avg_lead_time")} value={hours(st.avgLeadTimeHours)} sub={t("hours_short")} icon="chart" tone="neutral" />
            <StatCard label={t("orders")} value={st.orderCount ?? 0} icon="clipboard" tone="accent" />
          </div>

          <ChartCard title={t("orders_by_status")} subtitle={t("created_in_period")}>
            <div className="flex flex-col gap-1">
              {(st.funnel ?? []).filter((b) => (b.count ?? 0) > 0).length === 0
                ? <div className="py-8 text-center text-[13px] text-muted-foreground">{t("empty")}</div>
                : (() => {
                  const max = Math.max(1, ...(st.funnel ?? []).map((b) => b.count ?? 0));
                  return (st.funnel ?? []).filter((b) => (b.count ?? 0) > 0).map((b) => (
                    <RankRow key={b.state}
                      name={t(STATE_LABEL[woStateFromProto(b.state)])}
                      value={String(b.count ?? 0)}
                      share={(b.count ?? 0) / max}
                      color={CHART[0]}
                      right={<span className="w-[110px] shrink-0 text-right font-mono text-[12px] text-muted-foreground">{money(b.value)}</span>}
                    />
                  ));
                })()}
            </div>
          </ChartCard>

          <Card className="px-5 py-4">
            <SecTitle>{t("rep_mechanic")}</SecTitle>
            {(st.mechanics ?? []).length === 0 ? (
              <div className="py-8 text-center text-[13px] text-muted-foreground">{t("empty")}</div>
            ) : (
              <div className="mt-1 flex flex-col gap-1">
                {(() => {
                  const max = Math.max(1, ...(st.mechanics ?? []).map((m) => num(m.revenue)));
                  return (st.mechanics ?? []).map((m) => (
                    <RankRow key={m.mechanicId}
                      name={m.name || m.mechanicId.slice(0, 8)}
                      sub={`${m.jobs ?? 0} ${t("orders").toLowerCase()} · ${hours(m.hours)} ${t("hours_short")}`}
                      value={money(m.revenue)}
                      share={num(m.revenue) / max}
                      color={CHART[0]}
                    />
                  ));
                })()}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── products & services ── */}
        <TabsContent value="products" className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label={t("stock_value")} value={money(st.stockValue)} sub={t("right_now")} icon="list" tone="warn" />
            <StatCard label={t("low_stock")} value={st.lowStockCount ?? 0} sub={t("variants_n")} icon="alert" tone={(st.lowStockCount ?? 0) > 0 ? "danger" : "ok"} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ItemCard title={t("rep_top_products")} subtitle={t("sold_and_fitted")} items={st.topProducts ?? []} t={t} />
            <ItemCard title={t("rep_menu")} subtitle={t("on_closed_orders")} items={st.topServices ?? []} t={t} />
          </div>
        </TabsContent>

        {/* ── customers & cars ── */}
        <TabsContent value="customers" className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label={t("new_customers")} value={st.newCustomers ?? 0} icon="users" tone="accent" />
            <StatCard label={t("returning_customers")} value={st.returningCustomers ?? 0} icon="users" tone="ok" />
            <StatCard label={t("avg_ticket")} value={money(st.avgTicket)} sub={t("soum")} icon="receipt" tone="neutral" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="px-5 py-4">
              <SecTitle>{t("top_customers")}</SecTitle>
              {(st.topVehicles ?? []).length === 0 ? (
                <div className="py-8 text-center text-[13px] text-muted-foreground">{t("empty")}</div>
              ) : (
                <div className="mt-1 flex flex-col gap-1">
                  {(() => {
                    const max = Math.max(1, ...(st.topVehicles ?? []).map((v) => num(v.revenue)));
                    return (st.topVehicles ?? []).map((v) => (
                      <RankRow key={v.vehicleId}
                        name={v.customerName || [v.make, v.model].filter(Boolean).join(" ") || t("vehicle")}
                        sub={[v.plate, v.orders ? `${v.orders} ${t("orders").toLowerCase()}` : ""].filter(Boolean).join(" · ")}
                        value={money(v.revenue)}
                        share={num(v.revenue) / max}
                        color={CHART[0]}
                      />
                    ));
                  })()}
                </div>
              )}
            </Card>
            <ChartCard title={t("top_makes")} subtitle={t("of_top_customers")}>
              <HBarChart data={makeBars} color={CHART[0]} formatter={(v) => String(v)} />
            </ChartCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ItemCard ranks a list of things sold: name, how many, what it made and at what margin.
// The bar is in the row rather than beside it — a separate chart would restate the numbers.
function ItemCard({ title, subtitle, items, t }: { title: string; subtitle: string; items: ItemStat[]; t: (k: string) => string }) {
  const max = Math.max(1, ...items.map((i) => num(i.revenue)));
  return (
    <Card className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <SecTitle>{title}</SecTitle>
        <span className="text-[11.5px] text-muted-foreground">{subtitle}</span>
      </div>
      {items.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-muted-foreground">{t("empty")}</div>
      ) : (
        <div className="mt-1 flex flex-col gap-1">
          {items.map((it) => (
            <RankRow key={it.key}
              name={it.name}
              sub={`${qty(it.quantity)}${it.sku ? " · " + it.sku : ""}`}
              value={money(it.revenue)}
              share={num(it.revenue) / max}
              color={CHART[0]}
              right={
                <Badge tone={num(it.margin) >= 0 ? "ok" : "danger"} className="w-[92px] justify-end px-0 text-[11.5px]">
                  {money(it.margin)}
                </Badge>
              }
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// PLRow is the income-statement line: label, share of revenue, amount. Mirrors the row on
// Finances so the same statement reads identically in both places.
function PLRow({ label, value, pct: share, strong, tone, muted }: {
  label: string; value: number; pct?: number; strong?: boolean; tone?: "ok" | "danger"; muted?: boolean;
}) {
  const color = tone === "ok" ? "text-success" : tone === "danger" ? "text-destructive" : muted ? "text-ink-2" : "text-foreground";
  return (
    <div className={cn("flex items-center justify-between", muted ? "py-[3px] pl-3.5" : "py-[5px]")}>
      <span className={cn(muted ? "text-[12.5px] text-muted-foreground" : strong ? "text-[13.5px] font-bold text-foreground" : "text-[13.5px] font-medium text-ink-2")}>{label}</span>
      <span className="inline-flex items-baseline gap-2">
        {share !== undefined && <span className="w-11 text-right font-mono text-[11.5px] text-muted-foreground">{share.toFixed(1)}%</span>}
        <span className={cn("w-[90px] text-right font-mono", strong ? "text-[14px] font-extrabold" : "text-[14px] font-semibold", color)}>{money(value)}</span>
      </span>
    </div>
  );
}
