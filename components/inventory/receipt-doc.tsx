"use client";
// Kirim hujjati — one delivery from one supplier, entered as the delivery note reads: a line per
// item, its count and purchase price, the total, what was paid now and how, and where that
// leaves the supplier's account. Before this a ten-line delivery was ten trips through a
// product's receive panel, each asking again who the supplier was.
//
// Lines are found by name, article or barcode (typed, or read by the camera), and a line for
// goods the warehouse has never carried makes the product on save. Accepting records each line
// as the receipt it is — the same call the receive panel makes — so the ledger, the average
// cost and the supplier's account move exactly as they always have; the money paid now is set
// against the lines in order.
//
// A delivery not ready to accept can be kept as a draft on this device and finished later.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScanBarcode, Search, X, Plus, Info } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui-kit/sheet";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { MoneyInput, UnitSelect, unitLabel } from "@/components/catalog-fields";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { NoSupplierNote } from "@/components/delivery-summary";
import { blankPayment, toParts, useShopAccounts, useShopCards, type Payment } from "@/components/payment-picker";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num, qty as fmtQty, shortDate } from "@/lib/format";
import { variantText } from "@/lib/stock";
import { cn } from "@/lib/utils";
import type { Contragent, Product, ProductVariant } from "@/lib/types";

export type ReceiptSeedLine = { variantId?: string; qty?: number; cost?: number; newName?: string; newUnit?: string };
export type ReceiptSeed = { supplierId?: string; lines: ReceiptSeedLine[] };

type Line = { key: string; variantId?: string; newName?: string; newUnit: string; qty: string; cost: string };
type PayMethod = "cash" | "card" | "transfer" | "later";
type Draft = { supplierId: string; docNo: string; note: string; lines: Line[]; method: PayMethod; paid: string };

const draftKey = (shop: string) => `an_receipt_draft:${shop}`;
let seq = 0;
const newKey = () => `l${Date.now().toString(36)}${seq++}`;

function readDraft(shop: string): Draft | null {
  try { const s = localStorage.getItem(draftKey(shop)); return s ? (JSON.parse(s) as Draft) : null; } catch { return null; }
}
function writeDraft(shop: string, d: Draft | null) {
  try { if (d) localStorage.setItem(draftKey(shop), JSON.stringify(d)); else localStorage.removeItem(draftKey(shop)); } catch { /* private mode */ }
}

export function ReceiptDoc({ open, seed, shopId, products, contragents, balances, lastCost, onClose, onDone }: {
  open: boolean;
  seed: ReceiptSeed | null;
  shopId: string;
  products: Product[];
  contragents: Contragent[];
  balances: Record<string, number>;
  lastCost: (variantId: string) => number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const cards = useShopCards(shopId);
  const shopAccounts = useShopAccounts();

  const [supplierId, setSupplierId] = useState("");
  const [docNo, setDocNo] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [paid, setPaid] = useState(""); // empty = the whole total
  const [cardId, setCardId] = useState("");
  const [transferRef, setTransferRef] = useState("");
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Every variant the lines can be, with the words it can be found by.
  const all = useMemo(() => products
    .filter((p) => p.active !== false)
    .flatMap((p) => (p.variants ?? [])
      .filter((v) => v.id && v.active !== false)
      .map((v) => ({
        p, v,
        label: [p.brand, p.name, variantText(v)].filter(Boolean).join(" · "),
        hay: `${p.brand ?? ""} ${p.name} ${variantText(v)} ${v.sku ?? ""} ${v.barcode ?? ""}`.toLowerCase(),
      }))), [products]);
  const byId = useMemo(() => new Map(all.map((x) => [x.v.id!, x])), [all]);

  useEffect(() => {
    if (!open) return;
    setQ(""); setBusy(false); setCardId(""); setTransferRef("");
    if (seed) {
      setSupplierId(seed.supplierId ?? ""); setDocNo(""); setNote(""); setMethod("cash"); setPaid(""); setRestored(false);
      setLines(seed.lines.map((l) => ({
        key: newKey(), variantId: l.variantId, newName: l.newName, newUnit: l.newUnit ?? "pcs",
        qty: l.qty ? String(l.qty) : "", cost: l.cost ? String(l.cost) : (l.variantId ? String(lastCost(l.variantId) || "") : ""),
      })));
      return;
    }
    const d = readDraft(shopId);
    if (d) {
      setSupplierId(d.supplierId); setDocNo(d.docNo); setNote(d.note); setLines(d.lines); setMethod(d.method); setPaid(d.paid);
      setRestored(true);
    } else {
      setSupplierId(""); setDocNo(""); setNote(""); setLines([]); setMethod("cash"); setPaid(""); setRestored(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed, shopId]);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return all.filter((x) => x.hay.includes(s)).slice(0, 8);
  }, [q, all]);

  const addVariant = (v: ProductVariant) => {
    setLines((ls) => {
      const at = ls.findIndex((l) => l.variantId === v.id);
      if (at >= 0) return ls.map((l, i) => (i === at ? { ...l, qty: String((parseFloat(l.qty) || 0) + 1) } : l));
      return [...ls, { key: newKey(), variantId: v.id, newUnit: "pcs", qty: "1", cost: String(lastCost(v.id!) || num(v.unitCost) || "") }];
    });
    setQ("");
    searchRef.current?.focus();
  };
  const addNew = (name: string) => {
    setLines((ls) => [...ls, { key: newKey(), newName: name, newUnit: "pcs", qty: "1", cost: "" }]);
    setQ("");
  };
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const onScanned = (code: string) => {
    const hit = all.find((x) => x.v.barcode === code);
    if (hit) addVariant(hit.v);
    else toast(t("whx_scan_unknown"), { icon: "alert", tone: "danger" });
  };

  const lineTotal = (l: Line) => Math.round((parseFloat(l.qty) || 0) * num(l.cost));
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);
  const count = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
  const paying = !!supplierId && method !== "later";
  const paidAmount = paying ? (paid === "" ? total : Math.min(num(paid), total)) : 0;
  const owed = supplierId ? total - paidAmount : 0;
  const before = balances[supplierId] ?? 0;
  const payment: Payment = { ...blankPayment(), mode: method === "later" ? "cash" : method, cardId, transferRef };
  const payIncomplete = paidAmount > 0 && !toParts(payment, paidAmount, shopAccounts.accounts);
  const valid = lines.length > 0 && lines.every((l) => (parseFloat(l.qty) || 0) > 0 && (l.variantId || l.newName?.trim())) && !payIncomplete;

  const keepDraft = () => {
    writeDraft(shopId, { supplierId, docNo, note, lines, method, paid });
    toast(t("whx_draft_saved"), { icon: "check" });
    onClose();
  };

  const accept = async () => {
    if (busy || !valid) return;
    setBusy(true);
    const linked = contragents.find((c) => c.id === supplierId);
    // The note travels with each movement, so the ledger can say which delivery note it was.
    const reason = [docNo.trim() && `№ ${docNo.trim()}`, note.trim()].filter(Boolean).join(" · ") || "receive";
    let left = paidAmount;
    let paidSoFar = 0;
    const done: string[] = [];
    try {
      for (const l of lines) {
        const n = parseFloat(l.qty) || 0;
        const cost = num(l.cost);
        const lp = Math.min(left, lineTotal(l));
        const parts = supplierId && lp > 0 ? toParts(payment, lp, shopAccounts.accounts) ?? undefined : undefined;
        if (l.variantId) {
          await api.adjustVariantStock(l.variantId, n, reason, { contragentId: supplierId, unitCost: cost, paidAmount: supplierId ? lp : 0, parts });
        } else {
          await api.createProduct(shopId, {
            name: (l.newName ?? "").trim(), unit: l.newUnit, supplier: linked?.name ?? "", supplierId,
            paidAmount: supplierId ? lp : 0, parts, properties: [],
            variants: [{ quantityOnHand: n, reorderLevel: 0, unitCost: cost, unitPrice: 0, active: true, attributes: [] }],
          });
        }
        left -= lp; paidSoFar += lp;
        done.push(l.key);
      }
      writeDraft(shopId, null);
      toast(`${t("whx_accepted")} · ${money(total)}`, { icon: "check" });
      onDone();
      onClose();
    } catch (e) {
      // What went in stays in; the rest waits in a draft rather than being typed again.
      const rest = lines.filter((l) => !done.includes(l.key));
      setLines(rest);
      if (done.length > 0) {
        const nextPaid = paying ? String(Math.max(0, paidAmount - paidSoFar)) : paid;
        setPaid(nextPaid);
        writeDraft(shopId, { supplierId, docNo, note, lines: rest, method, paid: nextPaid });
        onDone();
        toast(t("whx_partial_saved"), { icon: "alert", tone: "danger" });
      }
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const supplierOptions = contragents.map((c) => ({
    value: c.id,
    label: (balances[c.id] ?? 0) > 0 ? `${c.name} · ${t("whx_debt")} ${money(balances[c.id])}` : c.name,
  }));
  const methods: [PayMethod, string][] = [["cash", t("whx_pay_cash")], ["card", t("whx_pay_card")], ["transfer", t("whx_pay_transfer")], ["later", t("whx_pay_later")]];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[min(860px,100vw)] p-0">
        {/* header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-4 pr-14">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[19px] font-bold tracking-[-0.02em] text-foreground">{t("whx_receipt_btn")}</h2>
              <span className="font-mono text-[12.5px] text-muted-foreground">{restored ? t("whx_draft") : shortDate(new Date().toISOString())}</span>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setScan(true)}><ScanBarcode /> {t("whx_scan_add")}</Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-background px-6 py-5">
          {restored && (
            <div className="flex items-center justify-between gap-2 rounded-[10px] bg-info-soft px-3.5 py-2 text-[13px] text-ink-2">
              {t("whx_draft_restored")}
              <button className="font-semibold text-muted-foreground hover:text-destructive"
                onClick={() => { writeDraft(shopId, null); setLines([]); setSupplierId(""); setDocNo(""); setNote(""); setPaid(""); setRestored(false); }}>
                {t("clear")}
              </button>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr]">
            <Field label={t("supplier")}>
              <SearchSelect value={supplierId} options={supplierOptions} placeholder={t("supplier")} onChange={setSupplierId} />
            </Field>
            <Field label={t("whx_doc_no")}>
              <Input value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder="NK-0000" className="font-mono" />
            </Field>
            {/* Stock is booked when it is accepted, so the date is today's — shown, not asked. */}
            <Field label={t("whx_date")}>
              <div className="flex h-10 items-center rounded-[9px] border border-input bg-card px-3 font-mono text-[14px] text-foreground">
                {shortDate(new Date().toISOString())} <span className="ml-2 font-sans text-[12px] text-muted-foreground">{t("whx_today")}</span>
              </div>
            </Field>
          </div>

          {/* lines */}
          <div className="rounded-[14px] border border-border bg-card p-4">
            <div className="hidden grid-cols-[minmax(0,1fr)_110px_140px_120px_28px] gap-3 border-b border-border pb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground md:grid">
              <span>{t("col_product_variant")}</span><span className="text-right">{t("qty")}</span>
              <span className="text-right">{t("purchase_price")}</span><span className="text-right">{t("total")}</span><span />
            </div>
            {lines.map((l) => {
              const x = l.variantId ? byId.get(l.variantId) : undefined;
              const n = parseFloat(l.qty) || 0;
              const have = x ? num(x.v.quantityOnHand) : 0;
              const last = l.variantId ? lastCost(l.variantId) : 0;
              const unit = x ? x.p.unit : l.newUnit;
              return (
                <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-x-3 gap-y-2 border-b border-border py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_110px_140px_120px_28px]">
                  <div className="min-w-0">
                    {x ? (
                      <>
                        <div className="truncate text-[14px] font-semibold text-foreground">{x.label}</div>
                        <div className="truncate text-[12px] text-muted-foreground">
                          {unit ? unitLabel(t, unit) + " · " : ""}{t("whx_stock").toLowerCase()} {fmtQty(have)} → <b className="text-success">{fmtQty(have + n)}</b>
                          {last > 0 && <> · {t("whx_last_price")} {money(last)}</>}
                        </div>
                      </>
                    ) : (
                      <>
                        <Input value={l.newName ?? ""} onChange={(e) => setLine(l.key, { newName: e.target.value })} className="h-8 font-semibold" />
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[12px] font-medium text-primary-emphasis">{t("whx_new_product")}</span>
                          <div className="w-[110px]"><UnitSelect value={l.newUnit} onChange={(u) => setLine(l.key, { newUnit: u })} /></div>
                        </div>
                      </>
                    )}
                  </div>
                  <button onClick={() => setLines((ls) => ls.filter((y) => y.key !== l.key))} aria-label={t("delete")}
                    className="grid size-7 place-items-center rounded-[7px] text-muted-foreground hover:bg-secondary hover:text-destructive md:order-last">
                    <X className="size-4" />
                  </button>
                  <div className="relative">
                    <Input value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal"
                      className="pr-10 text-right font-mono" />
                    {unit && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{unitLabel(t, unit)}</span>}
                  </div>
                  <MoneyInput value={l.cost} onChange={(v) => setLine(l.key, { cost: v })} hideHint placeholder="0" />
                  <span className="text-right font-mono text-[14px] font-semibold text-foreground">{money(lineTotal(l))}</span>
                </div>
              );
            })}

            {/* add a line */}
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("whx_add_line_ph")}
                className="border-dashed pl-9"
                onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { e.preventDefault(); addVariant(hits[0].v); } }} />
              {q.trim() && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-[300px] overflow-y-auto rounded-[12px] border border-border bg-card p-1 shadow-[var(--shadow-lg)]">
                  {hits.map((x) => (
                    <button key={x.v.id} onClick={() => addVariant(x.v)}
                      className="flex w-full items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-left hover:bg-secondary">
                      <span className="min-w-0 truncate text-[13.5px] font-medium text-foreground">{x.label}</span>
                      <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{fmtQty(x.v.quantityOnHand)}{x.p.unit ? " " + unitLabel(t, x.p.unit) : ""}</span>
                    </button>
                  ))}
                  <button onClick={() => addNew(q.trim())}
                    className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[13.5px] font-semibold text-primary-emphasis hover:bg-primary-soft">
                    <Plus className="size-4" /> {t("whx_create_new")}: «{q.trim()}»
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* payment · summary */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("whx_payment")}</span>
              {supplierId ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {methods.map(([m, lbl]) => (
                      <button key={m} onClick={() => setMethod(m)}
                        className={cn("rounded-[9px] border px-3.5 py-2 text-[13.5px] font-semibold transition-colors",
                          method === m ? "border-primary bg-primary-soft text-primary-emphasis" : "border-border text-ink-2 hover:bg-secondary")}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  {method === "card" && (
                    <Field label={t("whx_pay_card")}>
                      <SearchSelect value={cardId} placeholder={t("whx_pay_card")} onChange={setCardId}
                        options={cards.map((c) => ({ value: c.id, label: `${c.label ? c.label + " · " : ""}•••• ${c.cardNumber.slice(-4)}` }))} />
                    </Field>
                  )}
                  {method === "transfer" && (
                    <Field label={t("whx_transfer_ref")}>
                      <Input value={transferRef} onChange={(e) => setTransferRef(e.target.value)} className="font-mono" />
                    </Field>
                  )}
                  {method !== "later" && (
                    <Field label={t("paid_now")}>
                      <MoneyInput value={paid} onChange={setPaid} placeholder={money(total)} hideHint />
                    </Field>
                  )}
                </>
              ) : (
                <NoSupplierNote show />
              )}
            </div>
            <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-4 text-[14px]">
              <span className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("whx_summary")}</span>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{lines.length} {t("whx_positions")} · {fmtQty(count)}</span>
                <span className="font-mono font-semibold text-foreground">{money(total)}</span>
              </div>
              {supplierId && (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("paid_now")}</span>
                    <span className="font-mono font-semibold text-success">{paidAmount > 0 ? `−${money(paidAmount)}` : "0"}</span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-border pt-2">
                    <span className="font-bold text-foreground">{t("whx_owed")}</span>
                    <span className={cn("font-mono font-bold", owed > 0 ? "text-destructive" : "text-foreground")}>{money(owed)}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-[12.5px]">
                    <span className="text-muted-foreground">{t("whx_debt_after")}</span>
                    <span className="font-mono text-foreground">{money(before + owed)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <Field label={t("whx_note_internal")}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("whx_note_ph")} />
          </Field>
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-6 py-4">
          <p className="flex max-w-[380px] items-start gap-2 text-[12.5px] text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" /> {t("whx_receipt_info")}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy || lines.length === 0} onClick={keepDraft}>{t("whx_save_draft")}</Button>
            <Button disabled={busy || !valid} onClick={accept}>
              {busy ? <Spinner /> : <>{t("whx_accept")} · {money(total)}</>}
            </Button>
          </div>
        </div>
        <BarcodeScanner open={scan} onClose={() => setScan(false)} onDetected={onScanned} />
      </SheetContent>
    </Sheet>
  );
}
