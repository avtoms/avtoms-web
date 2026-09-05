"use client";
// Stocking a product from the super admin's catalogue, in three taps and one form.
//
// The long way round is still there — ProductForm builds a product from nothing, and a shop
// selling something nobody has catalogued needs it. But most of what an auto shop stocks is
// the same oil and the same filters every other shop stocks, and typing that in by hand means
// naming it, spelling the brand the same way twice, choosing properties, picking their values
// and generating a grid, every time, per shop.
//
// So this asks for the two things a catalogue cannot know and nothing else:
//
//   category → product → tick the variants you carry, type a count and a price.
//
// Everything else — name, translations, brand, unit, properties, which combinations exist —
// is already decided. Saving goes through the ordinary CreateProduct: the server folds a save
// into an existing product of the same name and brand, so re-stocking from the catalogue
// restocks what is there rather than growing a second copy of it, and the supplier's account
// is settled exactly as it is on every other screen that brings stock in.
import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Package, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Badge } from "@/components/ui-kit/badge";
import { Spinner, Switch } from "@/components/ui-kit/misc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { MoneyInput, unitLabel } from "@/components/catalog-fields";
import { CurrencyPicker } from "@/components/fx-money";
import { genSku } from "@/components/product-form";
import { DeliverySummary, NoSupplierNote } from "@/components/delivery-summary";
import {
  PaymentPicker, toParts, usePayment, useShopCards, useShopAccounts, useContragentAccounts,
} from "@/components/payment-picker";
import {
  BASE_CURRENCY, effectiveRate, findCurrency, fxPayload, fxSoum, isForeign, rateToInput,
  useCurrencies, type FxValue,
} from "@/lib/currency";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError, type ProductInput } from "@/lib/api";
import { money, num } from "@/lib/format";
import { pickLangText } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type {
  CatalogTerm, Contragent, Product, ProductTemplate, ProductTemplateVariant, PropertyDefinition,
} from "@/lib/types";

// An order-independent signature of a combination, matching the rule the server folds
// variants by — so "already on the shelf" here means the same thing it will mean on save.
const sigOf = (attrs: { property: string; value: string }[]) =>
  attrs.map((a) => `${a.property}${a.value}`).sort().join("");

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// A row in the variant step: ticked or not, plus what the shop is putting on the shelf.
//
// reorderTouched separates "the threshold the form guessed" from "the threshold somebody chose",
// so the guess can keep following the count without ever overwriting a real decision.
type Row = { qty: string; cost: string; price: string; reorder: string; reorderTouched: boolean };
const emptyRow = (): Row => ({ qty: "", cost: "", price: "", reorder: "", reorderTouched: false });
const dec = (v: string) => v.replace(/[^\d.]/g, "");

// A shop that has not thought about a reorder threshold still wants warning before the shelf is
// empty. Leaving it at zero does not do that: low stock is `quantity <= threshold`, so zero only
// fires once the product has actually run out, which is too late to order more. A fifth of what
// is going on the shelf is the opening guess — shown in the field, not applied behind their back.
const suggestReorder = (qty: string) => {
  const n = parseFloat(qty) || 0;
  return n > 0 ? String(Math.max(1, Math.round(n * 0.2))) : "";
};

export function TemplatePicker({
  open, shopId, templates, products, definitions, brands, contragents, onContragentsChange, onClose, onSaved, onManual,
}: {
  open: boolean;
  shopId: string;
  templates: ProductTemplate[];
  products: Product[];              // what the shop already has, to say what is already stocked
  definitions: PropertyDefinition[];
  brands: CatalogTerm[];
  contragents: Contragent[];
  onContragentsChange: () => void;
  onClose: () => void;
  onSaved: () => void;
  onManual: () => void;   // close this and open the hand-built form instead
}) {
  const { t, lang } = useLang();
  const { toast } = useToast();

  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ProductTemplate | null>(null);

  useEffect(() => {
    if (!open) { setCategory(""); setQuery(""); setPicked(null); }
  }, [open]);

  const label = (tpl: ProductTemplate) => pickLangText(lang, tpl.nameUzLatn, tpl.nameUzCyrl, tpl.nameRu, tpl.name);
  const brandLogo = (name?: string) => (name ? brands.find((b) => b.name === name)?.logoUrl : undefined);

  // The product a save would land on, by the server's own rule: same shop, same name, same
  // brand. Knowing it here is what lets the screen say "you already carry this" and prefill
  // the shop's own prices instead of the platform's suggestions.
  const existingFor = (tpl: ProductTemplate) =>
    products.find((p) => p.templateId === tpl.id) ??
    products.find((p) => sameName(p.name, tpl.name) && (p.brand ?? "") === (tpl.brand ?? ""));

  const categories = useMemo(() => {
    const m = new Map<string, { name: string; count: number; image?: string }>();
    for (const tpl of templates) {
      const key = tpl.category || "";
      const at = m.get(key);
      if (at) { at.count++; if (!at.image && tpl.imageUrl) at.image = tpl.imageUrl; }
      else m.set(key, { name: key, count: 1, image: tpl.imageUrl || undefined });
    }
    return [...m.values()].sort((a, b) => (a.name === "" ? 1 : b.name === "" ? -1 : a.name.localeCompare(b.name)));
  }, [templates]);

  // A search reaches across the whole catalogue, not just the category in view: somebody who
  // knows what they are looking for should not have to guess which shelf it was filed under.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inCategory = q ? templates : templates.filter((tpl) => (tpl.category || "") === category);
    if (!q) return inCategory;
    return inCategory.filter((tpl) =>
      (label(tpl) + " " + tpl.name + " " + (tpl.brand ?? "") + " " + (tpl.category ?? "")).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, category, query, lang]);

  const step: 1 | 2 | 3 = picked ? 3 : (category || query.trim()) ? 2 : 1;
  const back = () => {
    if (step === 3) setPicked(null);
    else { setCategory(""); setQuery(""); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            {step > 1 && (
              <button type="button" onClick={back} aria-label={t("back")}
                className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-secondary text-muted-foreground hover:text-foreground">
                <ArrowLeft className="size-4" />
              </button>
            )}
            <span className="truncate">
              {step === 3 && picked ? label(picked) : step === 2 && category ? category : t("tpl_add_from_catalog")}
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto py-1">
          {templates.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-center text-[13px] text-muted-foreground">{t("tpl_empty_catalog")}</p>
              <Button onClick={onManual}><Plus /> {t("add_part")}</Button>
            </div>
          )}

          {/* One search box serves both browsing steps: typing in it is itself the way past
              the category grid, so looking for a known product is never three taps. */}
          {step < 3 && templates.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9"
                placeholder={t("tpl_search_placeholder")} />
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
              {categories.map((c) => (
                <button key={c.name} type="button" onClick={() => setCategory(c.name)}
                  className="flex items-center gap-2.5 rounded-[12px] border border-border bg-card p-2.5 text-left transition-colors hover:border-primary hover:bg-secondary/50">
                  <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-secondary">
                    {c.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.image} alt="" className="size-full object-contain p-0.5" />
                      : <Package className="size-[18px] text-muted-foreground" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">
                      {c.name || t("tpl_uncategorised")}
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground">{c.count} {t("a_count")}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
              {shown.length === 0 && <p className="text-[13px] text-muted-foreground">{t("empty")}</p>}
              {shown.map((tpl) => {
                const owned = existingFor(tpl);
                const logo = brandLogo(tpl.brand);
                return (
                  <button key={tpl.id} type="button" onClick={() => setPicked(tpl)}
                    className="flex flex-col gap-1.5 rounded-[12px] border border-border bg-card p-2.5 text-left transition-colors hover:border-primary hover:bg-secondary/40">
                    <span className="grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-[9px] bg-secondary/60">
                      {tpl.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={tpl.imageUrl} alt="" className="size-full object-contain p-1.5" />
                        : logo
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={logo} alt="" className="max-h-[60%] max-w-[70%] object-contain opacity-70" />
                          : <Package className="size-6 text-muted-foreground" />}
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-1">
                      {tpl.brand && <Badge tone="info">{tpl.brand}</Badge>}
                      {owned && <Badge tone="ok"><Check className="size-3" /> {t("tpl_in_warehouse")}</Badge>}
                    </span>
                    <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">{label(tpl)}</span>
                    <span className="text-[11.5px] text-muted-foreground">
                      {(tpl.variants ?? []).length} {t("variants").toLowerCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 3 && picked && (
            <StockStep
              key={picked.id}
              template={picked}
              existing={existingFor(picked)}
              shopId={shopId}
              definitions={definitions}
              contragents={contragents}
              onContragentsChange={onContragentsChange}
              onSaved={() => { onClose(); onSaved(); }}
              onError={(m) => toast(m, { icon: "alert", tone: "danger" })}
              onOk={() => toast(t("save"), { icon: "check" })}
            />
          )}
        </DialogBody>
        {step < 3 && templates.length > 0 && (
          <DialogFooter className="justify-between">
            {/* Not a second button competing at the top of the warehouse screen, but the answer
                to "the catalogue hasn't got my product" offered at the moment that is discovered. */}
            <Button variant="ghost" onClick={onManual}>{t("add_part")}</Button>
            <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// StockStep is the only form in the flow: which combinations this shop carries, and at what.
//
// Split out so that picking a different product resets it wholesale (see the `key` above) —
// carrying a half-typed price from one product to another would be a quiet way to misprice
// something.
function StockStep({
  template, existing, shopId, definitions, contragents, onContragentsChange, onSaved, onError, onOk,
}: {
  template: ProductTemplate;
  existing?: Product;
  shopId: string;
  definitions: PropertyDefinition[];
  contragents: Contragent[];
  onContragentsChange: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onOk: () => void;
}) {
  const { t, tp, lang } = useLang();
  const currencies = useCurrencies();

  // One currency for the whole save rather than one per amount, as the hand-built form has.
  // This is a single product arriving in a single delivery from a single supplier: the case
  // the per-amount picker exists for — a price list holding a filter bought in dollars next
  // to a gasket bought in so'm — cannot arise here.
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  const [rate, setRate] = useState("");
  const cur = findCurrency(currencies, currency);
  const foreign = isForeign(currency);
  const fx = (typed: string): FxValue => ({ currency, typed, rate });
  const soum = (typed: string) => fxSoum(fx(typed), cur);

  const variants = template.variants ?? [];
  // What the shop already carries of this product, by combination, so a row can say "12 on
  // the shelf" and offer the price the shop set rather than the one the platform suggested.
  const already = useMemo(() => {
    const m = new Map<string, { qty: number; price: number }>();
    for (const v of existing?.variants ?? []) {
      m.set(sigOf(v.attributes ?? []), { qty: num(v.quantityOnHand), price: num(v.unitPrice) });
    }
    return m;
  }, [existing]);

  const [rows, setRows] = useState<Record<string, Row>>({});
  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyRow()), ...patch } }));

  // How a freshly ticked row starts. One function rather than a copy in `toggle` and another in
  // `toggleAll`, because two copies of a prefill rule drift apart and then the whole-grid button
  // quietly does something the single tick does not.
  //
  // It fills the price only from what this shop already charges for the combination. The
  // platform's suggested price deliberately does NOT land in the field: a number sitting in an
  // input is a number that ships by inaction, and that is the platform setting a shop's retail
  // price by accident. It is offered as one tap instead — see the sell-price hint below.
  const startRow = (v: ProductTemplateVariant): Row => {
    const mine = already.get(sigOf(v.attributes ?? []));
    return { ...emptyRow(), price: !foreign && mine?.price ? String(mine.price) : "" };
  };

  // Untick clears the row outright — a hidden number that comes back when you change your mind
  // twice is a trap.
  const toggle = (v: ProductTemplateVariant, key: string) => {
    setRows((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: startRow(v) };
    });
  };

  const keyOf = (v: ProductTemplateVariant, i: number) => v.id || `i${i}`;
  // Every ticked row paired with what was typed into it, in catalogue order. One list drives
  // the totals, the button and the save, so the three cannot disagree.
  const picks = variants
    .map((v, i) => ({ v, row: rows[keyOf(v, i)] }))
    .filter((x): x is { v: ProductTemplateVariant; row: Row } => !!x.row);
  const allOn = variants.length > 0 && picks.length === variants.length;
  const toggleAll = () => {
    if (allOn) { setRows({}); return; }
    const next: Record<string, Row> = { ...rows };
    variants.forEach((v, i) => {
      const key = keyOf(v, i);
      if (next[key]) return;
      next[key] = startRow(v);
    });
    setRows(next);
  };

  // Delivery, settled exactly as the receive panel and the hand-built form settle one.
  const [supplierId, setSupplierId] = useState("");
  const [skipDebt, setSkipDebt] = useState(false);
  const [paidNow, setPaidNow] = useState("");
  const { payment, setPayment } = usePayment();
  const cards = useShopCards(shopId);
  const shopAccounts = useShopAccounts();
  const theirAccounts = useContragentAccounts(supplierId);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.contragentBalances(shopId).then((r) => {
      const m: Record<string, number> = {};
      for (const b of r.balances ?? []) m[b.contragentId] = num(b.balance);
      setBalances(m);
    }).catch(() => {});
  }, [shopId]);

  // Narrow suppliers to the product's brand, keeping the brand-agnostic ones — the same rule
  // the hand-built form and the receive panel use.
  const suppliers = useMemo(() => {
    const b = (template.brand ?? "").trim();
    if (!b) return contragents;
    return contragents.filter((c) => c.id === supplierId || !c.brand || c.brand === b);
  }, [contragents, template.brand, supplierId]);

  const arriving = picks.reduce(
    (sum, { row }) => sum + Math.round((parseFloat(row.qty) || 0) * soum(row.cost)), 0);
  const paidTyped = soum(paidNow);
  const paidAmount = Math.min(paidTyped, arriving);
  const parts = paidAmount > 0 ? toParts(payment, paidAmount, shopAccounts.accounts) : null;
  const payIncomplete = paidAmount > 0 && !skipDebt && !!supplierId && !parts;

  const attrLabel = (prop: string, value: string) => {
    const v = definitions.find((d) => d.name === prop)?.values?.find((x) => x.value === value);
    return v ? pickLangText(lang, v.valueUzLatn, v.valueUzCyrl, v.valueRu, value) : value;
  };
  const hexOf = (prop: string, value: string) =>
    definitions.find((d) => d.name === prop && d.kind === "color")?.values?.find((x) => x.value === value)?.colorHex;

  const save = async () => {
    if (busy || picks.length === 0 || payIncomplete) return;
    // The product's properties are what the shop actually stocks, not everything the
    // catalogue offers: a shop carrying only 4 L bottles should not have a 1 L option
    // hanging off its own product for the rest of time.
    const values = new Map<string, string[]>();
    for (const { v } of picks) {
      for (const a of v.attributes ?? []) {
        const at = values.get(a.property);
        if (at) { if (!at.includes(a.value)) at.push(a.value); }
        else values.set(a.property, [a.value]);
      }
    }
    const order = (template.properties ?? []).map((p) => p.name);
    const properties = [...values.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([name, vals]) => ({ name, values: vals }));

    const linked = contragents.find((c) => c.id === supplierId);
    const payload: ProductInput = {
      // The canonical name, never the translated label: the server folds a save into an
      // existing product by name, and saving "Масляный фильтр" today after "Moy filtri"
      // yesterday would quietly make a second product out of one.
      name: template.name,
      description: template.description ?? "",
      category: template.category ?? "",
      unit: template.unit || "pcs",
      brand: template.brand ?? "",
      supplier: linked?.name ?? "",
      supplierId,
      templateId: template.id,
      properties,
      paidAmount,
      parts: parts ?? undefined,
      // Only stamped when the amount was not capped at what the delivery was worth: a stamp
      // saying "$200" beside a so'm figure that is no longer $200 would contradict it.
      fxPaidAmount: paidAmount === paidTyped ? fxPayload(fx(paidNow), cur) : undefined,
      skipDebt,
      variants: picks.map(({ v, row }) => ({
          sku: v.sku?.trim() || genSku(),
          quantityOnHand: parseFloat(row.qty) || 0,
          reorderLevel: parseFloat(row.reorder) || 0,
          unitCost: soum(row.cost),
          unitPrice: soum(row.price),
          fxUnitCost: fxPayload(fx(row.cost), cur),
          fxUnitPrice: fxPayload(fx(row.price), cur),
          active: true,
          attributes: (v.attributes ?? []).map((a) => ({ property: a.property, value: a.value })),
      })),
    };
    setBusy(true);
    try {
      await api.createProduct(shopId, payload);
      onOk();
      onSaved();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const unitSuffix = template.unit ? ` (${unitLabel(t, template.unit)})` : "";
  const published = rateToInput(effectiveRate(cur));

  return (
    <div className="flex flex-col gap-3">
      {existing && (
        <p className="rounded-[9px] bg-success-soft px-3 py-2 text-[12.5px] text-foreground">
          {t("tpl_already_note")}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("tpl_pick_variants")}
        </span>
        {variants.length > 1 && (
          <button type="button" onClick={toggleAll}
            className="bg-transparent text-[11.5px] font-semibold text-muted-foreground hover:text-primary">
            {allOn ? t("clear") : t("all")}
          </button>
        )}
      </div>

      {/* The currency, once, for everything below it. */}
      {currencies.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <CurrencyPicker value={currency} currencies={currencies} disabled={busy}
            onChange={(code) => { setCurrency(code); setRate(""); setRows({}); setPaidNow(""); }} />
          {foreign && (
            <>
              <span className="text-[12px] text-muted-foreground">{t("fx_rate")}</span>
              <Input value={rate} inputMode="decimal" placeholder={published || "0"}
                onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, ""))}
                className="h-8 w-24 px-2 text-right font-mono text-[12.5px] tabular-nums" />
            </>
          )}
        </div>
      )}

      {variants.length === 0 && <p className="text-[13px] text-muted-foreground">{t("no_variants")}</p>}
      {variants.map((v, i) => {
        const key = keyOf(v, i);
        const row = rows[key];
        const mine = already.get(sigOf(v.attributes ?? []));
        const suggested = parseInt(v.suggestedPrice ?? "0", 10) || 0;
        return (
          <div key={key}
            className={cn("flex flex-col gap-2 rounded-[10px] border p-2.5 transition-colors",
              row ? "border-primary bg-primary-soft/30" : "border-border/60")}>
            <button type="button" onClick={() => toggle(v, key)} className="flex items-center gap-2.5 bg-transparent text-left">
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-[6px] border transition-colors",
                row ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                {row && <Check className="size-3.5" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {(v.attributes ?? []).length === 0
                  ? <span className="text-[13px] text-muted-foreground">{t("variant")}</span>
                  : (v.attributes ?? []).map((a) => {
                    const hex = hexOf(a.property, a.value);
                    return (
                      <Badge key={a.property} tone="neutral">
                        {hex && <span className="mr-1 inline-block size-2.5 rounded-full border border-black/10 align-middle" style={{ background: hex }} />}
                        {attrLabel(a.property, a.value)}
                      </Badge>
                    );
                  })}
              </span>
              <span className="shrink-0 text-right font-mono text-[11.5px] text-muted-foreground">
                {mine && <span className="block font-semibold text-foreground">{t("tpl_on_shelf")} {mine.qty}</span>}
                {!mine && suggested > 0 && <span className="block">≈ {money(suggested)}</span>}
              </span>
            </button>
            {/* Two-by-two on a phone, four across from `sm`. Four fields in a fixed three-column
                grid inside a dialog is how a form ends up unusable on the device most of these
                are actually filled in on. */}
            {row && (
              <div className="grid grid-cols-2 gap-2 pl-[30px] sm:grid-cols-4">
                <Field label={t("in_stock") + unitSuffix}>
                  <Input value={row.qty} inputMode="decimal" placeholder="0" className="font-mono" autoFocus
                    onChange={(e) => {
                      const qty = dec(e.target.value);
                      // The guessed threshold tracks the count until somebody takes it over.
                      setRow(key, row.reorderTouched ? { qty } : { qty, reorder: suggestReorder(qty) });
                    }} />
                </Field>
                <Field label={t("reorder_level")}>
                  <Input value={row.reorder} inputMode="decimal" placeholder="0" className="font-mono"
                    onChange={(e) => setRow(key, { reorder: dec(e.target.value), reorderTouched: true })} />
                </Field>
                <Field label={t("cost")}>
                  <Amount value={row.cost} foreign={foreign} symbol={cur?.symbol || currency}
                    onChange={(val) => setRow(key, { cost: val })} />
                </Field>
                <Field
                  label={t("sell_price")}
                  // The admin's recommendation, offered rather than applied. One tap accepts it;
                  // doing nothing leaves the shop's own price blank, which is the honest default.
                  hint={!row.price && suggested > 0 && !foreign ? (
                    <button type="button" onClick={() => setRow(key, { price: String(suggested) })}
                      className="bg-transparent text-left text-[11.5px] font-semibold text-primary hover:underline">
                      {t("tpl_use_suggested")} {money(suggested)}
                    </button>
                  ) : undefined}
                >
                  <Amount value={row.price} foreign={foreign} symbol={cur?.symbol || currency}
                    onChange={(val) => setRow(key, { price: val })} />
                </Field>
              </div>
            )}
          </div>
        );
      })}

      {/* Stock arriving is a delivery from a supplier, and it lands on their account here the
          same way it does everywhere else — otherwise the goods reach the shelf and the
          account never hears about it. */}
      <div className="flex flex-col gap-2.5 rounded-[12px] border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-bold text-foreground">{t("cg_delivery")}</span>
          {supplierId && arriving > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-muted-foreground">
              {t("cg_no_debt")}
              <Switch checked={skipDebt} onCheckedChange={setSkipDebt} />
            </label>
          )}
        </div>
        <Field label={t("supplier")}>
          <div className="relative flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <SearchSelect value={supplierId} placeholder={t("supplier")}
                options={suppliers.map((c) => ({ value: c.id, label: c.name }))} onChange={setSupplierId} />
            </div>
            <QuickSupplier brand={template.brand ?? ""} onCreated={onContragentsChange} onPicked={setSupplierId} />
          </div>
        </Field>
        {supplierId && arriving > 0 && !skipDebt && (
          <>
            <Field label={t("paid_now")}>
              <Amount value={paidNow} foreign={foreign} symbol={cur?.symbol || currency} onChange={setPaidNow} />
            </Field>
            {paidAmount > 0 && (
              <Field label={t("payment_method")}>
                <PaymentPicker value={payment} onChange={setPayment} total={paidAmount} cards={cards} disabled={busy}
                  accounts={shopAccounts.accounts}
                  payee={{ contragentId: supplierId, accounts: theirAccounts.accounts }}
                  onAccountsChanged={() => { shopAccounts.reload(); theirAccounts.reload(); }} />
              </Field>
            )}
            <DeliverySummary supplierId={supplierId} total={arriving} paid={paidAmount} balance={balances[supplierId] ?? 0} />
          </>
        )}
        <NoSupplierNote show={!supplierId && arriving > 0} />
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-card pt-2.5">
        <span className="text-[12.5px] text-muted-foreground">
          {picks.length > 0
            ? <>{picks.length} {t("variants").toLowerCase()}{arriving > 0 && <> · <span className="font-mono font-semibold text-foreground">{money(arriving)}</span></>}</>
            : t("tpl_pick_at_least_one")}
        </span>
        <Button disabled={busy || picks.length === 0 || payIncomplete} onClick={save}>
          {busy ? <Spinner /> : t("tpl_add_to_warehouse")}
        </Button>
      </div>
    </div>
  );
}

// Amount is one money box in the currency chosen for the whole form: grouped digits for
// so'm, decimals for anything else. The picker and the rate live once at the top, so this
// deliberately renders neither — a currency row under every field of every variant row would
// be more chrome than form.
function Amount({ value, foreign, symbol, onChange }: {
  value: string;
  foreign: boolean;
  symbol: string;
  onChange: (v: string) => void;
}) {
  if (!foreign) return <MoneyInput value={value} hideHint placeholder="0" onChange={onChange} />;
  return (
    <div className="relative">
      <Input value={value} inputMode="decimal" placeholder="0" className="pr-9 font-mono tabular-nums"
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))} />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[12.5px] font-bold text-muted-foreground">
        {symbol}
      </span>
    </div>
  );
}

// QuickSupplier adds a supplier without leaving the flow, inheriting the product's brand —
// the same escape hatch the hand-built form offers, because the first delivery of a new
// product is often the first delivery from a new supplier.
function QuickSupplier({ brand, onCreated, onPicked }: {
  brand: string;
  onCreated: () => void;
  onPicked: (id: string) => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const c = await api.createContragent({ name: name.trim(), phone: phone.trim(), brand: brand.trim() || undefined });
      onCreated();
      onPicked(c.id);
      setOpen(false); setName(""); setPhone("");
      toast(t("save"), { icon: "check" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally { setBusy(false); }
  };

  if (!open) {
    return <Button type="button" variant="soft" size="icon-sm" aria-label={t("add")} onClick={() => setOpen(true)}>+</Button>;
  }
  return (
    <div className="absolute right-0 z-10 mt-1 flex w-[260px] flex-col gap-1.5 rounded-[9px] border border-border bg-card p-2 shadow-lg">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("contragent_name")} autoFocus />
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phone")} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{t("cancel")}</Button>
        <Button type="button" size="sm" disabled={busy || !name.trim()} onClick={create}>{busy ? <Spinner /> : t("add")}</Button>
      </div>
    </div>
  );
}
