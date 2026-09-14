"use client";
// Ombor / Harakatlar hisoboti — the warehouse over a period: what it held at the start, what came
// in, what went out for jobs and sales and what was issued by hand, what was corrected, and what
// it holds at the end; day by day, and product by product.
//
// Read from the shop-wide stock ledger. The opening count is today's count less everything that
// has moved since the period began, so it is exact; the money figures are at each variant's
// current average cost, which the page says under the table.
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { Card } from "@/components/ui-kit/card";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { PageHeader } from "@/components/page-header";
import { unitLabel } from "@/components/catalog-fields";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { compactMln, dayMonth, money, num, qty as fmtQty } from "@/lib/format";
import { firstOfMonth, shiftDay, spanRange, todayYMD } from "@/lib/range";
import { downloadCsv, fill, moveKind, variantText } from "@/lib/stock";
import { cn } from "@/lib/utils";
import type { Product, ProductVariant, StockMovement } from "@/lib/types";
import { KpiCard } from "../../_shared";

type Period = "week" | "month" | "quarter" | "custom";
type Tab = "all" | "in" | "out" | "adjust";
type Line = {
  key: string; name: string; unit?: string; cost: number;
  opening: number; in: number; out: number; adj: number; closing: number;
  nIn: number; nOut: number; nAdj: number;
};
type Day = { in: number; out: number; adj: number };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const signed = (n: number) => (n > 0 ? `+${money(n)}` : n < 0 ? `−${money(-n)}` : "0");
const signedQty = (n: number) => (n > 0 ? `+${fmtQty(n)}` : n < 0 ? `−${fmtQty(-n)}` : "0");

export default function MovementsReportPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();
  const today = todayYMD();
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState({ from: shiftDay(today, -29), to: today });
  const [tab, setTab] = useState<Tab>("all");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [moves, setMoves] = useState<StockMovement[] | null>(null);

  const { fromYMD, toYMD } = useMemo(() => {
    if (period === "week") return { fromYMD: shiftDay(today, -6), toYMD: today };
    if (period === "month") return { fromYMD: firstOfMonth(today), toYMD: today };
    if (period === "quarter") {
      const d = new Date();
      return { fromYMD: ymd(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)), toYMD: today };
    }
    const [a, b] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
    return { fromYMD: a, toYMD: b > today ? today : b };
  }, [period, custom, today]);
  const range = useMemo(() => spanRange(fromYMD, toYMD), [fromYMD, toYMD]);

  useEffect(() => {
    let alive = true;
    setMoves(null);
    // From the start of the period until now — not just its end — because the opening count is
    // today's count less everything that moved since the period began.
    Promise.all([api.listProducts(shopId), api.listShopMovements(shopId, spanRange(fromYMD, today).from)])
      .then(([p, m]) => { if (alive) { setProducts(p); setMoves(m); } })
      .catch((e) => {
        if (!alive) return;
        setProducts((x) => x ?? []);
        setMoves([]);
        toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      });
    return () => { alive = false; };
  }, [shopId, fromYMD, today, t, toast]);

  const data = useMemo(() => {
    if (!products || !moves) return null;
    const fromMs = Date.parse(range.from), toMs = Date.parse(range.to);
    const vmap = new Map<string, { p: Product; v: ProductVariant }>();
    for (const p of products) for (const v of p.variants ?? []) if (v.id) vmap.set(v.id, { p, v });

    const lines = new Map<string, Line>();
    const lineOf = (vid: string) => {
      let l = lines.get(vid);
      if (!l) {
        const x = vmap.get(vid);
        l = {
          key: vid, name: x ? [x.p.brand, x.p.name, variantText(x.v)].filter(Boolean).join(" · ") : "—",
          unit: x?.p.unit, cost: num(x?.v.unitCost), opening: 0, in: 0, out: 0, adj: 0, closing: 0, nIn: 0, nOut: 0, nAdj: 0,
        };
        lines.set(vid, l);
      }
      return l;
    };
    const since = new Map<string, number>();
    const days = new Map<string, Day>();
    let docs = 0, adjN = 0, outOrders = 0, outManual = 0, sales = 0;
    const suppliers = new Set<string>();
    const orders = new Set<string>();

    for (const m of moves) {
      const at = Date.parse(m.createdAt);
      if (at < fromMs) continue;
      since.set(m.variantId, (since.get(m.variantId) ?? 0) + m.delta);
      if (at > toMs) continue;
      const l = lineOf(m.variantId);
      const k = moveKind(m);
      const value = m.delta * l.cost;
      const dk = ymd(new Date(at));
      const d = days.get(dk) ?? { in: 0, out: 0, adj: 0 };
      if (k === "in") {
        l.in += m.delta; l.nIn++; d.in += value; docs++;
        if (m.contragentId) suppliers.add(m.contragentId);
      } else if (k === "adjust") {
        l.adj += m.delta; l.nAdj++; d.adj += value; adjN++;
      } else {
        l.out += m.delta; l.nOut++; d.out += value;
        if (k === "manual") outManual += -value;
        else {
          outOrders += -value;
          if (k === "order" && m.sourceId) orders.add(m.sourceId);
          if (k === "sale") sales += -value;
        }
      }
      days.set(dk, d);
    }
    // Every variant with stock at either end, or anything that moved.
    for (const [vid, x] of vmap) {
      const opening = num(x.v.quantityOnHand) - (since.get(vid) ?? 0);
      if (!lines.has(vid) && Math.abs(opening) < 1e-9) continue;
      const l = lineOf(vid);
      l.opening = Math.round(opening * 1000) / 1000;
    }
    for (const l of lines.values()) l.closing = Math.round((l.opening + l.in + l.out + l.adj) * 1000) / 1000;

    const rows = [...lines.values()].sort((a, b) => a.name.localeCompare(b.name));
    const sum = (f: (l: Line) => number) => Math.round(rows.reduce((s, l) => s + f(l), 0));
    return {
      rows, days, docs, adjN, suppliers: suppliers.size, orders: orders.size,
      outOrders: Math.round(outOrders), outManual: Math.round(outManual), sales: Math.round(sales),
      totals: {
        opening: sum((l) => l.opening * l.cost), in: sum((l) => l.in * l.cost), out: sum((l) => l.out * l.cost),
        adj: sum((l) => l.adj * l.cost), closing: sum((l) => l.closing * l.cost),
      },
      positions: rows.filter((l) => l.opening > 0).length,
    };
  }, [products, moves, range]);

  const dayList = useMemo(() => {
    const out: string[] = [];
    for (let d = fromYMD; d <= toYMD && out.length < 100; d = shiftDay(d, 1)) out.push(d);
    return out;
  }, [fromYMD, toYMD]);

  const shownRows = (data?.rows ?? []).filter((l) =>
    tab === "all" || (tab === "in" && l.nIn > 0) || (tab === "out" && l.nOut > 0) || (tab === "adjust" && l.nAdj > 0));

  const exportCsv = () => downloadCsv(`ombor-harakat-${fromYMD}-${toYMD}.csv`, [
    [t("col_product_variant"), t("unit"), t("whx_begin"), t("receive"), t("consume"), t("whx_adjust_btn"), t("whx_end"), t("whx_value_cost")],
    ...shownRows.map((l) => [l.name, l.unit ? unitLabel(t, l.unit) : "", l.opening, l.in, l.out, l.adj, l.closing, Math.round(l.closing * l.cost)]),
  ]);

  const periods: [Period, string][] = [["week", t("whx_week")], ["month", t("whx_month")], ["quarter", t("whx_quarter")], ["custom", t("whx_period")]];
  const maxDay = Math.max(1, ...dayList.map((d) => {
    const x = data?.days.get(d);
    return x ? Math.max(x.in, -x.out, Math.abs(x.adj)) : 0;
  }));
  const h = (v: number) => `${Math.max(v > 0 ? 2 : 0, (Math.abs(v) / maxDay) * 100)}%`;
  const labelEvery = Math.max(1, Math.ceil(dayList.length / 12));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={
          <div className="flex min-w-0 items-center gap-2 text-[19px] font-bold tracking-[-0.025em]">
            <Link href="/inventory" className="text-muted-foreground hover:text-foreground">{t("nav_inventory")}</Link>
            <span className="text-muted-foreground">/</span>
            <span className="truncate text-foreground">{t("whx_movements")}</span>
          </div>
        }
        actions={
          <>
            <div className="inline-flex gap-0.5 rounded-[10px] bg-secondary p-1">
              {periods.map(([k, l]) => (
                <button key={k} onClick={() => setPeriod(k)} aria-pressed={period === k}
                  className={cn("min-h-8 rounded-[8px] px-3 text-[13px] font-semibold transition-colors touch:min-h-11",
                    period === k ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground hover:text-foreground")}>{l}</button>
              ))}
            </div>
            <Button variant="secondary" onClick={exportCsv} disabled={!data}><FileDown /> Excel</Button>
          </>
        }
      />

      {period === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          {t("whx_from")} <Input type="date" value={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="w-[160px]" />
          {t("whx_to")} <Input type="date" value={custom.to} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="w-[160px]" />
        </div>
      )}

      {!data ? (
        <Card className="flex items-center justify-center p-10"><Spinner className="size-6" /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard label={t("whx_opening")} value={money(data.totals.opening)} sub={`${dayMonth(range.from)} · ${data.positions} ${t("whx_positions")}`} />
            <KpiCard label={t("receive")} value={signed(data.totals.in)} tone="ok"
              sub={`${data.docs} ${t("whx_docs")} · ${data.suppliers} ${t("whx_suppliers_n")}`} />
            <KpiCard label={t("whx_out_orders")} value={signed(-data.outOrders)} tone="danger"
              sub={`${data.orders} ${t("whx_orders_n")} · ${t("whx_in_sales")} ${money(data.sales)}`} />
            <KpiCard label={t("whx_out_manual")} value={signed(-data.outManual)} tone="danger" />
            <KpiCard label={t("whx_adjustments")} value={signed(data.totals.adj)} tone="warn" sub={`${data.adjN} ${t("whx_cnt_adj_plain")}`} />
          </div>

          <Card className="gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[15px] font-bold text-foreground">{t("whx_daily")}</span>
              <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-success" /> {t("receive")}</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-destructive" /> {t("consume")}</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-warning" /> {t("whx_adjust_btn")}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex h-[150px] flex-col justify-between py-0.5 text-right font-mono text-[10.5px] text-muted-foreground">
                <span>{compactMln(maxDay, t("mln"))}</span><span>{compactMln(maxDay / 2, t("mln"))}</span><span>0</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="relative flex h-[150px] items-end gap-[2px] border-b border-border">
                  {dayList.map((d) => {
                    const x = data.days.get(d);
                    return (
                      <div key={d} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px"
                        title={x ? `${dayMonth(d)} · +${money(x.in)} · −${money(-x.out)} · ${signed(x.adj)}` : dayMonth(d)}>
                        {x && <div className="w-full max-w-[9px] rounded-t-[2px] bg-success" style={{ height: h(x.in) }} />}
                        {x && <div className="w-full max-w-[9px] rounded-t-[2px] bg-destructive" style={{ height: h(-x.out) }} />}
                        {x && <div className="w-full max-w-[9px] rounded-t-[2px] bg-warning" style={{ height: h(x.adj) }} />}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex gap-[2px]">
                  {dayList.map((d, i) => (
                    <span key={d} className={cn("min-w-0 flex-1 truncate text-center font-mono text-[10.5px]", d === today ? "font-bold text-foreground" : "text-muted-foreground")}>
                      {d === today ? t("whx_today") : i % labelEvery === 0 ? String(Number(d.slice(8))) : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
              <span className="text-[15px] font-bold text-foreground">{t("whx_by_product")}</span>
              <div className="inline-flex gap-0.5 rounded-[10px] bg-secondary p-1">
                {([["all", t("all")], ["in", t("receive")], ["out", t("consume")], ["adjust", t("whx_adjust_btn")]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)}
                    className={cn("min-h-8 rounded-[8px] px-3 text-[13px] font-semibold transition-colors",
                      tab === k ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground hover:text-foreground")}>{l}</button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13.5px]">
                <thead className="bg-secondary/50 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left">{t("col_product_variant")}</th>
                    <th className="px-3 py-2.5 text-right">{t("whx_begin")}</th>
                    <th className="px-3 py-2.5 text-right">{t("receive")}</th>
                    <th className="px-3 py-2.5 text-right">{t("consume")}</th>
                    <th className="px-3 py-2.5 text-right">{t("whx_adjust_btn")}</th>
                    <th className="px-3 py-2.5 text-right">{t("whx_end")}</th>
                    <th className="px-5 py-2.5 text-right">{t("whx_value_cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shownRows.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">{t("empty")}</td></tr>
                  )}
                  {shownRows.map((l) => {
                    const counts = [
                      l.nIn ? fill(t("whx_cnt_in"), { n: l.nIn }) : "", l.nOut ? fill(t("whx_cnt_out"), { n: l.nOut }) : "",
                      l.nAdj ? fill(t("whx_cnt_adj"), { n: l.nAdj }) : "",
                    ].filter(Boolean).join(", ");
                    return (
                      <tr key={l.key} className="border-t border-border">
                        <td className="px-5 py-2.5">
                          <div className="font-semibold text-foreground">{l.name}</div>
                          <div className="text-[12px] text-muted-foreground">{[l.unit ? unitLabel(t, l.unit) : "", counts || t("whx_no_moves")].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">{fmtQty(l.opening)}</td>
                        <td className={cn("px-3 py-2.5 text-right font-mono", l.in ? "text-success" : "text-muted-foreground")}>{signedQty(l.in)}</td>
                        <td className={cn("px-3 py-2.5 text-right font-mono", l.out ? "text-destructive" : "text-muted-foreground")}>{signedQty(l.out)}</td>
                        <td className={cn("px-3 py-2.5 text-right font-mono", l.adj ? "text-warning" : "text-muted-foreground")}>{signedQty(l.adj)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtQty(l.closing)}</td>
                        <td className="px-5 py-2.5 text-right font-mono">{money(Math.round(l.closing * l.cost))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-border bg-secondary/40 font-mono">
                  <tr>
                    <td className="px-5 py-3 font-sans font-bold text-foreground">{t("total")}</td>
                    <td className="px-3 py-3 text-right">{money(data.totals.opening)}</td>
                    <td className="px-3 py-3 text-right text-success">{signed(data.totals.in)}</td>
                    <td className="px-3 py-3 text-right text-destructive">{signed(data.totals.out)}</td>
                    <td className="px-3 py-3 text-right text-warning">{signed(data.totals.adj)}</td>
                    <td className="px-3 py-3" />
                    <td className="px-5 py-3 text-right font-bold">{money(data.totals.closing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
          <p className="px-1 text-[12px] text-muted-foreground">{t("whx_approx_note")}</p>
        </>
      )}
    </div>
  );
}
