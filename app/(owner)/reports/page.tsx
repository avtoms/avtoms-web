"use client";
// Reports (owner-pages.jsx ReportsPage): pick one of the 6 report kinds, render the
// columns + rows from api.report, export current rows as CSV client-side.
import React, { useCallback, useEffect, useState } from "react";
import { Card, Btn, Spinner, Empty } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { REPORT_KINDS } from "@/lib/enums";
import type { Report } from "@/lib/types";

const REPORT_KEYS = Object.keys(REPORT_KINDS);
const TITLE_KEY: Record<string, string> = {
  daily_revenue: "rep_daily_revenue", weekly_wo: "rep_weekly_wo", mechanic: "rep_mechanic",
  menu: "rep_menu", fiscal: "rep_fiscal", retention: "rep_retention",
};

export default function ReportsPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [sel, setSel] = useState(REPORT_KEYS[0]);
  const [rep, setRep] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    try { setRep(await api.report(shopId, key)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); setRep(null); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  useEffect(() => { load(sel); }, [sel, load]);

  const exportCsv = () => {
    if (!rep) return;
    const head = rep.columns.join(",");
    const body = rep.rows.map((r) => rep.columns.map((c) => `"${(r.cells[c] ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = sel + ".csv"; a.click();
    URL.revokeObjectURL(a.href);
    toast(t("export_csv"), { icon: "download" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
        {REPORT_KEYS.map((k) => (
          <button key={k} onClick={() => setSel(k)} className="an-card-hover" style={{
            display: "flex", alignItems: "center", gap: 10, padding: "14px 14px", border: "1px solid " + (k === sel ? "var(--accent)" : "var(--line)"),
            borderRadius: "var(--radius)", background: k === sel ? "var(--accent-soft)" : "var(--surface)", cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left",
          }}>
            <Icon name="chart" size={18} style={{ color: k === sel ? "var(--accent-2)" : "var(--ink-3)" }} />
            <span style={{ fontWeight: 600, color: k === sel ? "var(--accent-2)" : "var(--ink)", fontSize: "calc(13.5px * var(--scale))" }}>{t(TITLE_KEY[k] || k)}</span>
          </button>
        ))}
      </div>
      <Card pad={0}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: "calc(16px * var(--scale))", fontWeight: 700, color: "var(--ink)" }}>{t(TITLE_KEY[sel] || sel)}</h3>
          <Btn variant="secondary" size="sm" icon="download" onClick={exportCsv} disabled={!rep || rep.rows.length === 0}>{t("export_csv")}</Btn>
        </div>
        {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={24} /></div>
          : !rep || rep.rows.length === 0 ? <div style={{ padding: 24 }}><Empty icon="chart" /></div>
          : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                <thead><tr>{rep.columns.map((c) => <th key={c} style={{ textAlign: "left", padding: "11px 18px", fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
                <tbody>{rep.rows.map((r, i) => <tr key={i}>{rep.columns.map((c, j) => <td key={c} style={{ padding: "11px 18px", fontSize: "calc(13.5px * var(--scale))", color: j === 0 ? "var(--ink)" : "var(--ink-2)", fontWeight: j === 0 ? 600 : 500, fontFamily: /^\d|revenue|price|vat|hours|rate|compliance|count|total/.test(c) ? "var(--font-mono)" : "var(--font-sans)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{r.cells[c] ?? ""}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  );
}
