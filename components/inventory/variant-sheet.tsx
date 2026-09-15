"use client";
// A warehouse variant's own page, after the "Ombor" redesign: what is on the shelf, what it
// cost on average, what it sells for and how fast it goes; then a delivery (Kirim), an issue
// (Chiqim) or a correction (Tuzatish) in three tabs; and the variant's ledger underneath. A
// product with several variants switches between them at the top instead of stacking every
// variant's panels into one long column.
//
// The receive panel is the one the warehouse always had — supplier, purchase price in any
// currency, what was paid now and how, and where that leaves the supplier's account. A
// correction is new: it changes the count and the stock's worth and nothing else.
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Info, Pencil, QrCode } from "lucide-react";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { FxMoneyInput } from "@/components/fx-money";
import { unitLabel, qtyUnit } from "@/components/catalog-fields";
import { DeliverySummary, NoSupplierNote } from "@/components/delivery-summary";
import { PaymentPicker, toParts, usePayment, useShopCards, useShopAccounts, useContragentAccounts } from "@/components/payment-picker";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { emptyFx, findCurrency, fxLabel, fxPayload, fxSoum, useCurrencies, type FxValue } from "@/lib/currency";
import { money, num, qty as fmtQty, shortDateTime } from "@/lib/format";
import { pickLangText, type Lang } from "@/lib/i18n";
import { stockReason } from "@/lib/system-text";
import {
  ADJUST_REASONS, adjustReasonCode, fill, isLow, marginPct, moveKind, variantText,
  type AdjustReason, type LabelItem, type MoveKind, type VariantStats,
} from "@/lib/stock";
import { cn } from "@/lib/utils";
import type { Contragent, Product, ProductVariant, PropertyDefinition, Staff, StockMovement } from "@/lib/types";

export type SheetTab = "in" | "out" | "adjust";

// Resolve a color swatch for an attribute value from the predefined catalog.
const hexOf = (defs: PropertyDefinition[], prop: string, value: string) =>
  defs.find((d) => d.name === prop && d.kind === "color")?.values?.find((x) => x.value === value)?.colorHex || undefined;

// Attributes store the canonical value; show the admin's translation for the active language.
const attrLabelOf = (defs: PropertyDefinition[], lang: Lang, prop: string, value: string) => {
  const v = defs.find((d) => d.name === prop)?.values?.find((x) => x.value === value);
  return v ? pickLangText(lang, v.valueUzLatn, v.valueUzCyrl, v.valueRu, value) : value;
};

export function VariantSheet({
  product, variantId, tab: initialTab, definitions, contragents, balances, staff, brandLogos, templateImages, stats,
  onClose, onEdit, onDone, onArchive, onLabel,
}: {
  product: Product | null;
  variantId?: string;
  tab?: SheetTab;
  definitions: PropertyDefinition[];
  contragents: Contragent[];
  balances: Record<string, number>;
  staff: Staff[];
  brandLogos: Record<string, string>;
  templateImages: Record<string, string>;
  stats: Map<string, VariantStats>;
  onClose: () => void;
  onEdit: (p: Product) => void;
  onDone: () => void;
  onArchive: (p: Product) => void;
  onLabel: (items: LabelItem[]) => void;
}) {
  const { t, lang } = useLang();
  const [vid, setVid] = useState<string | undefined>();
  const [tab, setTab] = useState<SheetTab>("in");
  // Bumped after every save, so the ledger underneath shows the movement just made.
  const [reload, setReload] = useState(0);
  const productId = product?.id;
  useEffect(() => {
    if (!productId) return;
    setVid(variantId);
    setTab(initialTab ?? "in");
  }, [productId, variantId, initialTab]);

  const variants = product?.variants ?? [];
  const v = variants.find((x) => x.id === vid) ?? variants[0];
  const done = () => { setReload((r) => r + 1); onDone(); };

  const thumb = (product?.templateId && templateImages[product.templateId]) || (product?.brand ? brandLogos[product.brand] : undefined);
  const label = (x: ProductVariant) => (x.attributes ?? []).length
    ? (x.attributes ?? []).map((a) => attrLabelOf(definitions, lang, a.property, a.value)).join(" · ")
    : (variantText(x) || x.sku || t("variant"));

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[780px]">
        <DialogHeader>
          <div className="flex min-w-0 items-center gap-3 pr-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumb && <img src={thumb} alt="" aria-hidden className="size-7 shrink-0 rounded-[6px] object-contain" />}
            <DialogTitle className="min-w-0 flex-1 truncate">
              {product ? `${product.brand ? product.brand + " · " : ""}${product.name}` : ""}
              {v && <span className="ml-2 text-[14px] font-medium text-muted-foreground">{label(v)}</span>}
            </DialogTitle>
            {product && <Button variant="secondary" size="sm" title={t("whx_edit")} onClick={() => onEdit(product)}><Pencil /><span className="max-sm:hidden">{t("whx_edit")}</span></Button>}
            {product && v && (
              <Button variant="secondary" size="sm" onClick={() => onLabel([{
                name: `${product.brand ? product.brand + " " : ""}${product.name}`, variant: label(v),
                sku: v.sku ?? "", barcode: v.barcode, price: num(v.unitPrice),
              }])} title={t("whx_label")}><QrCode /><span className="max-sm:hidden">{t("whx_label")}</span></Button>
            )}
          </div>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4 overflow-y-auto py-1">
          {product && variants.length === 0 && <p className="text-[13px] text-muted-foreground">{t("no_variants")}</p>}

          {/* Several variants: pick one; everything below is about the one picked. */}
          {variants.length > 1 && (
            <div className="flex shrink-0 flex-wrap gap-1.5">
              {variants.map((x) => {
                const on = x.id === v?.id;
                return (
                  <button key={x.id} onClick={() => setVid(x.id)}
                    className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                      on ? "border-primary bg-primary-soft text-primary-emphasis" : "border-border text-ink-2 hover:bg-secondary")}>
                    {(x.attributes ?? []).map((a) => {
                      const hex = hexOf(definitions, a.property, a.value);
                      return hex ? <span key={a.property} className="inline-block size-2.5 rounded-full border border-black/10" style={{ background: hex }} /> : null;
                    })}
                    {label(x)}
                    <span className={cn("font-mono text-[11.5px]", isLow(x) ? "text-warning" : "text-muted-foreground")}>{fmtQty(x.quantityOnHand)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {product && v && (
            <>
              <Figures v={v} unit={product.unit} st={v.id ? stats.get(v.id) : undefined} />

              {(v.sku || v.barcode) && (
                <div className="-mt-1 flex shrink-0 items-center gap-3 text-[12px] text-muted-foreground">
                  {v.sku && <span className="shrink-0 rounded-[6px] bg-white p-0.5"><QRCodeSVG value={v.sku} size={34} /></span>}
                  <span className="font-mono">
                    {v.sku && <>{t("art")} {v.sku}</>}
                    {v.barcode && <>{v.sku ? " · " : ""}{v.barcode}</>}
                  </span>
                </div>
              )}

              <div className="inline-flex w-full shrink-0 gap-0.5 rounded-[10px] bg-secondary p-1">
                {([["in", t("receive")], ["out", t("consume")], ["adjust", t("whx_adjust_btn")]] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
                    className={cn("min-h-9 flex-1 rounded-[8px] text-[13.5px] font-semibold transition-colors touch:min-h-11",
                      tab === k ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground hover:text-foreground")}>
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="shrink-0 rounded-[14px] border border-border p-4">
                {tab === "adjust"
                  ? <CountPanel key={`c${v.id}`} variant={v} unit={product.unit} onDone={done} />
                  : <AdjustPanel key={`${tab}${v.id}`} mode={tab === "in" ? "receive" : "consume"} variant={v} unit={product.unit} brand={product.brand}
                      contragents={contragents} balances={balances} onDone={done} />}
              </div>

              {v.id && <HistoryCard key={`h${v.id}`} variantId={v.id} unit={product.unit} contragents={contragents} staff={staff} reload={reload} />}
            </>
          )}
        </DialogBody>

        <DialogFooter className="items-center justify-between">
          {product ? (
            <button onClick={() => onArchive(product)} className="text-[13px] font-semibold text-muted-foreground hover:text-destructive">
              {product.active === false ? t("whx_unarchive") : t("whx_archive_do")}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>{t("close")}</Button>
            {product?.active !== false && <Button onClick={() => setTab("in")}>{t("whx_receive_do")}</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The four figures across the top: what is left, what it cost, what it sells for, how fast it goes.
function Figures({ v, unit, st }: { v: ProductVariant; unit?: string; st?: VariantStats }) {
  const { t } = useLang();
  const q = num(v.quantityOnHand), min = num(v.reorderLevel), cost = num(v.unitCost), price = num(v.unitPrice);
  const out = q <= 0, low = isLow(v);
  const m = marginPct(cost, price);
  const lastCost = st?.lastIn ? num(st.lastIn.unitCost) : 0;
  const perDay = st?.perDay ?? 0;
  const cell = "flex min-w-0 flex-col gap-1 px-4 py-3";
  const lbl = "text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground";
  const big = "truncate font-mono text-[21px] font-bold leading-tight tracking-[-0.02em]";
  return (
    <div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-[14px] border border-border md:grid-cols-4 md:divide-x md:divide-border">
      <div className={cell}>
        <span className={lbl}>{t("whx_stock")}</span>
        <span className={cn(big, out ? "text-destructive" : low ? "text-warning" : "text-foreground")}>{qtyUnit(t, q, unit)}</span>
        <span className="truncate text-[12px] text-muted-foreground">
          {t("min_label")} {fmtQty(min)} · <span className={cn("font-semibold", out ? "text-destructive" : low ? "text-warning" : "text-success")}>
            {out ? t("whx_out") : low ? t("low_stock") : t("whx_ok")}
          </span>
        </span>
      </div>
      <div className={cell}>
        <span className={lbl}>{t("whx_avg_cost")}</span>
        <span className={cn(big, "text-foreground")}>{cost > 0 ? money(cost) : "—"}</span>
        <span className="truncate text-[12px] text-muted-foreground">{lastCost > 0 ? `${t("whx_last_in")} ${money(lastCost)}` : " "}</span>
      </div>
      <div className={cell}>
        <span className={lbl}>{t("sell_price")}</span>
        <span className={cn(big, "text-foreground")}>{price > 0 ? money(price) : "—"}</span>
        <span className={cn("truncate text-[12px] font-semibold", m === null ? "text-muted-foreground" : m < 0 ? "text-destructive" : "text-success")}>
          {m === null ? " " : `${t("whx_margin_word")} ${m > 0 ? "+" : ""}${m}%`}
        </span>
      </div>
      <div className={cell}>
        <span className={lbl}>{t("whx_use")}</span>
        <span className={cn(big, "text-foreground")}>
          {perDay > 0 ? <>{fmtQty(Math.round(perDay * 10) / 10)} <span className="text-[13px] font-medium text-muted-foreground">/ {t("whx_per_day")}</span></> : "—"}
        </span>
        <span className={cn("truncate text-[12px]", st?.daysLeft !== null && st?.daysLeft !== undefined && st.daysLeft < 7 ? "font-semibold text-warning" : "text-muted-foreground")}>
          {st?.daysLeft !== null && st?.daysLeft !== undefined ? fill(t("whx_days_left"), { n: st.daysLeft }) : t("whx_no_use")}
        </span>
      </div>
    </div>
  );
}

// ── Tuzatish: a count, a breakage, a loss — the shelf corrected, and nothing else ──
function CountPanel({ variant, unit, onDone }: { variant: ProductVariant; unit?: string; onDone: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [reason, setReason] = useState<AdjustReason>("count");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const sys = num(variant.quantityOnHand);
  const has = counted.trim() !== "";
  const diff = has ? Math.round(((parseFloat(counted) || 0) - sys) * 1000) / 1000 : 0;
  const worth = Math.round(diff * num(variant.unitCost));
  const signed = (n: number) => `${n > 0 ? "+" : ""}${fmtQty(n)}`;

  const save = async () => {
    if (!has || diff === 0 || busy || !variant.id) return;
    setBusy(true);
    try {
      await api.adjustVariantStock(variant.id, diff, adjustReasonCode(reason, note));
      toast(t("save"), { icon: "check" });
      setCounted(""); setNote("");
      onDone();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  const u = unit ? unitLabel(t, unit) : "";
  return (
    <div className="flex flex-col gap-3">
      <Field label={t("whx_reason")}>
        <div className="flex flex-wrap gap-1.5">
          {ADJUST_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)}
              className={cn("rounded-[9px] border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                reason === r ? "border-primary bg-primary-soft text-primary-emphasis" : "border-border text-ink-2 hover:bg-secondary")}>
              {t(`whx_adj_${r}`)}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-3 gap-2.5">
        <Field label={t("whx_in_system")}>
          <div className="flex h-10 items-center justify-between rounded-[9px] bg-secondary px-3 font-mono text-[14px] text-foreground">
            {fmtQty(sys)} <span className="text-[12px] text-muted-foreground">{u}</span>
          </div>
        </Field>
        <Field label={t("whx_counted")}>
          <div className="relative">
            <Input value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal"
              placeholder={fmtQty(sys)} className="pr-12 font-mono" autoFocus />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">{u}</span>
          </div>
        </Field>
        <Field label={t("whx_diff")}>
          <div className={cn("flex h-10 items-center justify-between gap-2 rounded-[9px] bg-secondary px-3 font-mono text-[14px] font-bold",
            diff < 0 ? "text-destructive" : diff > 0 ? "text-success" : "text-muted-foreground")}>
            {has ? signed(diff) : "—"}
            {has && worth !== 0 && <span className="truncate text-[11.5px] font-medium">{signed(worth).replace(fmtQty(worth), money(Math.abs(worth)))} {t("soum")}</span>}
          </div>
        </Field>
      </div>
      <Field label={t("notes")}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("whx_adj_note_ph")} />
      </Field>
      <div className="flex items-start gap-2.5 rounded-[10px] bg-info-soft px-3.5 py-2.5 text-[12.5px] text-ink-2">
        <Info className="mt-0.5 size-4 shrink-0 text-info" /> {t("whx_adj_info")}
      </div>
      <div className="flex justify-end">
        <Button disabled={busy || !has || diff === 0} onClick={save}>
          {busy ? <Spinner /> : <>{t("whx_adj_save")}{has && diff !== 0 && <> · {signed(diff)} {u}</>}</>}
        </Button>
      </div>
    </div>
  );
}

// AdjustPanel receives (Kirim) or issues (Chiqim) stock for one variant. On receive it also
// records which supplier delivered, the purchase price per unit, and what was paid now and how:
// a receipt is a purchase on credit, and whatever is not handed over becomes a debt on the
// supplier's account — so the panel says where this delivery leaves that account.
function AdjustPanel({
  mode, variant, unit, brand, contragents, balances, onDone,
}: {
  mode: "receive" | "consume";
  variant: ProductVariant;
  unit?: string;
  brand?: string;
  contragents: Contragent[];
  balances: Record<string, number>;
  onDone: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [supplierId, setSupplierId] = useState("");
  // Both amounts carry the currency they were agreed in: a delivery priced in dollars and
  // settled partly in so'm is an ordinary Tuesday here.
  const [unitCost, setUnitCost] = useState<FxValue>(() => emptyFx());
  // How much of the delivery was handed over now. Empty is the honest default: the shop took
  // the goods and owes for them until it says otherwise.
  const [paidNow, setPaidNow] = useState<FxValue>(() => emptyFx());
  const { payment, setPayment } = usePayment();
  const { session } = useAuth();
  const cards = useShopCards(session?.staff.shopId);
  const shopAccounts = useShopAccounts();
  const theirAccounts = useContragentAccounts(supplierId);
  const [busy, setBusy] = useState(false);
  const currencies = useCurrencies();

  // Suppliers of this product's brand, and the brand-agnostic ones.
  const suppliers = useMemo(() => {
    const b = (brand ?? "").trim();
    if (!b) return contragents;
    return contragents.filter((c) => c.id === supplierId || !c.brand || c.brand === b);
  }, [contragents, brand, supplierId]);

  const receiving = mode === "receive";
  const qty = parseFloat(amount) || 0;
  const cost = fxSoum(unitCost, findCurrency(currencies, unitCost.currency));
  const total = Math.round(qty * cost);
  const paid = Math.min(fxSoum(paidNow, findCurrency(currencies, paidNow.currency)), total);
  const parts = paid > 0 ? toParts(payment, paid, shopAccounts.accounts) : null;
  const payIncomplete = paid > 0 && !parts;

  const save = async () => {
    if (qty <= 0 || busy || !variant.id || payIncomplete) return;
    setBusy(true);
    try {
      await api.adjustVariantStock(
        variant.id,
        receiving ? qty : -qty,
        reason.trim() || mode,
        receiving ? {
          contragentId: supplierId, unitCost: cost, paidAmount: paid,
          parts: parts ?? undefined,
          fxUnitCost: fxPayload(unitCost, findCurrency(currencies, unitCost.currency)),
          // Stamped only when the amount was not capped at what the delivery was worth.
          fxPaidAmount: paid === fxSoum(paidNow, findCurrency(currencies, paidNow.currency))
            ? fxPayload(paidNow, findCurrency(currencies, paidNow.currency))
            : undefined,
        } : undefined,
      );
      toast(t("save"), { icon: "check" });
      setAmount(""); setReason(""); setPaidNow(emptyFx());
      onDone();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("qty") + (unit ? ` (${unitLabel(t, unit)})` : "")}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0" className="font-mono" />
        </Field>
        <Field label={t("notes")}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      {receiving && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("supplier")}>
            <SearchSelect value={supplierId} options={suppliers.map((c) => ({ value: c.id, label: c.name }))} placeholder={t("supplier")} onChange={setSupplierId} />
          </Field>
          <Field label={t("purchase_price") + (unit ? ` (${unitLabel(t, unit)})` : "")}>
            <FxMoneyInput value={unitCost} onChange={setUnitCost} currencies={currencies} placeholder="0" hideHint />
          </Field>
        </div>
      )}
      {receiving && supplierId && (
        <Field label={t("paid_now")}>
          <FxMoneyInput value={paidNow} onChange={setPaidNow} currencies={currencies} placeholder="0" hideHint />
        </Field>
      )}
      {receiving && supplierId && paid > 0 && (
        <Field label={t("payment_method")}>
          <PaymentPicker value={payment} onChange={setPayment} total={paid} cards={cards} disabled={busy}
            accounts={shopAccounts.accounts}
            payee={{ contragentId: supplierId, accounts: theirAccounts.accounts }}
            onAccountsChanged={() => { shopAccounts.reload(); theirAccounts.reload(); }} />
        </Field>
      )}
      <NoSupplierNote show={receiving && total > 0 && !supplierId} />
      {receiving && <DeliverySummary supplierId={supplierId} total={total} paid={paid} balance={balances[supplierId] ?? 0} />}
      <div className="flex justify-end">
        <Button disabled={busy || payIncomplete || qty <= 0} onClick={save}>
          {busy ? <Spinner /> : receiving ? t("whx_receive_do") : t("whx_issue_do")}
        </Button>
      </div>
    </div>
  );
}

// ── the ledger ──
type HistFilter = "all" | "in" | "out" | "order" | "adjust";
const TONE: Record<MoveKind, "ok" | "danger" | "info" | "warn" | "neutral"> = {
  in: "ok", manual: "danger", order: "info", sale: "info", adjust: "warn",
};

function HistoryCard({ variantId, unit, contragents, staff, reload }: {
  variantId: string; unit?: string; contragents: Contragent[]; staff: Staff[]; reload: number;
}) {
  const { t, lang } = useLang();
  const [items, setItems] = useState<StockMovement[] | null>(null);
  const [filter, setFilter] = useState<HistFilter>("all");
  const currencies = useCurrencies();

  useEffect(() => {
    let alive = true;
    api.listStockMovements(variantId).then((m) => { if (alive) setItems(m); }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [variantId, reload]);

  const kindLabel = (k: MoveKind) => ({
    in: t("receive"), manual: t("consume"), order: t("whx_kind_order"), sale: t("reason_sale"), adjust: t("whx_adjust_btn"),
  })[k];
  // A sale has no page of its own, so its number is shown without a link.
  const doc = (m: StockMovement) => (m.sourceKind === "work_order" && m.sourceId ? `/work-orders/${m.sourceId}` : null);
  const who = (id?: string) => staff.find((s) => s.id === id)?.name;
  const supplierName = (id?: string) => contragents.find((c) => c.id === id)?.name;

  const shown = (items ?? []).filter((m) => {
    const k = moveKind(m);
    return filter === "all" || (filter === "in" && k === "in") || (filter === "out" && (k === "manual" || k === "sale"))
      || (filter === "order" && k === "order") || (filter === "adjust" && k === "adjust");
  });

  return (
    <div className="shrink-0 overflow-hidden rounded-[14px] border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="text-[14.5px] font-bold text-foreground">{t("history")}</span>
        <div className="flex flex-wrap gap-0.5">
          {([["all", t("all")], ["in", t("receive")], ["out", t("consume")], ["order", t("whx_orders_f")], ["adjust", t("whx_adjust_btn")]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={cn("rounded-[7px] px-2.5 py-1 text-[12.5px] font-semibold transition-colors",
                filter === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
      </div>
      {items === null && <div className="flex justify-center py-5"><Spinner /></div>}
      {items !== null && shown.length === 0 && <p className="px-4 py-4 text-[13px] text-muted-foreground">{t("no_movements")}</p>}
      <div className="flex flex-col divide-y divide-border">
        {shown.map((m) => {
          const k = moveKind(m);
          const income = m.delta >= 0;
          const supplier = supplierName(m.contragentId);
          const cost = num(m.unitCost);
          const reasonText = stockReason(lang, m.reason, !m.sourceNo);
          return (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <Badge tone={TONE[k]} className="w-[88px] shrink-0 justify-center">{kindLabel(k)}</Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold text-foreground">
                  {m.sourceNo ? (doc(m)
                    ? <Link href={doc(m)!} className="font-mono text-primary-emphasis hover:underline">{m.sourceNo}</Link>
                    : <span className="font-mono">{m.sourceNo}</span>) : (supplier || reasonText || kindLabel(k))}
                </div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {[who(m.staffId), m.sourceNo || supplier ? reasonText : "", supplier && m.sourceNo ? supplier : "",
                    income && cost > 0 ? `${money(cost)}${unit ? "/" + unitLabel(t, unit) : ""}` : "",
                  ].filter(Boolean).join(" · ")}
                  {income && m.fxUnitCost?.currency && <> · <span className="font-mono font-semibold text-foreground">{fxLabel(m.fxUnitCost, currencies)}</span></>}
                </div>
              </div>
              <span className={cn("shrink-0 font-mono text-[13px] font-bold", k === "adjust" ? "text-warning" : income ? "text-success" : "text-destructive")}>
                {income ? "+" : ""}{fmtQty(m.delta)} → {fmtQty(m.balanceAfter)}
              </span>
              <span className="hidden shrink-0 font-mono text-[12px] text-muted-foreground sm:inline">{shortDateTime(m.createdAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
