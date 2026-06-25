"use client";
// Dashboard (owner.jsx Dashboard): live widgets from api.dashboard, auto-refresh every 30s,
// plus a recent work-order list from api.listWorkOrders.
import React, { useCallback, useEffect, useState } from "react";
import { Card, Badge, Spinner, Empty, useIsMobile } from "@/components/ui";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import type { Dashboard, WorkOrder } from "@/lib/types";
import { SecTitle, StatCard, WORow } from "../_shared";
import Link from "next/link";

export default function DashboardPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [data, setData] = useState<Dashboard | null>(null);
  const [recent, setRecent] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [ago, setAgo] = useState(0);

  const load = useCallback(async () => {
    try {
      const [d, wos] = await Promise.all([api.dashboard(shopId), api.listWorkOrders(shopId)]);
      setData(d);
      setRecent(wos.slice(0, 6));
      setErr(false);
    } catch (e) {
      setErr(true);
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);
  // auto-refresh every 30s + 1s "ago" ticker
  useEffect(() => {
    const tick = setInterval(() => setAgo((a) => (a + 1) % 30), 1000);
    const refresh = setInterval(() => { load(); setAgo(0); }, 30000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [load]);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={28} /></div>;
  if (err && !data) return <Empty icon="alert" text={t("error")} />;

  const d = data!;
  const health = d.fiscalHealth || "green";
  const healthTone = health === "green" ? "ok" : health === "yellow" ? "warn" : "danger";
  const healthKey = health === "green" ? "fiscal_ok" : health === "yellow" ? "fiscal_warn" : "fiscal_bad";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-3)", fontSize: 12.5 }}>
        <span className="an-pulse" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--ok)" }} /> {t("auto_refresh")} · {t("updated_ago")} {ago} {t("sec_ago")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(auto-fit, minmax(150px, 1fr))" : "repeat(4, 1fr)", gap: 14 }}>
        <StatCard label={t("todays_revenue")} value={money(d.todaysRevenue ?? 0)} sub={t("soum")} icon="money" tone="accent" big />
        <StatCard label={t("jobs_in_progress")} value={d.jobsInProgress ?? 0} icon="wrench" tone="warn" />
        <StatCard label={t("ready_for_pickup")} value={d.readyForPickup ?? 0} icon="check" tone="ok" />
        <StatCard label={t("awaiting_approval")} value={d.awaitingApproval ?? 0} icon="clock" tone="info" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.5fr 1fr", gap: 16, alignItems: "start" }}>
        <Card pad={0}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <SecTitle>{t("nav_workorders")}</SecTitle>
            <Link href="/work-orders" style={{ color: "var(--accent-2)", fontWeight: 600, fontSize: 13, textDecoration: "none" }}>{t("view_all")} →</Link>
          </div>
          {recent.length === 0 ? <div style={{ padding: 24 }}><Empty icon="clipboard" /></div> : recent.map((w) => <WORow key={w.id} wo={w} />)}
        </Card>

        <Card>
          <SecTitle right={<Badge tone={healthTone} dot>{t(healthKey)}</Badge>}>{t("fiscal_health")}</SecTitle>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {["green", "yellow", "red"].map((c) => (
              <div key={c} style={{ flex: 1, height: 8, borderRadius: 99, background: c === health ? (c === "green" ? "var(--ok)" : c === "yellow" ? "var(--warn)" : "var(--danger)") : "var(--surface-2)" }} />
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--ink-2)" }}>{t(healthKey)}</div>
        </Card>
      </div>
    </div>
  );
}
