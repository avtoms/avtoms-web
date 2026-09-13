"use client";
// Owner dashboard, laid out after the redesign. Four headline figures — money taken today,
// money still owed on bills, cars in the workshop, today's profit — then the things that need
// somebody right now, each with the button that deals with it, and the cars in the workshop.
// On the right: the week's takings, how busy each mechanic is, today's bookings. Below that
// sit the panels the dashboard had before (takings by payment method, orders by status, fiscal
// health), so nothing it used to answer has gone.
//
// Fast-moving figures (orders, bills, bookings) refresh every 30s while the tab is visible;
// the statistics behind the chart and the workload are heavier and refresh every two minutes.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, ShieldCheck } from "lucide-react";
import { Empty, useIsMobile } from "@/components/ui";
import { StateBadge } from "@/components/ui";
import { Card, CardHeader, CardTitle } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Skeleton } from "@/components/ui-kit/misc";
import { ChartCard, HBarChart, type BarDatum } from "@/components/admin/charts";
import { PlatePreview } from "@/components/plate";
import { PageHeader } from "@/components/page-header";
import { GlobalSearch } from "@/components/global-search";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { can, canAny } from "@/lib/perms";
import { useAutoRefresh } from "@/lib/use-refresh";
import { compactMln, makeModel, minutesBetween, money, num, orderLabel } from "@/lib/format";
import { apptStateFromProto, fiscalFromProto, paymentFromProto, woStateFromProto, STATE_LABEL, type WoState } from "@/lib/enums";
import { dayRange, shiftDay, spanRange, todayYMD } from "@/lib/range";
import { canWork } from "@/lib/use-staff";
import { formatDayMonth, formatWeekday, weekdayShort } from "@/lib/i18n";
import type { Appointment, Dashboard, Invoice, Product, ProfitAndLoss, Staff, Statistics, WorkOrder } from "@/lib/types";
import { IncomeBreakdownModal, IncomeBreakdownPanel } from "@/components/income-breakdown";
import { KpiCard, Pill, SecTitle, StaffDot, staffColor } from "../_shared";
import { cn } from "@/lib/utils";

const STATE_ORDER: WoState[] = ["draft", "estimated", "approved", "in_progress", "ready", "invoiced", "closed", "canceled"];
// A car is "in the workshop" from the moment the job is agreed until it is ready to hand back.
const IN_SHOP: WoState[] = ["approved", "in_progress", "ready"];
// A job still being planned or worked has to have somebody's name on it.
const NEEDS_MECHANIC: WoState[] = ["draft", "estimated", "approved", "in_progress"];
// A mechanic's day, for scaling the workload bars. Not a target — just the width of a bar.
const WORKDAY_HOURS = 8;

type PayRow = { method: string; amount: number };
type Attention = {
  key: string; tone: "danger" | "warn"; ref: string; title: string; sub: string;
  action: string; primary?: boolean; href: string;
};

export default function DashboardPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t, lang } = useLang();
  const { toast } = useToast();
  const router = useRouter();
  const isMobile = useIsMobile();
  const canInvoices = can(session, "finance.manage");
  const canAppts = can(session, "customers.manage");
  const canStock = canAny(session, "warehouse.view", "warehouse.manage");

  const [data, setData] = useState<Dashboard | null>(null);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [pl, setPl] = useState<ProfitAndLoss | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [week, setWeek] = useState<Statistics | null>(null);
  const [todayStats, setTodayStats] = useState<Statistics | null>(null);
  const [payToday, setPayToday] = useState<PayRow[]>([]);
  const [payYesterday, setPayYesterday] = useState<PayRow[]>([]);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [showIncome, setShowIncome] = useState(false);
  const [allAttention, setAllAttention] = useState(false);

  const today = todayYMD();
  const yesterday = shiftDay(today, -1);
  const weekFrom = shiftDay(today, -6);

  const loadFast = useCallback(async () => {
    try {
      // `dashboard` is what was actually RECEIVED today (paid bills and counter sales);
      // `profit-loss` is what was EARNED and what it cost. Both are shown, labelled.
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const [d, wos, p, invs, ap] = await Promise.all([
        api.dashboard(shopId),
        api.listWorkOrders(shopId),
        // A window of instants, not two bare dates: the service refused "2026-09-12" as a
        // bound, the error was swallowed, and today's profit read 0 beside real takings.
        api.getProfitLoss(shopId, dayRange(today).from, dayRange(today).to).catch(() => null),
        canInvoices ? api.listInvoices(shopId).catch(() => null) : Promise.resolve(null),
        canAppts ? api.listAppointments(shopId, start.toISOString(), end.toISOString()).catch(() => null) : Promise.resolve(null),
      ]);
      setData(d);
      setOrders(wos);
      setPl(p);
      setInvoices(invs);
      setAppts(ap);
      setErr(false);
      setUpdatedAt(new Date());
    } catch (e) {
      setErr(true);
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [shopId, today, canInvoices, canAppts, t, toast]);

  const loadSlow = useCallback(async () => {
    const [wk, td, pt, py, prods, st] = await Promise.all([
      api.getStatistics(shopId, spanRange(weekFrom, today).from, spanRange(weekFrom, today).to).catch(() => null),
      api.getStatistics(shopId, dayRange(today).from, dayRange(today).to).catch(() => null),
      api.paymentBreakdown(shopId, today, today),
      api.paymentBreakdown(shopId, yesterday, yesterday),
      canStock ? api.listProducts(shopId).catch(() => null) : Promise.resolve(null),
      api.listStaff(shopId).catch(() => [] as Staff[]),
    ]);
    setWeek(wk);
    setTodayStats(td);
    setPayToday(pt);
    setPayYesterday(py);
    setProducts(prods);
    setStaff(st);
  }, [shopId, today, yesterday, weekFrom, canStock]);

  useEffect(() => { void loadFast(); void loadSlow(); }, [loadFast, loadSlow]);
  useAutoRefresh(loadFast, { intervalMs: 30000 });
  useAutoRefresh(loadSlow, { intervalMs: 120000 });

  const staffName = useCallback((id?: string) => staff.find((s) => s.id === id)?.name ?? "", [staff]);
  const byId = useMemo(() => new Map(orders.map((w) => [w.id, w])), [orders]);

  const age = useCallback((iso?: string) => {
    const mins = minutesBetween(iso);
    if (mins < 60) return `${Math.max(1, Math.round(mins))} ${t("dur_min")}`;
    const h = mins / 60;
    if (h < 24) return `${Math.round(h)} ${t("hours_short")}`;
    return `${Math.round(h / 24)} ${t("dur_day")}`;
  }, [t]);
  const car = (w?: WorkOrder) => (w ? makeModel(w) || w.plate || "" : "");

  // ── figures ──
  const inShop = useMemo(() => orders
    .filter((w) => IN_SHOP.includes(woStateFromProto(w.state)))
    .sort((a, b) => STATE_ORDER.indexOf(woStateFromProto(b.state)) - STATE_ORDER.indexOf(woStateFromProto(a.state)) || num(b.orderNo) - num(a.orderNo)),
  [orders]);
  const countIn = (s: WoState) => inShop.filter((w) => woStateFromProto(w.state) === s).length;
  const mechanicsWorking = new Set(orders.filter((w) => woStateFromProto(w.state) === "in_progress" && w.assignedMechanicId).map((w) => w.assignedMechanicId)).size;

  const received = (rows: PayRow[]) => rows.filter((r) => paymentFromProto(r.method) !== "credit" && r.method !== "credit").reduce((s, r) => s + r.amount, 0);
  const takenToday = received(payToday);
  const takenYesterday = received(payYesterday);
  const delta = takenYesterday > 0 ? Math.round(((takenToday - takenYesterday) / takenYesterday) * 100) : null;
  const splitLine = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of payToday) {
      const m = paymentFromProto(r.method.startsWith("PAYMENT_METHOD_") ? r.method : "PAYMENT_METHOD_" + r.method.toUpperCase());
      if (m === "credit") continue;
      by.set(m, (by.get(m) || 0) + r.amount);
    }
    const key = (m: string) => (m === "card" ? "pay_card" : m === "transfer" ? "pay_transfer" : m === "other" ? "pay_other" : "pay_cash");
    return [...by.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([m, v]) => `${t(key(m))} ${money(v)}`).join(" · ");
  }, [payToday, t]);

  // What is billed and not yet paid. From the bills when this person may read them; otherwise
  // from the orders sitting in "invoiced", which is the same queue seen from the other side.
  const owed = useMemo(() => {
    if (invoices) {
      const open = invoices.filter((i) => !i.paid && fiscalFromProto(i.fiscalStatus) !== "voided")
        .map((i) => ({ id: i.id, woId: i.workOrderId, amount: num(i.total) - num(i.paidAmount), at: i.createdAt }))
        .filter((i) => i.amount > 0)
        .sort((a, b) => (a.at || "").localeCompare(b.at || ""));
      return { count: open.length, sum: open.reduce((s, i) => s + i.amount, 0), items: open };
    }
    const open = orders.filter((w) => woStateFromProto(w.state) === "invoiced")
      .map((w) => ({ id: w.id, woId: w.id, amount: num(w.total), at: w.createdAt }))
      .sort((a, b) => (a.at || "").localeCompare(b.at || ""));
    return { count: open.length, sum: open.reduce((s, i) => s + i.amount, 0), items: open };
  }, [invoices, orders]);

  const attention = useMemo<Attention[]>(() => {
    const out: Attention[] = [];
    for (const i of owed.items) {
      const w = byId.get(i.woId);
      out.push({
        key: "pay" + i.id, tone: "danger", ref: w ? orderLabel(w) : "—",
        title: t("dash_att_unpaid"),
        sub: [car(w), w?.customerName, `${money(i.amount)} ${t("soum")}`].filter(Boolean).join(" · "),
        action: t("act_take_payment"), primary: true, href: `/work-orders/${i.woId}?pay=1`,
      });
    }
    for (const w of orders) {
      const s = woStateFromProto(w.state);
      if (s === "estimated") {
        out.push({
          key: "est" + w.id, tone: "warn", ref: orderLabel(w),
          title: `${t("dash_att_estimate")} · ${age(w.createdAt)}`,
          sub: [car(w), w.customerName, `${money(num(w.total))} ${t("soum")}`].filter(Boolean).join(" · "),
          action: t("request_approval"), href: `/work-orders/${w.id}`,
        });
      } else if (NEEDS_MECHANIC.includes(s) && !w.assignedMechanicId) {
        out.push({
          key: "mech" + w.id, tone: "warn", ref: orderLabel(w),
          title: `${t("dash_att_no_mech")}, ${age(w.createdAt)} ${t("dash_waiting")}`,
          sub: [car(w), w.customerName, t(STATE_LABEL[s]).toLowerCase()].filter(Boolean).join(" · "),
          action: t("act_pick_mechanic"), href: `/work-orders/${w.id}`,
        });
      }
    }
    for (const p of products ?? []) {
      if (p.active === false) continue;
      const low = (p.variants ?? []).filter((v) => v.active !== false && num(v.quantityOnHand) <= num(v.reorderLevel));
      if (!low.length) continue;
      const v = low[0];
      out.push({
        key: "stk" + p.id, tone: "danger", ref: t("nav_inventory"),
        title: `${p.name} — ${num(v.quantityOnHand)} ${p.unit || ""} ${t("dash_att_low")}`.replace(/\s+/g, " "),
        sub: [`${t("dash_att_min")} ${num(v.reorderLevel)}`, p.supplier ? `${t("dash_att_supplier")}: ${p.supplier}` : ""].filter(Boolean).join(" · "),
        action: t("act_restock"), href: `/inventory`,
      });
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owed, orders, products, byId, t, age]);

  const weekBars = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const d of week?.byDay ?? []) byDay.set(d.day.slice(0, 10), (byDay.get(d.day.slice(0, 10)) || 0) + num(d.revenue));
    return Array.from({ length: 7 }, (_, i) => {
      const day = shiftDay(weekFrom, i);
      return { day, label: weekdayShort(lang, day), value: byDay.get(day) || 0, today: day === today };
    });
  }, [week, weekFrom, today, lang]);
  const weekTotal = weekBars.reduce((s, b) => s + b.value, 0);
  const weekMax = Math.max(1, ...weekBars.map((b) => b.value));

  const mechanics = useMemo(() => {
    const assigned = new Set(inShop.map((w) => w.assignedMechanicId).filter(Boolean) as string[]);
    return staff
      .filter((s) => canWork(s) || (s.active && assigned.has(s.id)))
      .map((s) => ({
        id: s.id, name: s.name,
        jobs: inShop.filter((w) => w.assignedMechanicId === s.id).length,
        hours: todayStats?.mechanics?.find((m) => m.mechanicId === s.id)?.hours ?? 0,
      }))
      .sort((a, b) => b.hours - a.hours || b.jobs - a.jobs);
  }, [staff, inShop, todayStats]);

  const todaysAppts = useMemo(() => (appts ?? [])
    .filter((a) => apptStateFromProto(a.state) === "scheduled")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [appts]);

  // ── the older panels, kept ──
  const statusBars = useMemo<BarDatum[]>(() => {
    const counts = new Map<WoState, number>();
    for (const w of orders) { const s = woStateFromProto(w.state); counts.set(s, (counts.get(s) || 0) + 1); }
    return STATE_ORDER.map((s) => ({ label: t(STATE_LABEL[s]), value: counts.get(s) || 0 })).filter((b) => b.value > 0);
  }, [orders, t]);

  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const header = (
    <PageHeader
      title={<h1 className="truncate text-[19px] font-bold tracking-[-0.025em] text-foreground touch:text-[16px]">{t("today")}, {formatDayMonth(lang, today)}</h1>}
      meta={
        <span>
          {formatWeekday(lang, today)} · {mechanicsWorking} {t("dash_mech_working")}
          {updatedAt && <> · {t("dash_updated")} {hhmm(updatedAt)}</>}
        </span>
      }
      actions={
        <>
          {!isMobile && <GlobalSearch shopId={shopId} orders={orders} canCustomers={canAppts} className="w-[340px]" />}
          <button
            aria-label={t("dash_notifications")}
            title={t("dash_notifications")}
            onClick={() => document.getElementById("attention")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="relative grid size-10 touch:size-11 shrink-0 place-items-center rounded-[10px] border border-border bg-card text-ink-2 transition-colors hover:bg-secondary">
            <Bell className="size-[18px]" />
            {attention.length > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive ring-2 ring-card" />}
          </button>
        </>
      }
    />
  );

  if (loading) return (
    <div className="flex flex-col gap-4">
      {header}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]"><Skeleton className="h-80 w-full" /><Skeleton className="h-80 w-full" /></div>
    </div>
  );
  if (err && !data) return <>{header}<Empty icon="alert" text={t("error")} /></>;

  const d = data!;
  const health = d.fiscalHealth || "green";
  const healthTone = health === "green" ? "ok" : health === "yellow" ? "warn" : "danger";
  const healthKey = health === "green" ? "fiscal_ok" : health === "yellow" ? "fiscal_warn" : "fiscal_bad";
  const revenueToday = num(pl?.revenue);
  const net = num(pl?.netProfit);
  const margin = revenueToday > 0 ? Math.round((net / revenueToday) * 100) : null;
  const oldest = owed.items[0];
  const oldestWo = oldest ? byId.get(oldest.woId) : undefined;
  const shownAttention = allAttention ? attention : attention.slice(0, 4);

  return (
    <div className="flex flex-col gap-5">
      {header}

      {/* ── headline figures ── */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KpiCard
          label={t("dash_cash_in")}
          value={money(d.todaysRevenue ?? 0)} unit={t("soum")}
          pill={delta === null ? undefined : `${delta >= 0 ? "+" : ""}${delta}% ${t("dash_vs_yesterday")}`}
          pillTone={delta !== null && delta < 0 ? "danger" : "ok"}
          sub={splitLine || undefined}
          onClick={() => setShowIncome(true)}
        />
        <KpiCard
          label={t("dash_awaiting_payment")}
          value={money(owed.sum)} unit={t("soum")} tone={owed.sum > 0 ? "warn" : "neutral"}
          pill={owed.count ? `${owed.count} ${t("dash_bills")}` : undefined} pillTone="warn"
          sub={oldest ? [oldestWo ? orderLabel(oldestWo) : "", car(oldestWo), age(oldest.at)].filter(Boolean).join(" · ") : undefined}
          onClick={canInvoices ? () => router.push("/invoices") : undefined}
        />
        <KpiCard
          label={t("dash_in_shop")}
          value={countIn("in_progress")} unit={t("st_in_progress").toLowerCase()}
          pill={`${inShop.length} ${t("dash_cars")}`} pillTone="info"
          sub={`${countIn("ready")} ${t("st_ready").toLowerCase()} · ${countIn("approved")} ${t("st_approved").toLowerCase()}`}
          onClick={() => router.push("/work-orders")}
        />
        <KpiCard
          label={t("dash_net_today")}
          value={money(net)} tone={net < 0 ? "danger" : "ok"}
          pill={margin === null ? undefined : `${margin}% ${t("dash_margin")}`}
          sub={`${t("cost")} ${money(num(pl?.costOfGoods))} · ${t("dash_expense")} ${money(num(pl?.overhead))}`}
        >
          <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{t("revenue")} {money(revenueToday)}</div>
        </KpiCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── what needs somebody now ── */}
          <Card id="attention" className="scroll-mt-24 overflow-hidden">
            <CardHeader>
              <CardTitle>
                <AlertTriangle className="size-[18px] text-destructive" />
                {isMobile ? t("dash_attention_short") : t("dash_attention")}
                {attention.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-destructive-soft px-1.5 font-mono text-[11.5px] font-bold text-destructive">{attention.length}</span>}
              </CardTitle>
              {attention.length > 4 && (
                <button onClick={() => setAllAttention((v) => !v)} className="text-[13px] font-semibold text-primary-emphasis hover:underline">
                  {allAttention ? t("dash_more") : t("all")}
                </button>
              )}
            </CardHeader>
            {attention.length === 0 ? (
              <div className="flex items-center gap-2.5 px-5 py-6 text-[13.5px] text-muted-foreground">
                <ShieldCheck className="size-5 text-success" /> {t("dash_all_good")}
              </div>
            ) : shownAttention.map((a) => (
              <div key={a.key} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0 touch:flex-wrap touch:px-4">
                <span className={cn("size-2 shrink-0 rounded-full", a.tone === "danger" ? "bg-destructive" : "bg-warning")} />
                <span className="w-16 shrink-0 font-mono text-[13px] font-semibold text-ink-2">{a.ref}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-foreground">{a.title}</div>
                  <div className="truncate text-[12.5px] text-muted-foreground">{a.sub}</div>
                </div>
                <Button size="sm" variant={a.primary ? "default" : "secondary"} className="touch:w-full" onClick={() => router.push(a.href)}>
                  {isMobile && a.primary ? t("act_take_payment_short") : a.action}
                </Button>
              </div>
            ))}
            {!allAttention && attention.length > 4 && (
              <button onClick={() => setAllAttention(true)} className="w-full border-t border-border px-5 py-2.5 text-left text-[13px] font-semibold text-primary-emphasis hover:bg-secondary/60">
                {t("dash_more_n")} {attention.length - 4} ta
              </button>
            )}
          </Card>

          {/* ── cars in the workshop ── */}
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>
                {t("dash_cars_in_shop")}
                <span className="text-[13px] font-medium text-muted-foreground">{inShop.length} ta</span>
              </CardTitle>
              <Link href="/work-orders" className="text-[13px] font-semibold text-primary-emphasis hover:underline">
                {isMobile ? t("dash_board_short") : t("dash_to_board")}
              </Link>
            </CardHeader>
            {inShop.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13.5px] text-muted-foreground">{t("dash_no_cars")}</div>
            ) : isMobile ? (
              <div className="flex flex-col gap-2.5 p-3">
                {inShop.map((w) => (
                  <Link key={w.id} href={`/work-orders/${w.id}`} className="flex flex-col gap-2 rounded-[12px] border border-border bg-card p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      {w.plate ? <PlatePreview plate={w.plate} size="sm" /> : <span className="font-mono text-[13px] font-bold">{orderLabel(w)}</span>}
                      <StateBadge state={woStateFromProto(w.state)} />
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-bold text-foreground">{car(w) || orderLabel(w)}</div>
                        <div className="truncate text-[12.5px] text-muted-foreground">{[w.customerName, staffName(w.assignedMechanicId)].filter(Boolean).join(" · ")}</div>
                      </div>
                      <span className="shrink-0 font-mono text-[15px] font-bold text-foreground">{money(num(w.total))}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="px-5 py-2.5 font-bold">№</th>
                      <th className="px-3 py-2.5 font-bold">{t("col_plate")}</th>
                      <th className="px-3 py-2.5 font-bold">{t("col_car_client")}</th>
                      <th className="px-3 py-2.5 font-bold">{t("mechanic")}</th>
                      <th className="px-3 py-2.5 font-bold">{t("col_status")}</th>
                      <th className="px-5 py-2.5 text-right font-bold">{t("col_sum")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inShop.map((w) => {
                      const mech = staffName(w.assignedMechanicId);
                      return (
                        <tr key={w.id} onClick={() => router.push(`/work-orders/${w.id}`)} className="cursor-pointer border-b border-border last:border-0 hover:bg-secondary/50">
                          <td className="px-5 py-3 font-mono text-[13px] font-semibold text-ink-2">{orderLabel(w)}</td>
                          <td className="px-3 py-3">{w.plate ? <PlatePreview plate={w.plate} size="sm" /> : "—"}</td>
                          <td className="px-3 py-3">
                            <div className="max-w-[220px] truncate text-[14px] font-semibold text-foreground">{car(w) || "—"}</div>
                            {w.customerName && <div className="max-w-[220px] truncate text-[12.5px] text-muted-foreground">{w.customerName}</div>}
                          </td>
                          <td className="px-3 py-3">
                            {w.assignedMechanicId ? (
                              <span className="inline-flex items-center gap-2 text-[13.5px] text-foreground">
                                <StaffDot id={w.assignedMechanicId} name={mech} size={24} />{mech.split(" ")[0]}
                              </span>
                            ) : <Pill tone="warn">{t("no_mechanic")}</Pill>}
                          </td>
                          <td className="px-3 py-3"><StateBadge state={woStateFromProto(w.state)} /></td>
                          <td className="px-5 py-3 text-right font-mono text-[14px] font-semibold text-foreground">{money(num(w.total))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {/* ── the week's takings ── */}
          <Card className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[15px] font-bold tracking-[-0.02em] text-foreground">{t("dash_rev_7")}</div>
                <div className="truncate text-[12.5px] text-muted-foreground">
                  {t("total")} {compactMln(weekTotal, t("mln"))} {t("soum")} · {t("dash_avg")} {compactMln(weekTotal / 7, t("mln"))}/{t("dash_per_day")}
                </div>
              </div>
              <Link href="/statistics" className="shrink-0 text-[13px] font-semibold text-primary-emphasis hover:underline">{t("nav_finances")}</Link>
            </div>
            <div className="mt-4 flex h-[128px] items-end gap-2">
              {weekBars.map((b) => (
                <div key={b.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${b.day} · ${money(b.value)}`}>
                  <div className="w-full rounded-t-[6px]" style={{ height: `${Math.max(4, (b.value / weekMax) * 100)}%`, background: b.today ? "var(--accent)" : "color-mix(in oklch, var(--accent) 32%, transparent)" }} />
                  <span className={cn("text-[11.5px]", b.today ? "font-bold text-primary-emphasis" : "text-muted-foreground")}>{b.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* ── how busy each mechanic is ── */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[15px] font-bold tracking-[-0.02em] text-foreground">{t("dash_mech_load")}</div>
              <span className="text-[12.5px] text-muted-foreground">{t("dash_now")}</span>
            </div>
            {mechanics.length === 0 ? (
              <div className="py-3 text-[13px] text-muted-foreground">{t("empty")}</div>
            ) : (
              <div className="flex flex-col gap-3.5">
                {mechanics.map((m) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <StaffDot id={m.id} name={m.name} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-foreground">{m.name}</span>
                        <span className="shrink-0 text-[12px] text-muted-foreground">{m.jobs} {t("jobs_short")} · {m.hours.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} {t("hours_short")}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (m.hours / WORKDAY_HOURS) * 100)}%`, background: staffColor(m.id) }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── today's bookings ── */}
          {canAppts && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[15px] font-bold tracking-[-0.02em] text-foreground">{t("dash_today_appts")}</div>
                <Link href="/schedule" className="text-[13px] font-semibold text-primary-emphasis hover:underline">{t("nav_schedule")}</Link>
              </div>
              {todaysAppts.length === 0 ? (
                <div className="py-2 text-[13px] text-muted-foreground">{t("dash_no_appts")}</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {todaysAppts.map((a) => {
                    const at = new Date(a.scheduledAt);
                    const mech = staffName(a.mechanicId);
                    return (
                      <div key={a.id} className="flex items-center gap-3 rounded-[10px] bg-secondary/70 px-3 py-2.5">
                        <span className="w-12 shrink-0 font-mono text-[14px] font-bold text-foreground">{hhmm(at)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] font-semibold text-foreground">{[a.title, a.plate].filter(Boolean).join(" · ")}</div>
                          <div className="truncate text-[12px] text-muted-foreground">{[a.customerName, mech].filter(Boolean).join(" · ")}</div>
                        </div>
                        {!a.mechanicId && <Pill tone="warn">{t("no_mechanic")}</Pill>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* ── the panels the dashboard had before ── */}
      <SecTitle>{t("dash_more_panels")}</SecTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <SecTitle>{t("income_title")}</SecTitle>
          <IncomeBreakdownPanel shopId={shopId} from={today} to={today} />
        </Card>
        <ChartCard title={t("nav_workorders")} subtitle={`${orders.length} ${t("total").toLowerCase()}`}>
          {statusBars.length ? <HBarChart data={statusBars} color="var(--accent)" /> : <div className="grid h-[160px] place-items-center text-[13px] text-muted-foreground">{t("empty")}</div>}
        </ChartCard>
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

      <IncomeBreakdownModal open={showIncome} onClose={() => setShowIncome(false)} shopId={shopId} from={today} to={today} title={t("dash_cash_in")} />
    </div>
  );
}
