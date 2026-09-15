"use client";
// Yetkazuvchiga buyurtma — what is running out, grouped by who supplies it, with how much to
// order: two weeks at the rate it is being used, and at least twice the minimum. The shop
// adjusts the numbers, copies a group as a message to send the supplier, and when the goods
// arrive opens it as a delivery (Kirim hujjati) with every line already filled in.
import React, { useEffect, useMemo, useState } from "react";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { qtyUnit, unitLabel } from "@/components/catalog-fields";
import { useLang, useToast } from "@/components/providers";
import { money, num, qty as fmtQty } from "@/lib/format";
import { variantText } from "@/lib/stock";
import type { Product, ProductVariant } from "@/lib/types";
import type { ReceiptSeed } from "@/components/inventory/receipt-doc";

export type ReorderRow = { p: Product; v: ProductVariant; rec: number; supplierId: string; supplierName: string; lastCost: number };

export function ReorderSheet({ open, rows, shopName, onClose, onReceive }: {
  open: boolean; rows: ReorderRow[]; shopName: string; onClose: () => void; onReceive: (seed: ReceiptSeed) => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [qty, setQty] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) setQty(Object.fromEntries(rows.map((r) => [r.v.id!, String(r.rec)])));
  }, [open, rows]);

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; rows: ReorderRow[] }>();
    for (const r of rows) {
      const k = r.supplierId || `name:${r.supplierName}`;
      const g = m.get(k) ?? { id: r.supplierId, name: r.supplierName || t("whx_no_supplier"), rows: [] };
      g.rows.push(r);
      m.set(k, g);
    }
    return [...m.values()];
  }, [rows, t]);

  const label = (r: ReorderRow) => [r.p.brand, r.p.name, variantText(r.v)].filter(Boolean).join(" · ");
  const copy = async (g: { name: string; rows: ReorderRow[] }) => {
    const text = [
      `${t("whx_order_text")} — ${shopName}`,
      ...g.rows.map((r, i) => `${i + 1}. ${label(r)}${r.v.sku ? ` (${r.v.sku})` : ""} — ${qtyUnit(t, num(qty[r.v.id!]), r.p.unit)}`),
    ].join("\n");
    try { await navigator.clipboard.writeText(text); toast(t("whx_copied"), { icon: "check" }); }
    catch { toast(t("error"), { icon: "alert", tone: "danger" }); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>{t("whx_reorder_title")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-4 overflow-y-auto py-1">
          <p className="text-[13.5px] text-ink-2">{t("whx_reorder_hint")}</p>
          {groups.length === 0 && <p className="text-[13px] text-muted-foreground">{t("empty")}</p>}
          {groups.map((g) => (
            <div key={g.id || g.name} className="overflow-hidden rounded-[14px] border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-secondary/50 px-4 py-2.5">
                <span className="text-[14px] font-bold text-foreground">{g.name}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => copy(g)}><Copy /> {t("whx_copy")}</Button>
                  <Button size="sm" onClick={() => onReceive({
                    supplierId: g.id || undefined,
                    lines: g.rows.filter((r) => num(qty[r.v.id!]) > 0).map((r) => ({ variantId: r.v.id, qty: num(qty[r.v.id!]), cost: r.lastCost || num(r.v.unitCost) })),
                  })}><Download /> {t("whx_to_receipt")}</Button>
                </div>
              </div>
              {g.rows.map((r) => (
                <div key={r.v.id} className="grid grid-cols-[minmax(0,1fr)_120px_120px] items-center gap-3 border-t border-border px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-foreground">{label(r)}</div>
                    <div className="truncate text-[12px] text-muted-foreground">
                      {t("whx_stock").toLowerCase()} {fmtQty(r.v.quantityOnHand)} · {t("min_label")} {fmtQty(r.v.reorderLevel)}
                      {(r.lastCost || num(r.v.unitCost)) > 0 && <> · {money(r.lastCost || num(r.v.unitCost))}</>}
                    </div>
                  </div>
                  <div className="relative">
                    <Input value={qty[r.v.id!] ?? ""} inputMode="decimal" className="pr-10 text-right font-mono"
                      onChange={(e) => setQty((s) => ({ ...s, [r.v.id!]: e.target.value.replace(/[^\d.]/g, "") }))} />
                    {r.p.unit && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{unitLabel(t, r.p.unit)}</span>}
                  </div>
                  <span className="text-right font-mono text-[13px] text-muted-foreground">
                    {money(Math.round(num(qty[r.v.id!]) * (r.lastCost || num(r.v.unitCost))))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
