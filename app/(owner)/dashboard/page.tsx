"use client";
// Owner dashboard: live KPIs (api.dashboard, auto-refresh 30s), a work-order status
// breakdown + last-7-days revenue chart derived from api.listWorkOrders, fiscal health,
// and a recent work-order list.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Empty, useIsMobile } from "@/components/ui";
import { Card, CardHeader, CardTitle } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Skeleton } from "@/components/ui-kit/misc";
import { ChartCard, HBarChart, type BarDatum } from "@/components/admin/charts";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { useAutoRefresh } from "@/lib/use-refresh";
import { money, num } from "@/lib/format";
import { woStateFromProto, STATE_LABEL, type WoState } from "@/lib/enums";
import type { Dashboard, ProfitAndLoss, Sale, WorkOrder } from "@/lib/types";
import { IncomeBreakdownModal, IncomeBreakdownPanel } from "@/components/income-breakdown";
import { MoneyTile, SecTitle, StatCard, WORow } from "../_shared";

const STATE_ORDER: WoState[] = ["draft", "estimated", "approved", "in_progress", "ready", "invoiced", "closed", "canceled"];

export default function DashboardPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [data, setData] = useState<Dashboard | null>(null);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [pl, setPl] = useState<ProfitAndLoss | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [ago, setAgo] = useState(0);
  const [showIncome, setShowIncome] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try {
      // The money on this page comes from two different questions, and they are not the same
      // number: `dashboard` is what was actually RECEIVED today (paid invoices, counter sales
      // included), while `profit-loss` is what was EARNED and what it cost. Both are shown,
      // labelled, rather than picking one and hiding the other.
      const [d, wos, sl, p] = await Promise.all([
        api.dashboard(shopId),
        api.listWorkOrders(shopId),
        api.listSales(shopId).catch(() => [] as Sale[]),
        api.getProfitLoss(shopId, today, today).catch(() => null),
      ]);
      setData(d);
      setOrders(wos);
      setSales(sl);
      setPl(p);
      setErr(false);
    } catch (e) {
      setErr(true);
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [shopId, today, t, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const tick = setInterval(() => setAgo((a) => (a + 1) % 30), 1000);
    return () => clearInterval(tick);
  }, []);
  // Poll every 30s, but only while this tab is actually visible; also refresh the moment it
  // regains focus, so returning to a backgrounded dashboard never shows stale numbers.
  useAutoRefresh(useCallback(async () => { await load(); setAgo(0); }, [load]), { intervalMs: 30000 });

  // WO status breakdown (counts per state, localized, non-zero).
  const statusBars = useMemo<BarDatum[]>(() => {
    const counts = new Map<WoState, number>();
    for (const w of orders) { const s = woStateFromProto(w.state); counts.set(s, (counts.get(s) || 0) + 1); }
    return STATE_ORDER.map((s) => ({ label: t(STATE_LABEL[s]), value: counts.get(s) || 0 })).filter((b) => b.value > 0);
  }, [orders, t]);

  // Last 7 days of takings by day. Counter sales count here exactly as work orders do —
  // money the shop took is money the shop took, and a chart that quietly omitted a whole
  // channel would be worse than no chart.
  const revenueBars = useMemo<BarDatum[]>(() => {
    const byDay = new Map<string, number>();
    const now = Date.now();
    const addDay = (iso: string | undefined, amount: number) => {
      if (!iso) return;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return;
      if ((now - d.getTime()) / 86400000 > 7) return;
      const key = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
      byDay.set(key, (byDay.get(key) || 0) + amount);
    };
    for (const w of orders) addDay(w.createdAt, num(w.total));
    for (const s of sales) if (!s.voided) addDay(s.createdAt, num(s.total));
    return [...byDay.entries()].map(([label, value]) => ({ label, value }));
  }, [orders, sales]);

  const recent = orders.slice(0, 6);

  if (loading) return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
  if (err && !data) return <Empty icon="alert" text={t("error")} />;

  const d = data!;
  const health = d.fiscalHealth || "green";
  const healthTone = health === "green" ? "ok" : health === "yellow" ? "warn" : "danger";
  const healthKey = health === "green" ? "fiscal_ok" : health === "yellow" ? "fiscal_warn" : "fiscal_bad";
  // Everything the day cost: the stock that left the shelf plus the shop's overhead.
  const outcome = num(pl?.costOfGoods) + num(pl?.overhead);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <span className="an-pulse size-[7px] rounded-full bg-success" /> {t("auto_refresh")} · {t("updated_ago")} {ago} {t("sec_ago")}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label={t("todays_revenue")} value={money(d.todaysRevenue ?? 0)} sub={t("soum")} icon="money" tone="accent" big onClick={() => setShowIncome(true)} />
        <StatCard label={t("jobs_in_progress")} value={d.jobsInProgress ?? 0} icon="wrench" tone="warn" />
        <StatCard label={t("ready_for_pickup")} value={d.readyForPickup ?? 0} icon="check" tone="ok" />
        <StatCard label={t("awaiting_approval")} value={d.awaitingApproval ?? 0} icon="clock" tone="info" />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t("nav_workorders")} subtitle={`${orders.length} ${t("total") === "total" ? "jami" : t("total")}`}>
          {statusBars.length ? <HBarChart data={statusBars} color="var(--accent)" /> : <div className="grid h-[160px] place-items-center text-[13px] text-muted-foreground">{t("empty")}</div>}
        </ChartCard>
        <ChartCard title={t("todays_revenue")} subtitle="7 kun · so'm">
          {revenueBars.length ? <HBarChart data={revenueBars} color="var(--chart-1)" unit="so'm" formatter={(v) => money(v)} /> : <div className="grid h-[160px] place-items-center text-[13px] text-muted-foreground">{t("empty")}</div>}
        </ChartCard>
      </div>

      {/* Today's money in one place: what was earned, what it cost, what is left. Both work
          orders and counter sales feed every figure here. */}
      <Card className="p-5">
        <SecTitle right={
          <Link href="/finances" className="text-[13px] font-semibold text-primary-emphasis hover:underline">{t("nav_finances")} →</Link>
        }>{t("today_money")}</SecTitle>
        <div className="mt-1 grid gap-3.5 sm:grid-cols-3">
          <MoneyTile label={t("revenue")} value={num(pl?.revenue)} tone="ok" />
          <MoneyTile label={t("expenses")} value={outcome} tone="danger"
            hint={`${t("cost_of_goods")} ${money(num(pl?.costOfGoods))} · ${t("overhead")} ${money(num(pl?.overhead))}`} />
          <MoneyTile label={t("net_profit")} value={num(pl?.netProfit)} tone={num(pl?.netProfit) < 0 ? "danger" : "accent"} />
        </div>
      </Card>

      {/* Today's income by payment method (cash / card — which card / other) */}
      <Card className="p-5">
        <SecTitle>{t("income_by_method")}</SecTitle>
        <IncomeBreakdownPanel shopId={shopId} from={today} to={today} />
      </Card>

      {/* Recent + fiscal */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{t("nav_workorders")}</CardTitle>
            <Link href="/work-orders" className="text-[13px] font-semibold text-primary-emphasis hover:underline">{t("view_all")} →</Link>
          </CardHeader>
          {recent.length === 0 ? <div className="px-5 py-8 text-center text-sm text-muted-foreground">{t("empty")}</div> : recent.map((w) => <WORow key={w.id} wo={w} />)}
        </Card>

        <Card className="p-5">
          <SecTitle right={<Badge tone={healthTone} dot>{t(healthKey)}</Badge>}>{t("fiscal_health")}</SecTitle>
          <div className="mt-1 flex items-center gap-3 rounded-[12px] bg-secondary/60 p-4">
            <div className={`grid size-11 shrink-0 place-items-center rounded-[12px] ${healthTone === "ok" ? "bg-success-soft text-success" : healthTone === "warn" ? "bg-warning-soft text-warning" : "bg-destructive-soft text-destructive"}`}>
              {healthTone === "ok" ? <ShieldCheck className="size-6" /> : <AlertTriangle className="size-6" />}
            </div>
            <div>
              <div className="text-[15px] font-bold text-foreground">{t(healthKey)}</div>
              <div className="text-[12.5px] text-muted-foreground">{t("fiscal_health")}</div>
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            {["green", "yellow", "red"].map((c) => (
              <div key={c} className="h-2 flex-1 rounded-full" style={{ background: c === health ? (c === "green" ? "var(--ok)" : c === "yellow" ? "var(--warn)" : "var(--danger)") : "var(--surface-2)" }} />
            ))}
          </div>
        </Card>
      </div>

      <IncomeBreakdownModal open={showIncome} onClose={() => setShowIncome(false)} shopId={shopId} from={today} to={today} title={t("todays_revenue")} />
    </div>
  );
}
