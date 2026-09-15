"use client";
// Inventarizatsiya — the whole shelf counted in one sitting. Every variant is listed with what
// the system holds; the shop types what it actually found, and each difference is saved as a
// correction (Tuzatish) under one reason. A variant nobody typed a number for is left alone:
// an empty box means "not counted", never "zero".
import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { unitLabel } from "@/components/catalog-fields";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num, qty as fmtQty } from "@/lib/format";
import { ADJUST_REASONS, adjustReasonCode, variantText, type AdjustReason } from "@/lib/stock";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

export function Stocktake({ open, products, onClose, onDone }: {
  open: boolean; products: Product[]; onClose: () => void; onDone: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [reason, setReason] = useState<AdjustReason>("count");
  const [note, setNote] = useState("");
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setQ(""); setCat(""); setReason("count"); setNote(""); setCounted({}); } }, [open]);

  const rows = useMemo(() => products
    .filter((p) => p.active !== false)
    .flatMap((p) => (p.variants ?? []).filter((v) => v.id && v.active !== false).map((v) => ({
      p, v, label: [p.brand, p.name, variantText(v)].filter(Boolean).join(" · "),
    })))
    .sort((a, b) => a.label.localeCompare(b.label)), [products]);
  const cats = useMemo(() => [...new Set(products.map((p) => (p.category ?? "").trim()).filter(Boolean))].sort(), [products]);
  const shown = rows.filter((r) => (!cat || (r.p.category ?? "").trim() === cat)
    && (!q.trim() || `${r.label} ${r.v.sku ?? ""} ${r.v.barcode ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));

  const diffOf = (id: string, sys: number) => {
    const s = counted[id];
    if (s === undefined || s.trim() === "") return null;
    return Math.round(((parseFloat(s) || 0) - sys) * 1000) / 1000;
  };
  const changes = rows
    .map((r) => ({ r, d: diffOf(r.v.id!, num(r.v.quantityOnHand)) }))
    .filter((x): x is { r: (typeof rows)[number]; d: number } => x.d !== null && x.d !== 0);
  const worth = changes.reduce((s, { r, d }) => s + Math.round(d * num(r.v.unitCost)), 0);

  const save = async () => {
    if (busy || changes.length === 0) return;
    setBusy(true);
    const code = adjustReasonCode(reason, note);
    let saved = 0;
    try {
      for (const { r, d } of changes) {
        await api.adjustVariantStock(r.v.id!, d, code);
        saved++;
        setCounted((c) => { const n = { ...c }; delete n[r.v.id!]; return n; });
      }
      toast(`${t("save")} · ${saved} ${t("whx_diffs")}`, { icon: "check" });
      onDone();
      onClose();
    } catch (e) {
      if (saved > 0) onDone();
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>{t("whx_stocktake_title")}</DialogTitle></DialogHeader>
        <DialogBody className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto py-1">
          <p className="text-[13.5px] text-ink-2">{t("whx_stocktake_hint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search") + "…"} className="pl-9" />
            </div>
            {cats.length > 0 && (
              <div className="w-[200px]">
                <SearchSelect value={cat} placeholder={t("category")} onChange={setCat} options={cats.map((c) => ({ value: c, label: c }))} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ADJUST_REASONS.map((r) => (
              <button key={r} onClick={() => setReason(r)}
                className={cn("rounded-[9px] border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  reason === r ? "border-primary bg-primary-soft text-primary-emphasis" : "border-border text-ink-2 hover:bg-secondary")}>
                {t(`whx_adj_${r}`)}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-[12px] border border-border">
            <div className="hidden grid-cols-[minmax(0,1fr)_100px_110px_90px] gap-3 bg-secondary/50 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground sm:grid">
              <span>{t("col_product_variant")}</span><span className="text-right">{t("whx_in_system")}</span>
              <span className="text-right">{t("whx_counted")}</span><span className="text-right">{t("whx_diff")}</span>
            </div>
            {shown.length === 0 && <p className="px-3.5 py-4 text-[13px] text-muted-foreground">{t("empty")}</p>}
            {shown.map((r) => {
              const sys = num(r.v.quantityOnHand);
              const d = diffOf(r.v.id!, sys);
              return (
                <div key={r.v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border px-3.5 py-2 sm:grid sm:grid-cols-[minmax(0,1fr)_100px_110px_90px]">
                  <div className="min-w-0 basis-full sm:basis-auto">
                    <div className="truncate text-[13.5px] font-semibold text-foreground">{r.label}</div>
                    {(r.v.sku || r.p.category) && <div className="truncate text-[11.5px] text-muted-foreground">{[r.v.sku, r.p.category].filter(Boolean).join(" · ")}</div>}
                  </div>
                  <span className="flex-1 text-right font-mono text-[13.5px] text-foreground sm:flex-none">{fmtQty(sys)}{r.p.unit ? <span className="text-[11px] text-muted-foreground"> {unitLabel(t, r.p.unit)}</span> : null}</span>
                  <Input value={counted[r.v.id!] ?? ""} inputMode="decimal" placeholder="—" className="h-9 w-24 text-right font-mono sm:w-auto"
                    onChange={(e) => setCounted((c) => ({ ...c, [r.v.id!]: e.target.value.replace(/[^\d.]/g, "") }))} />
                  <span className={cn("w-16 text-right font-mono text-[13.5px] font-bold sm:w-auto",
                    d === null || d === 0 ? "text-muted-foreground" : d < 0 ? "text-destructive" : "text-success")}>
                    {d === null ? "" : `${d > 0 ? "+" : ""}${fmtQty(d)}`}
                  </span>
                </div>
              );
            })}
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("whx_adj_note_ph")} />
        </DialogBody>
        <DialogFooter className="items-center justify-between">
          <span className="text-[13px] text-muted-foreground">
            {changes.length} {t("whx_diffs")}
            {worth !== 0 && <> · <span className={cn("font-mono font-semibold", worth < 0 ? "text-destructive" : "text-success")}>{worth > 0 ? "+" : "−"}{money(Math.abs(worth))}</span></>}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>{t("cancel")}</Button>
            <Button disabled={busy || changes.length === 0} onClick={save}>{busy ? <Spinner /> : t("whx_adj_save")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
