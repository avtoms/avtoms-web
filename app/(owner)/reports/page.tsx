"use client";
// Reports: pick one of the 6 report kinds, render columns + rows as a searchable/sortable
// DataTable, chart the primary numeric column when there is one, export CSV.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Button } from "@/components/ui-kit/button";
import { Card } from "@/components/ui-kit/card";
import { Skeleton } from "@/components/ui-kit/misc";
import { ChartCard, HBarChart, type BarDatum } from "@/components/admin/charts";
import { ServiceInsights } from "@/components/service-insights";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { REPORT_KINDS } from "@/lib/enums";
import { money, num } from "@/lib/format";
import type { Report, ReportRow } from "@/lib/types";

const REPORT_KEYS = Object.keys(REPORT_KINDS);
const TITLE_KEY: Record<string, string> = {
  daily_revenue: "rep_daily_revenue", weekly_wo: "rep_weekly_wo", mechanic: "rep_mechanic",
  menu: "rep_menu", fiscal: "rep_fiscal", retention: "rep_retention",
  payment_methods: "income_by_method", top_products: "rep_top_products",
};
const MONEY_RE = /revenue|price|vat|total|amount|profit|margin|cost|net/i;
// Column keys the backend sends, mapped to a translated header where one exists; anything
// else falls back to the raw key with underscores opened up.
const COL_KEY: Record<string, string> = {
  product: "product", sku: "sku", sold: "sold_qty", revenue: "revenue", cost: "cost_of_goods",
  margin: "gross_margin", times: "sold_times", service: "service", discount: "discount",
  method: "payment_method", card_label: "card_label", card_number: "card_number",
  amount: "amount", count: "payments_n",
};
const NUM_RE = /revenue|price|vat|total|amount|profit|margin|cost|net|count|hours|rate|orders|qty|quantity|compliance/i;

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

  const columns = useMemo<ColumnDef<ReportRow>[]>(() => {
    if (!rep) return [];
    return rep.columns.map((c, idx) => ({
      id: c,
      accessorFn: (r) => r.cells[c] ?? "",
      sortingFn: NUM_RE.test(c) ? (a, b) => num(a.original.cells[c]) - num(b.original.cells[c]) : "alphanumeric",
      header: ({ column }) => <SortHeader column={column}>{COL_KEY[c] ? t(COL_KEY[c]) : c.replace(/_/g, " ")}</SortHeader>,
      cell: ({ row }) => {
        const v = row.original.cells[c] ?? "";
        return <span className={idx === 0 ? "font-semibold text-foreground" : NUM_RE.test(c) ? "font-mono text-ink-2" : "text-ink-2"}>{MONEY_RE.test(c) ? money(v || "0") : v}</span>;
      },
    }));
  }, [rep, t]);

  // Chart the first meaningful numeric column against the first (label) column.
  const chart = useMemo<{ data: BarDatum[]; isMoney: boolean } | null>(() => {
    if (!rep || rep.rows.length === 0 || rep.columns.length < 2) return null;
    const labelCol = rep.columns[0];
    const valCol = rep.columns.slice(1).find((c) => NUM_RE.test(c) && rep.rows.some((r) => num(r.cells[c]) > 0));
    if (!valCol) return null;
    const data = rep.rows.slice(0, 12).map((r) => ({ label: String(r.cells[labelCol] ?? "—"), value: num(r.cells[valCol]) }));
    return { data, isMoney: MONEY_RE.test(valCol) };
  }, [rep]);

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
    <div className="flex flex-col gap-5">
      {/* Report kind selector */}
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
        {REPORT_KEYS.map((k) => {
          const on = k === sel;
          return (
            <button key={k} onClick={() => setSel(k)}
              className={cn(
                "flex items-center gap-2.5 rounded-[12px] border px-3.5 py-3 text-left transition-colors",
                on ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary",
              )}>
              <BarChart3 className={cn("size-[18px] shrink-0", on ? "text-primary-emphasis" : "text-muted-foreground")} />
              <span className={cn("text-[13.5px] font-semibold", on ? "text-primary-emphasis" : "text-foreground")}>{t(TITLE_KEY[k] || k)}</span>
            </button>
          );
        })}
      </div>

      {sel === "menu" && rep && rep.rows.length > 0 && <ServiceInsights rows={rep.rows} scope="shop" />}

      {loading && !rep ? (
        <Card className="gap-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</Card>
      ) : !rep || rep.rows.length === 0 ? (
        <Card className="items-center gap-3 px-5 py-14 text-center">
          <div className="grid size-[52px] place-items-center rounded-[14px] bg-secondary text-muted-foreground"><BarChart3 className="size-6" /></div>
          <span className="text-sm font-medium text-muted-foreground">{t("empty")}</span>
        </Card>
      ) : (
        <>
          {chart && (
            <ChartCard title={t(TITLE_KEY[sel] || sel)} subtitle={chart.isMoney ? "so'm" : undefined}>
              <HBarChart data={chart.data} color="var(--chart-1)" unit={chart.isMoney ? "so'm" : undefined} formatter={chart.isMoney ? (v) => money(v) : undefined} />
            </ChartCard>
          )}
          <DataTable
            columns={columns}
            data={rep.rows}
            searchPlaceholder={`${t(TITLE_KEY[sel] || sel)}…`}
            enableColumnToggle={false}
            pageSize={15}
            toolbar={<Button variant="secondary" size="sm" onClick={exportCsv}><Download /> {t("export_csv")}</Button>}
          />
        </>
      )}
    </div>
  );
}
