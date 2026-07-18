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
import { money, num } from "@/lib/format";
import { woStateFromProto, STATE_LABEL, type WoState } from "@/lib/enums";
import type { Dashboard, WorkOrder } from "@/lib/types";
import { SecTitle, StatCard, WORow } from "../_shared";

const STATE_ORDER: WoState[] = ["draft", "estimated", "approved", "in_progress", "ready", "invoiced", "closed", "canceled"];

export default function DashboardPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [data, setData] = useState<Dashboard | null>(null);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [ago, setAgo] = useState(0);

  const load = useCallback(async () => {
    try {
      const [d, wos] = await Promise.all([api.dashboard(shopId), api.listWorkOrders(shopId)]);
      setData(d);
      setOrders(wos);
      setErr(false);
    } catch (e) {
      setErr(true);
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const tick = setInterval(() => setAgo((a) => (a + 1) % 30), 1000);
    const refresh = setInterval(() => { load(); setAgo(0); }, 30000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [load]);

  // WO status breakdown (counts per state, localized, non-zero).
  const statusBars = useMemo<BarDatum[]>(() => {
    const counts = new Map<WoState, number>();
    for (const w of orders) { const s = woStateFromProto(w.state); counts.set(s, (counts.get(s) || 0) + 1); }
    return STATE_ORDER.map((s) => ({ label: t(STATE_LABEL[s]), value: counts.get(s) || 0 })).filter((b) => b.value > 0);
  }, [orders, t]);

  // Last 7 days revenue (from work-order totals by created day).
  const revenueBars = useMemo<BarDatum[]>(() => {
    const byDay = new Map<string, number>();
    const now = Date.now();
    for (const w of orders) {
      if (!w.createdAt) continue;
      const d = new Date(w.createdAt);
      const ageDays = (now - d.getTime()) / 86400000;
      if (ageDays > 7) continue;
      const key = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
      byDay.set(key, (byDay.get(key) || 0) + num(w.total));
    }
    return [...byDay.entries()].map(([label, value]) => ({ label, value }));
  }, [orders]);

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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <span className="an-pulse size-[7px] rounded-full bg-success" /> {t("auto_refresh")} · {t("updated_ago")} {ago} {t("sec_ago")}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label={t("todays_revenue")} value={money(d.todaysRevenue ?? 0)} sub={t("soum")} icon="money" tone="accent" big />
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
    </div>
  );
}
