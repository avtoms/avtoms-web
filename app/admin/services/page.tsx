"use client";
// Super-admin platform analytics: which services sell best across EVERY company on the
// platform, with the same derived suggestions the owner sees per-shop. Data comes from the
// reporting service's platform aggregation (all shops, no shop_id filter).
import React, { useCallback, useEffect, useState } from "react";
import { Card, Btn, Empty, SkeletonRows } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ServiceInsights } from "@/components/service-insights";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import type { Report } from "@/lib/types";

// Money columns are rendered with the shared soum formatter; the rest stay raw.
const MONEY_COLS = new Set(["revenue", "discount", "cost", "margin"]);

export default function AdminServicesPage() {
  const { t } = useLang();
  const { toast } = useToast();
  const [rep, setRep] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRep(await api.platformServiceStats()); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); setRep(null); }
    finally { setLoading(false); }
  }, [t, toast]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    if (!rep) return;
    const head = rep.columns.join(",");
    const body = rep.rows.map((r) => rep.columns.map((c) => `"${(r.cells[c] ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "platform-services.csv"; a.click();
    URL.revokeObjectURL(a.href);
    toast(t("export_csv"), { icon: "download" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "calc(18px * var(--scale))", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.02em" }}>{t("svc_analytics")}</h2>
          <div style={{ marginTop: 3, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}>{t("svc_platform_sub")}</div>
        </div>
        <Btn variant="secondary" size="sm" icon="download" onClick={exportCsv} disabled={!rep || rep.rows.length === 0}>{t("export_csv")}</Btn>
      </div>

      {loading && !rep ? <Card pad={0}><SkeletonRows rows={6} avatar={false} /></Card>
        : !rep || rep.rows.length === 0 ? <Card pad={24}><Empty icon="chart" text={t("no_sales_yet")} /></Card>
        : (
          <>
            <ServiceInsights rows={rep.rows} scope="platform" />
            <Card pad={0}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                  <thead><tr>{rep.columns.map((c) => <th key={c} style={{ textAlign: "left", padding: "11px 18px", fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
                  <tbody>{rep.rows.map((r, i) => (
                    <tr key={i}>{rep.columns.map((c, j) => (
                      <td key={c} style={{ padding: "11px 18px", fontSize: "calc(13.5px * var(--scale))", color: j === 0 ? "var(--ink)" : "var(--ink-2)", fontWeight: j === 0 ? 600 : 500, fontFamily: c === "service" ? "var(--font-sans)" : "var(--font-mono)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>
                        {MONEY_COLS.has(c) ? money(r.cells[c] ?? "0") : (r.cells[c] ?? "")}
                      </td>
                    ))}</tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          </>
        )}
    </div>
  );
}
