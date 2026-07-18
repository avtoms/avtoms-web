"use client";
// Super-admin platform analytics: which services sell best across EVERY company on the
// platform, with the same derived suggestions the owner sees per-shop. Data comes from the
// reporting service's platform aggregation (all shops, no shop_id filter).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Download, BarChart3 } from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Button } from "@/components/ui-kit/button";
import { Card } from "@/components/ui-kit/card";
import { Skeleton } from "@/components/ui-kit/misc";
import { ServiceInsights } from "@/components/service-insights";
import { useLang } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";
import type { Report, ReportRow } from "@/lib/types";

// Money columns are rendered with the shared soum formatter; the rest stay raw.
const MONEY_COLS = new Set(["revenue", "discount", "cost", "margin"]);

export default function AdminServicesPage() {
  const { t } = useLang();
  const [rep, setRep] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRep(await api.platformServiceStats()); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : t("error")); setRep(null); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo<ColumnDef<ReportRow>[]>(() => {
    if (!rep) return [];
    return rep.columns.map((c, idx) => ({
      id: c,
      accessorFn: (r) => r.cells[c] ?? "",
      sortingFn: MONEY_COLS.has(c) || /count|qty|quantity|orders/.test(c)
        ? (a, b) => num(a.original.cells[c]) - num(b.original.cells[c])
        : "alphanumeric",
      header: ({ column }) => <SortHeader column={column}>{c.replace(/_/g, " ")}</SortHeader>,
      cell: ({ row }) => {
        const v = row.original.cells[c] ?? "";
        return (
          <span className={idx === 0 ? "font-semibold text-foreground" : "font-mono text-ink-2"}>
            {MONEY_COLS.has(c) ? money(v || "0") : v}
          </span>
        );
      },
    }));
  }, [rep]);

  const exportCsv = () => {
    if (!rep) return;
    const head = rep.columns.join(",");
    const body = rep.rows.map((r) => rep.columns.map((c) => `"${(r.cells[c] ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "platform-services.csv"; a.click();
    URL.revokeObjectURL(a.href);
    toast.success(t("export_csv"));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-foreground">{t("svc_analytics")}</h2>
          <div className="mt-0.5 text-[13px] font-semibold text-muted-foreground">{t("svc_platform_sub")}</div>
        </div>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rep || rep.rows.length === 0}>
          <Download /> {t("export_csv")}
        </Button>
      </div>

      {loading && !rep ? (
        <Card className="gap-3 p-5">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </Card>
      ) : !rep || rep.rows.length === 0 ? (
        <Card className="items-center gap-3 px-5 py-14 text-center">
          <div className="grid size-[52px] place-items-center rounded-[14px] bg-secondary text-muted-foreground"><BarChart3 className="size-6" /></div>
          <span className="text-sm font-medium text-muted-foreground">{t("no_sales_yet")}</span>
        </Card>
      ) : (
        <>
          <ServiceInsights rows={rep.rows} scope="platform" />
          <DataTable
            columns={columns}
            data={rep.rows}
            searchPlaceholder={`${t("svc_analytics")}…`}
            enableColumnToggle={false}
            pageSize={15}
          />
        </>
      )}
    </div>
  );
}
