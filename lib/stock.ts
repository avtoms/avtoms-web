// Warehouse arithmetic shared by the warehouse screen, a variant's page, the stock count and the
// movement report: which ledger rows are deliveries, jobs, sales, hand-made issues or
// corrections; how fast a variant is being used and how long it will last; what it was last
// bought at; and the small sums (margin, a reorder suggestion) every one of those screens shows.
import type { Product, ProductVariant, StockMovement } from "@/lib/types";
import type { ProductInput } from "@/lib/api";
import { num } from "@/lib/format";

/** fill puts values into a "{name} kunda tugaydi"-style sentence. */
export const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

// ── what a movement was ──

export type MoveKind = "in" | "order" | "sale" | "manual" | "adjust";

// A correction (Tuzatish) is written "adj:<reason>", with the note after " · ". It changes the
// count and the stock's worth, never a supplier's account or the till — which is exactly why it
// is kept apart from a delivery and from goods issued for use.
export const ADJUST_REASONS = ["count", "damage", "loss", "internal", "return"] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];
export const adjustReasonCode = (r: AdjustReason, note: string) => `adj:${r}${note.trim() ? ` · ${note.trim()}` : ""}`;
const ADJ = /^adj:[a-z_]+/;

export function moveKind(m: StockMovement): MoveKind {
  const r = (m.reason ?? "").trim().toLowerCase();
  if (ADJ.test(r)) return "adjust";
  if (m.sourceKind === "work_order" || r.startsWith("wo_") || r.includes("work order")) return "order";
  if (m.sourceKind === "sale" || r.startsWith("sale")) return "sale";
  return m.delta >= 0 ? "in" : "manual";
}

// ── how fast stock goes ──

export type VariantStats = {
  perDay: number;            // units a day, over the recent window
  daysLeft: number | null;   // at that rate; null when nothing is being used
  lastIn?: StockMovement;    // the latest delivery (or opening stock)
};

const DAY = 86_400_000;

/**
 * statsByVariant reads the recent ledger (oldest first) into a usage rate per variant.
 *
 * Usage is what left for jobs, sales and hand-made issues, net of what came back from a job.
 * Corrections are not usage — a miscount is not consumption, and counting it would make every
 * stock-take look like a busy week. The rate is over the window, or over the variant's own
 * history when that is shorter, but never under a week: two litres on the first day is not a
 * rate of two litres a day.
 */
export function statsByVariant(moves: StockMovement[], products: Product[], windowDays = 30, now = Date.now()): Map<string, VariantStats> {
  const since = now - windowDays * DAY;
  const used = new Map<string, number>();
  const first = new Map<string, number>();
  const lastIn = new Map<string, StockMovement>();
  for (const m of moves) {
    const at = Date.parse(m.createdAt);
    if (!first.has(m.variantId)) first.set(m.variantId, at);
    const k = moveKind(m);
    if (k === "in") lastIn.set(m.variantId, m);
    if (at < since) continue;
    if (k === "order" || k === "sale" || k === "manual") used.set(m.variantId, (used.get(m.variantId) ?? 0) - m.delta);
  }
  const out = new Map<string, VariantStats>();
  for (const p of products) {
    for (const v of p.variants ?? []) {
      if (!v.id) continue;
      const u = Math.max(0, used.get(v.id) ?? 0);
      const span = Math.max(7, Math.min(windowDays, (now - Math.max(since, first.get(v.id) ?? since)) / DAY));
      const perDay = u > 0 ? u / span : 0;
      const q = num(v.quantityOnHand);
      out.set(v.id, {
        perDay,
        daysLeft: perDay > 0 ? Math.max(0, Math.floor(q / perDay)) : null,
        lastIn: lastIn.get(v.id),
      });
    }
  }
  return out;
}

/**
 * reorderQty suggests how much to order: enough for two weeks at the current rate, and at least
 * twice the minimum — whichever is more — less what is on the shelf.
 */
export function reorderQty(v: ProductVariant, perDay: number): number {
  const target = Math.max(num(v.reorderLevel) * 2, Math.ceil(perDay * 14), 1);
  return Math.max(0, Math.ceil(target - Math.max(0, num(v.quantityOnHand))));
}

// ── money ──

/** marginPct is the margin against the sell price, as the rest of the app reckons it. */
export function marginPct(cost: number, price: number): number | null {
  if (price <= 0 || cost <= 0) return null;
  return Math.round(((price - cost) / price) * 100);
}

/** suggestedPrice is cost plus 30%, rounded up to the next thousand. */
export const suggestedPrice = (cost: number) => (cost > 0 ? Math.ceil((cost * 1.3) / 1000) * 1000 : 0);

export const isLow = (v: ProductVariant) => num(v.quantityOnHand) <= num(v.reorderLevel);
export const isLoss = (v: ProductVariant) => num(v.unitPrice) > 0 && num(v.unitCost) > num(v.unitPrice);

export const variantText = (v: ProductVariant) => (v.attributes ?? []).map((a) => a.value).join(" · ");

/**
 * inputFromProduct restates a product as a save, unchanged but for `active` — which is how a
 * product is archived or brought back without opening the form. Quantities go back as they are,
 * so the save moves no stock; the barcode and classification are left out, which the server
 * reads as "keep what is stored".
 */
export function inputFromProduct(p: Product): ProductInput {
  return {
    name: p.name, description: p.description ?? "", category: p.category ?? "", unit: p.unit ?? "",
    supplier: p.supplier ?? "", supplierId: p.supplierId ?? "", brand: p.brand ?? "",
    templateId: p.templateId || undefined,
    properties: (p.properties ?? []).map((pr) => ({ name: pr.name, values: pr.values ?? [] })),
    variants: (p.variants ?? []).map((v) => ({
      id: v.id, sku: v.sku ?? "", quantityOnHand: num(v.quantityOnHand), reorderLevel: num(v.reorderLevel),
      unitCost: num(v.unitCost), unitPrice: num(v.unitPrice), active: v.active,
      attributes: v.attributes ?? [],
      ...(v.fxUnitPrice?.currency ? { fxUnitPrice: v.fxUnitPrice } : {}),
    })),
  };
}

// ── files ──

/**
 * downloadCsv hands the reader a spreadsheet. Semicolons and a BOM, because that is what Excel
 * set to a Russian or Uzbek locale opens straight into columns — commas land in one cell.
 */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type LabelItem = { name: string; variant: string; sku: string; barcode?: string; price: number };
export const LABELS_KEY = "an_labels";

/** printLabels opens the label sheet for these variants in a new tab. */
export function printLabels(items: LabelItem[]) {
  try { sessionStorage.setItem(LABELS_KEY, JSON.stringify(items)); } catch { /* private mode: the page says so */ }
  window.open("/print-labels", "_blank");
}
