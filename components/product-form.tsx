"use client";
// Create/edit a warehouse product. Properties can be picked from the predefined
// catalog (admin-managed) or added ad-hoc. How values are captured depends on the
// property kind: select/color -> pick from predefined values (color shows swatches);
// number/text/ad-hoc -> type the values. Variants are generated from the property-
// value combinations, each with its own SKU, cost, price, stock and reorder level.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Plus, Search, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Badge } from "@/components/ui-kit/badge";
import { Spinner, Switch } from "@/components/ui-kit/misc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { MoneyInput, UnitSelect } from "@/components/catalog-fields";
import { FxMoneyInput } from "@/components/fx-money";
import {
  BASE_CURRENCY, emptyFx, findCurrency, fromMinor, fxPayload, fxSoum, minorUnitsOf, rateToInput,
  useCurrencies, type FxValue,
} from "@/lib/currency";
import { DeliverySummary, NoSupplierNote } from "@/components/delivery-summary";
import { PaymentPicker, toParts, usePayment, useShopCards, useShopAccounts, useContragentAccounts } from "@/components/payment-picker";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError, type ProductInput } from "@/lib/api";
import { num } from "@/lib/format";
import { pickLangText } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Product, PropertyDefinition, PropertyDefinitionValue, CatalogTerm, Contragent, Currency } from "@/lib/types";

// TermSelect is a dropdown over an admin-managed term list (brand/category). It
// tolerates a legacy free-typed value by keeping it selectable, and offers a
// blank ("—") option.
function TermSelect({ value, terms, placeholder, onChange }: { value: string; terms: CatalogTerm[]; placeholder: string; onChange: (v: string) => void }) {
  const names = terms.map((t) => t.name);
  const legacy = value && !names.includes(value) ? [{ value, label: value }] : [];
  // Brands carry an admin-uploaded logo; showing it makes the list scannable by mark, not
  // just by name. Categories simply have none, so they render unchanged.
  const options = [...legacy, ...terms.map((t) => ({ value: t.name, label: t.name, icon: t.logoUrl || undefined }))];
  return <SearchSelect value={value} options={options} placeholder={placeholder} onChange={onChange} />;
}

// SupplierField picks a contragent (supplier) by id, with an inline "+ new" quick-add
// so a supplier can be created without leaving the product form. When a product still
// carries only a free-typed legacy supplier name (unlinked), it shows as the placeholder.
// When a brand is chosen on the product, the list narrows to suppliers tied to that brand
// (plus brand-agnostic suppliers), and a quick-added supplier inherits the brand.
function SupplierField({ value, legacy, contragents, brand, onChange, onCreated }: {
  value: string;
  legacy: string;
  contragents: Contragent[];
  brand: string;
  onChange: (id: string) => void;
  onCreated: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [nm, setNm] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  // Narrow to the chosen brand: keep suppliers with that brand or no brand at all, and
  // always keep the currently-selected supplier visible so editing never hides it.
  const shown = useMemo(() => {
    const b = brand.trim();
    if (!b) return contragents;
    return contragents.filter((c) => c.id === value || !c.brand || c.brand === b);
  }, [contragents, brand, value]);

  const create = async () => {
    if (!nm.trim() || busy) return;
    setBusy(true);
    try {
      const c = await api.createContragent({ name: nm.trim(), phone: phone.trim(), brand: brand.trim() || undefined });
      onCreated();
      onChange(c.id);
      setAdding(false); setNm(""); setPhone("");
      toast(t("save"), { icon: "check" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally { setBusy(false); }
  };

  if (adding) {
    return (
      <div className="flex flex-col gap-1.5 rounded-[9px] border border-border bg-secondary/30 p-2">
        <Input value={nm} onChange={(e) => setNm(e.target.value)} placeholder={t("contragent_name")} autoFocus />
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phone")} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); setNm(""); setPhone(""); }}>{t("cancel")}</Button>
          <Button type="button" size="sm" disabled={busy || !nm.trim()} onClick={create}>{busy ? <Spinner /> : t("add")}</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <SearchSelect
          value={value}
          options={shown.map((c) => ({ value: c.id, label: c.name }))}
          placeholder={legacy || t("supplier")}
          onChange={onChange}
        />
      </div>
      <Button type="button" variant="soft" size="icon-sm" aria-label={t("add")} onClick={() => setAdding(true)}><Plus /></Button>
    </div>
  );
}

type Kind = PropertyDefinition["kind"];
type PropRow = {
  key: string;
  defId: string;       // linked predefined definition ("" = ad-hoc free property)
  name: string;
  kind: Kind;          // select | color | number | text
  unit: string;
  valuesText: string;  // typed values (number / text / ad-hoc), comma-separated
  chosen: string[];    // toggled values (select / color)
};
type VarRow = {
  key: string;
  id: string;   // "" for a row the owner just added; an edit sends it so the save lands on the same variant
  sku: string;
  qty: string;
  reorder: string;
  // Each carries the currency it was typed in. A price list can hold a filter bought in
  // dollars next to a gasket bought in so'm, so the currency belongs to the amount rather
  // than to the form.
  cost: FxValue;
  price: FxValue;
  active: boolean;
  attrs: Record<string, string>;
};

const dec = (v: string) => v.replace(/[^\d.]/g, "");
const splitValues = (s: string) => s.split(",").map((v) => v.trim()).filter(Boolean);
const hasPredefinedValues = (k: Kind) => k === "select" || k === "color";
const ADHOC = "__adhoc__";
let keySeq = 0;
const newKey = () => `k${keySeq++}`;

// Auto-generate a numeric SKU. The counter suffix keeps rapidly-generated variants
// (e.g. a whole matrix at once) unique within the same millisecond. Users can
// override the value by typing their own SKU.
//
// Exported because the catalogue picker mints variants too, and a product stocked from the
// catalogue must carry the same kind of code as one typed by hand — the QR on the shelf label
// is printed from it either way.
let skuSeq = 0;
export const genSku = () => `${String(Date.now()).slice(-7)}${String(skuSeq++ % 1000).padStart(3, "0")}`;

// The effective values of a property, whichever way they were entered.
const propValues = (p: PropRow) =>
  hasPredefinedValues(p.kind) && p.defId ? p.chosen.filter(Boolean) : splitValues(p.valuesText);

// A stable signature for a variant's attribute combination, given the property order.
const sigOf = (props: PropRow[], attrs: Record<string, string>) =>
  props.map((p) => `${p.name}=${attrs[p.name] ?? ""}`).join("|");

// Cartesian product of each property's values, one attrs map per combination.
function combos(props: PropRow[]): Record<string, string>[] {
  const usable = props.filter((p) => p.name.trim() && propValues(p).length > 0);
  if (usable.length === 0) return [];
  let out: Record<string, string>[] = [{}];
  for (const p of usable) {
    const next: Record<string, string>[] = [];
    for (const base of out) {
      for (const val of propValues(p)) next.push({ ...base, [p.name.trim()]: val });
    }
    out = next;
  }
  return out;
}

// Look up the hex swatch for a color value from the definitions catalog.
function hexOf(defs: PropertyDefinition[], propName: string, value: string): string | undefined {
  const d = defs.find((x) => x.name === propName && x.kind === "color");
  return d?.values?.find((v) => v.value === value)?.colorHex || undefined;
}

const blankVar = (attrs: Record<string, string> = {}): VarRow => ({
  key: newKey(), id: "", sku: genSku(), qty: "", reorder: "", cost: emptyFx(), price: emptyFx(), active: true, attrs,
});

// Rebuild the variant grid from a set of properties, preserving the data already entered for
// combinations that still exist (matched by attribute signature). When no property combinations
// remain (e.g. the last property was deleted) the product collapses to a single variant, keeping
// the first existing row's cost/price/stock.
function regen(nextProps: PropRow[], current: VarRow[]): VarRow[] {
  const wanted = combos(nextProps);
  if (wanted.length === 0) {
    const first = current[0];
    return [first ? { ...first, attrs: {} } : blankVar()];
  }
  const bySig = new Map(current.map((v) => [sigOf(nextProps, v.attrs), v]));
  return wanted.map((attrs) => {
    const existing = bySig.get(sigOf(nextProps, attrs));
    return existing ? { ...existing, attrs } : blankVar(attrs);
  });
}

// Build editable prop rows from a saved product, linking to catalog definitions by name.
function propsFromProduct(p: Product, defs: PropertyDefinition[]): PropRow[] {
  return (p.properties ?? []).map((pp) => {
    const def = defs.find((d) => d.name === pp.name);
    if (def && hasPredefinedValues(def.kind)) {
      return { key: newKey(), defId: def.id, name: def.name, kind: def.kind, unit: def.unit ?? "", valuesText: "", chosen: pp.values ?? [] };
    }
    if (def) {
      return { key: newKey(), defId: def.id, name: def.name, kind: def.kind, unit: def.unit ?? "", valuesText: (pp.values ?? []).join(", "), chosen: [] };
    }
    return { key: newKey(), defId: "", name: pp.name, kind: "text", unit: "", valuesText: (pp.values ?? []).join(", "), chosen: [] };
  });
}

// Build the editable variant rows from a saved product.
//
// The cost box is filled from what the variant currently costs, and that is not cosmetic: the
// save posts every field back, so a blank cost box posted a zero and wiped the cost the shop
// had built up. Renaming a product was enough to do it, which took the warehouse's cost total
// and every margin figure with it. A box that shows the stored value round-trips it untouched
// and only changes what somebody actually retyped.
//
// It carries no currency stamp, unlike the price beside it: unit_cost is a moving weighted
// average, rolled forward on every priced receipt, so it is a so'm figure and nothing else —
// see ProductVariant in the proto. Typing over it in another currency still works, and is how
// a delivery at a new price is priced.
function varsFromProduct(p: Product, currencies: Currency[]): VarRow[] {
  const vars = (p.variants ?? []).map((v) => {
    const attrs: Record<string, string> = {};
    for (const a of v.attributes ?? []) attrs[a.property] = a.value;
    return {
      key: newKey(),
      id: v.id ?? "",
      sku: v.sku ?? "",
      qty: v.quantityOnHand ? String(v.quantityOnHand) : "",
      reorder: v.reorderLevel ? String(v.reorderLevel) : "",
      cost: { currency: BASE_CURRENCY, typed: num(v.unitCost) ? String(v.unitCost) : "", rate: "" },
      price: v.fxUnitPrice?.currency
        ? { currency: v.fxUnitPrice.currency, typed: fromMinor(Number(v.fxUnitPrice.amountMinor) || 0, minorUnitsOf(currencies, v.fxUnitPrice.currency)), rate: rateToInput(v.fxUnitPrice.rateMicros) }
        : { currency: BASE_CURRENCY, typed: num(v.unitPrice) ? String(v.unitPrice) : "", rate: "" },
      active: v.active,
      attrs,
    };
  });
  return vars.length ? vars : [blankVar()];
}

export function ProductForm({
  open, mode, product, shopId, definitions, brands, categories, contragents, onContragentsChange, onClose, onSaved,
}: {
  open: boolean;
  mode: "new" | "edit";
  product: Product | null;
  shopId: string;
  definitions: PropertyDefinition[];
  brands: CatalogTerm[];
  categories: CatalogTerm[];
  contragents: Contragent[];
  onContragentsChange: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, tp, lang } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  // Display labels for the property catalog: an admin-entered translation wins, then the
  // built-in dictionary (for catalogs predating admin translations), then the canonical text.
  const defLabel = useCallback(
    (d: PropertyDefinition) => pickLangText(lang, d.nameUzLatn, d.nameUzCyrl, d.nameRu, tp(d.name)),
    [lang, tp],
  );
  const valLabel = useCallback(
    (v: PropertyDefinitionValue) => pickLangText(lang, v.valueUzLatn, v.valueUzCyrl, v.valueRu, v.value),
    [lang],
  );
  // A property row carries only the canonical name, so resolve its definition for the label.
  const propLabel = useCallback(
    (name: string) => {
      const d = definitions.find((x) => x.name === name);
      return d ? defLabel(d) : tp(name);
    },
    [definitions, defLabel, tp],
  );
  // A variant attribute stores canonical (property, value) pairs; translate the value for display.
  const attrLabel = useCallback(
    (prop: string, val: string) => {
      const v = definitions.find((d) => d.name === prop)?.values?.find((x) => x.value === val);
      return v ? valLabel(v) : val;
    },
    [definitions, valLabel],
  );

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierLegacy, setSupplierLegacy] = useState(""); // free-typed name kept when unlinked
  const [brand, setBrand] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [description, setDescription] = useState("");
  const [props, setProps] = useState<PropRow[]>([]);
  const [vars, setVars] = useState<VarRow[]>(() => [blankVar()]);
  // Stock arriving with this save is a delivery from the supplier. On credit unless the owner
  // says what was handed over; skipDebt is for goods the shop already owned.
  const [paidNow, setPaidNow] = useState<FxValue>(() => emptyFx());
  const [skipDebt, setSkipDebt] = useState(false);
  // How that settlement leaves the shop. A supplier that is an MCHJ is normally paid by
  // transfer to their account, and the delivery is the moment the money is sent.
  const { payment, setPayment, reset: resetPayment } = usePayment();
  const cards = useShopCards(shopId);
  const shopAccounts = useShopAccounts();
  const theirAccounts = useContragentAccounts(supplierId);
  const currencies = useCurrencies();
  // What each variant held when the form opened, so an edit can price only the stock added.
  const [openingQty, setOpeningQty] = useState<Record<string, number>>({});
  // What each supplier is owed right now, so the form can say where this delivery leaves them.
  // Owner-only, and the form is still usable without it.
  const [balances, setBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && product) {
      setName(product.name);
      setCategory(product.category ?? "");
      setSupplierId(product.supplierId ?? "");
      setSupplierLegacy(product.supplier ?? "");
      setBrand(product.brand ?? "");
      setUnit(product.unit || "pcs");
      setDescription(product.description ?? "");
      setProps(propsFromProduct(product, definitions));
      const rows = varsFromProduct(product, currencies);
      setVars(rows);
      setOpeningQty(Object.fromEntries(rows.filter((v) => v.id).map((v) => [v.id, parseFloat(v.qty) || 0])));
    } else {
      setName(""); setCategory(""); setSupplierId(""); setSupplierLegacy(""); setBrand(""); setUnit("pcs"); setDescription("");
      setProps([]); setVars([blankVar()]); setOpeningQty({});
    }
    setPaidNow(emptyFx()); setSkipDebt(false); resetPayment();
    api.contragentBalances(shopId).then((r) => {
      const m: Record<string, number> = {};
      for (const b of r.balances ?? []) m[b.contragentId] = parseInt(b.balance, 10) || 0;
      setBalances(m);
    }).catch(() => {});
  }, [open, mode, product, definitions, shopId]);

  const hasProps = props.some((p) => p.name.trim() && propValues(p).length > 0);

  // What this save actually brings in. On an edit only the increase counts — the stock already
  // on the shelf was paid for (or owed for) when it arrived, and charging it again would double
  // the debt every time somebody corrected a typo in the product name.
  const arriving = vars.reduce((sum, v) => {
    const qty = parseFloat(v.qty) || 0;
    const added = v.id ? qty - (openingQty[v.id] ?? 0) : qty;
    const cost = fxSoum(v.cost, findCurrency(currencies, v.cost.currency));
    return added > 0 ? sum + Math.round(added * cost) : sum;
  }, 0);
  const paidNowTyped = fxSoum(paidNow, findCurrency(currencies, paidNow.currency));
  const paidNowAmount = Math.min(paidNowTyped, arriving);
  // A payment described but not finished — "card" with no card named — must not save as
  // though nothing had been said about it. The button goes dark instead.
  const payParts = paidNowAmount > 0 ? toParts(payment, paidNowAmount, shopAccounts.accounts) : null;
  const payIncomplete = paidNowAmount > 0 && !skipDebt && !!supplierId && !payParts;

  const addPropertyFromCatalog = (defId: string) => {
    if (defId === ADHOC) {
      setProps((p) => [...p, { key: newKey(), defId: "", name: "", kind: "text", unit: "", valuesText: "", chosen: [] }]);
      return;
    }
    const def = definitions.find((d) => d.id === defId);
    if (!def || props.some((p) => p.defId === def.id)) return;
    setProps((p) => [...p, { key: newKey(), defId: def.id, name: def.name, kind: def.kind, unit: def.unit ?? "", valuesText: "", chosen: [] }]);
  };

  const setProp = (key: string, patch: Partial<PropRow>) =>
    setProps((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const toggleChosen = (key: string, value: string) =>
    setProps((prev) => prev.map((p) => {
      if (p.key !== key) return p;
      const has = p.chosen.includes(value);
      return { ...p, chosen: has ? p.chosen.filter((v) => v !== value) : [...p.chosen, value] };
    }));

  // Turning a whole group on or off at once. Done as a set so a repeated tap cannot duplicate
  // a value in `chosen`.
  const setChosenMany = (key: string, vals: string[], on: boolean) =>
    setProps((prev) => prev.map((p) => {
      if (p.key !== key) return p;
      const next = new Set(p.chosen);
      for (const v of vals) { if (on) next.add(v); else next.delete(v); }
      return { ...p, chosen: [...next] };
    }));

  // Regenerate the variant grid from current property combinations, preserving
  // data already entered for combinations that still exist.
  const generate = () => setVars((prev) => regen(props, prev));

  // Delete a property and immediately re-arrange the variant grid to the remaining
  // combinations (dropping variants that only differed by the removed property).
  const deleteProp = (key: string) => {
    const next = props.filter((x) => x.key !== key);
    setProps(next);
    setVars((prev) => regen(next, prev));
  };

  const setVar = (key: string, patch: Partial<VarRow>) =>
    setVars((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  const save = async () => {
    if (!name.trim() || busy || payIncomplete) return;
    const activeVars = vars.filter((v) => !hasProps || Object.keys(v.attrs).length > 0);
    if (activeVars.length === 0) { toast(t("no_variants"), { icon: "alert", tone: "danger" }); return; }
    // Resolve the supplier name from the linked contragent; keep the legacy free-typed
    // name only when nothing is linked (so old unlinked products don't lose their label).
    const linked = contragents.find((c) => c.id === supplierId);
    const supplierName = linked ? linked.name : (supplierId ? "" : supplierLegacy.trim());
    const payload: ProductInput = {
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      unit,
      supplier: supplierName,
      supplierId,
      brand: brand.trim(),
      properties: props
        .filter((p) => p.name.trim() && propValues(p).length > 0)
        .map((p) => ({ name: p.name.trim(), values: propValues(p) })),
      paidAmount: paidNowAmount,
      // Only when money actually moved. A delivery taken wholly on credit has nothing to
      // describe, and sending "cash: 0" would put a payment on the account that never happened.
      parts: payParts ?? undefined,
      // Only stamped when the amount was NOT capped at what the delivery was worth: a stamp
      // saying "$200" beside a so'm figure that is no longer $200 would contradict it.
      fxPaidAmount: paidNowAmount === paidNowTyped
        ? fxPayload(paidNow, findCurrency(currencies, paidNow.currency))
        : undefined,
      skipDebt,
      variants: activeVars.map((v) => ({
        id: v.id,
        sku: v.sku.trim(),
        quantityOnHand: parseFloat(v.qty) || 0,
        reorderLevel: parseFloat(v.reorder) || 0,
        unitCost: fxSoum(v.cost, findCurrency(currencies, v.cost.currency)),
        unitPrice: fxSoum(v.price, findCurrency(currencies, v.price.currency)),
        fxUnitCost: fxPayload(v.cost, findCurrency(currencies, v.cost.currency)),
        fxUnitPrice: fxPayload(v.price, findCurrency(currencies, v.price.currency)),
        active: v.active,
        attributes: Object.entries(v.attrs).map(([property, value]) => ({ property, value })),
      })),
    };
    setBusy(true);
    try {
      if (mode === "edit" && product) await api.updateProduct(product.id, { ...payload, active: product.active });
      else await api.createProduct(shopId, payload);
      toast(t("save"), { icon: "check" });
      onClose();
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  // Catalog options not already added.
  const available = definitions.filter((d) => !props.some((p) => p.defId === d.id));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[660px]">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? t("edit_product") : t("add_part")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto py-1">
          {/* Shared product fields */}
          <Field label={t("product_name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t("brand")}><TermSelect value={brand} terms={brands} placeholder={t("brand")} onChange={setBrand} /></Field>
            <Field label={t("category")}><TermSelect value={category} terms={categories} placeholder={t("category")} onChange={setCategory} /></Field>
          </div>
          <div className="grid grid-cols-[1fr_80px] gap-2.5">
            <Field label={t("supplier")}>
              <SupplierField
                value={supplierId}
                legacy={supplierLegacy}
                contragents={contragents}
                brand={brand}
                onChange={setSupplierId}
                onCreated={onContragentsChange}
              />
            </Field>
            <Field label={t("unit")}><UnitSelect value={unit} onChange={setUnit} /></Field>
          </div>
          <Field label={t("description")}>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          {/* Property editor */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t("properties")}</span>
              <div className="w-[220px]">
                <SearchSelect
                  value=""
                  allowClear={false}
                  placeholder={t("add_property")}
                  options={[...available.map((d) => ({ value: d.id, label: defLabel(d) })), { value: ADHOC, label: t("custom_property") }]}
                  onChange={addPropertyFromCatalog}
                />
              </div>
            </div>

            {props.map((p) => (
              <div key={p.key} className="flex flex-col gap-2 rounded-[10px] border border-border/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  {p.defId ? (
                    <span className="text-[13.5px] font-semibold text-foreground">
                      {propLabel(p.name)}
                      {p.kind === "number" && p.unit ? <span className="text-muted-foreground"> ({p.unit})</span> : null}
                    </span>
                  ) : (
                    <Input value={p.name} placeholder={t("property_name")} className="h-8 max-w-[240px]"
                      onChange={(e) => setProp(p.key, { name: e.target.value })} />
                  )}
                  <Button variant="ghost" size="sm" onClick={() => deleteProp(p.key)}><Trash2 /></Button>
                </div>

                {/* Values by kind */}
                {hasPredefinedValues(p.kind) && p.defId ? (
                  <ValuePicker
                    values={definitions.find((d) => d.id === p.defId)?.values ?? []}
                    chosen={p.chosen}
                    color={p.kind === "color"}
                    label={valLabel}
                    onToggle={(value) => toggleChosen(p.key, value)}
                    onSetMany={(vals, on) => setChosenMany(p.key, vals, on)}
                    onClear={() => setProp(p.key, { chosen: [] })}
                  />
                ) : (
                  <Input value={p.valuesText} placeholder={p.kind === "number" ? "38, 39, 40" : t("property_values")}
                    onChange={(e) => setProp(p.key, { valuesText: e.target.value })} />
                )}
              </div>
            ))}

            {hasProps && (
              <Button variant="soft" size="sm" className="self-start" onClick={generate}>
                <Wand2 /> {t("generate_variants")}
              </Button>
            )}
          </div>

          {/* Variant grid */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t("variants")}</span>
              {!hasProps && (
                <Button variant="ghost" size="sm" onClick={() => setVars([...vars, blankVar()])}><Plus /> {t("add_variant")}</Button>
              )}
            </div>
            {vars.length === 0 && <p className="text-[13px] text-muted-foreground">{t("no_variants")}</p>}
            {vars.map((v) => {
              const chips = Object.entries(v.attrs);
              return (
                <div key={v.key} className="flex flex-col gap-2 rounded-[10px] border border-border/60 p-2.5">
                  <div className="flex items-center justify-between">
                    {chips.length ? (
                      <div className="flex flex-wrap gap-1">
                        {chips.map(([prop, val]) => {
                          const hex = hexOf(definitions, prop, val);
                          return (
                            <Badge key={prop} tone="neutral">
                              {hex && <span className="mr-1 inline-block size-2.5 rounded-full border border-black/10 align-middle" style={{ background: hex }} />}
                              {attrLabel(prop, val)}
                            </Badge>
                          );
                        })}
                      </div>
                    ) : <span className="text-[12px] text-muted-foreground">{t("variant")}</span>}
                    {!hasProps && vars.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setVars(vars.filter((x) => x.key !== v.key))}><Trash2 /></Button>
                    )}
                  </div>
                  {/* SKU is auto-generated in the background and not shown to the user. */}
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t("cost")}>
                      <FxMoneyInput value={v.cost} currencies={currencies} onChange={(val) => setVar(v.key, { cost: val })} />
                    </Field>
                    <Field label={t("sell_price")}>
                      <FxMoneyInput value={v.price} currencies={currencies} onChange={(val) => setVar(v.key, { price: val })} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t("in_stock")}><Input value={v.qty} inputMode="decimal" placeholder="0" className="font-mono" onChange={(e) => setVar(v.key, { qty: dec(e.target.value) })} /></Field>
                    <Field label={t("reorder_level")}><Input value={v.reorder} inputMode="decimal" placeholder="0" className="font-mono" onChange={(e) => setVar(v.key, { reorder: dec(e.target.value) })} /></Field>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stock arriving with this save is a delivery, settled here the same way the receive
              panel settles one. Without this the goods landed on the shelf and the supplier's
              account never heard about it. */}
          {supplierId && arriving > 0 && (
            <div className="flex flex-col gap-2.5 rounded-[12px] border border-border p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-bold text-foreground">{t("cg_delivery")}</span>
                <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-muted-foreground">
                  {t("cg_no_debt")}
                  <Switch checked={skipDebt} onCheckedChange={setSkipDebt} />
                </label>
              </div>
              {!skipDebt && (
                <>
                  <Field label={t("paid_now")}>
                    <FxMoneyInput value={paidNow} currencies={currencies} onChange={setPaidNow} placeholder="0" hideHint />
                  </Field>
                  {paidNowAmount > 0 && (
                    <Field label={t("payment_method")}>
                      <PaymentPicker value={payment} onChange={setPayment} total={paidNowAmount} cards={cards} disabled={busy}
                        accounts={shopAccounts.accounts}
                        payee={{ contragentId: supplierId, accounts: theirAccounts.accounts }}
                        onAccountsChanged={() => { shopAccounts.reload(); theirAccounts.reload(); }} />
                    </Field>
                  )}
                  <DeliverySummary
                    supplierId={supplierId}
                    total={arriving}
                    paid={paidNowAmount}
                    balance={balances[supplierId] ?? 0}
                  />
                </>
              )}
            </div>
          )}
          <NoSupplierNote show={!supplierId && arriving > 0} />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy || payIncomplete} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ValuePicker chooses which of a property's predefined values this product actually uses.
//
// A catalogue property can be large — a "Car" property with 222 models is an ordinary thing to
// have — and rendering all of them as chips buries the form and gives no way to find one. So
// past a threshold this searches, and shows only a first screenful until asked for the rest.
// What is already chosen always stays visible: it is the answer to "what did I pick", and it
// must not disappear behind a search term.
const VALUE_SEARCH_FROM = 12;   // below this a plain wrap of chips is easier than a search box
const VALUE_PREVIEW = 24;       // unsearched, unexpanded: enough to browse, not enough to bury
const VALUE_GROUP_FROM = 24;    // below this, group headers cost more chrome than they save
const OTHER_GROUP = " ";   // values with no leading word share one trailing group

// The leading word of a value is its family: "Chevrolet Cobalt", "Chevrolet Lacetti" and
// "Chevrolet Spark" are all Chevrolets. Taken from the DISPLAYED label so the heading is in the
// same language as the values under it.
//
// A make written as two words ("Land Rover Defender") groups under the first only. The group
// still gathers exactly the right values — only its heading is short — which is a fair price
// for needing no schema, no data entry and no migration.
const groupKeyOf = (s: string) => {
  const trimmed = s.trim();
  const i = trimmed.indexOf(" ");
  return i > 0 ? trimmed.slice(0, i) : "";
};

type ValueGroup = { key: string; title: string; items: PropertyDefinitionValue[] };

// Inside its own group a value drops the leading word the heading already carries.
const stripGroup = (label: string, key: string) =>
  key !== OTHER_GROUP && label.startsWith(key + " ") ? label.slice(key.length + 1) : label;

function ValuePicker({ values, chosen, color, label, onToggle, onSetMany, onClear }: {
  values: PropertyDefinitionValue[];
  chosen: string[];
  color: boolean;
  label: (v: PropertyDefinitionValue) => string;
  onToggle: (value: string) => void;
  onSetMany: (values: string[], on: boolean) => void;
  onClear: () => void;
}) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  // Which groups the reader has opened or closed by hand; anything absent falls back to the
  // default (open when it holds a selection, or when a search matched inside it).
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const searchable = values.length >= VALUE_SEARCH_FROM;
  const searching = query.trim().length > 0;

  // A new search re-opens by relevance rather than inheriting what was open for the last one.
  useEffect(() => { setOpenMap({}); }, [query]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return values;
    return values.filter((v) => (label(v) + " " + v.value).toLowerCase().includes(q));
  }, [values, query, label]);

  // Grouping earns its keep only when it actually shortens the list. Values that share no
  // leading word would become one group each, which is the wall of chips again with extra
  // furniture, so that case falls back to the flat list.
  const groups = useMemo<ValueGroup[] | null>(() => {
    if (values.length < VALUE_GROUP_FROM) return null;
    const byKey = new Map<string, ValueGroup>();
    for (const v of values) {
      const key = groupKeyOf(label(v)) || OTHER_GROUP;
      const g = byKey.get(key);
      if (g) g.items.push(v);
      else byKey.set(key, { key, title: key === OTHER_GROUP ? t("other_group") : key, items: [v] });
    }
    const out = [...byKey.values()].sort((a, b) =>
      // "Boshqa" last; everything else alphabetical, because a list you scan should be where
      // you expect it rather than shuffling as you pick.
      a.key === OTHER_GROUP ? 1 : b.key === OTHER_GROUP ? -1 : a.title.localeCompare(b.title));
    if (out.length < 2 || out.length > values.length * 0.6) return null;
    return out;
  }, [values, label, t]);

  // Chosen values first, so a pick never scrolls out of sight, then the rest.
  const on = useMemo(() => matches.filter((v) => chosen.includes(v.value)), [matches, chosen]);
  const off = useMemo(() => matches.filter((v) => !chosen.includes(v.value)), [matches, chosen]);

  // Group membership is decided per value, so the search result needs to be a set the group
  // rows can test against rather than a list to scan per chip.
  const matchSet = useMemo(() => new Set(matches.map((v) => v.value)), [matches]);

  // The cap trims the unchosen tail only. Everything picked stays on screen however many there
  // are — hiding a choice behind "show all" is how you lose track of what you selected.
  const capped = searchable && !expanded && !query.trim();
  const shown = capped ? [...on, ...off.slice(0, Math.max(0, VALUE_PREVIEW - on.length))] : [...on, ...off];
  const hidden = matches.length - shown.length;

  return (
    <div className="flex flex-col gap-2">
      {searchable && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={`${t("search")}… (${values.length})`} className="h-8 pl-8 text-[12.5px]" />
          </div>
          {chosen.length > 0 && (
            <button type="button" onClick={onClear}
              className="shrink-0 text-[11.5px] font-semibold text-muted-foreground hover:text-destructive">
              {chosen.length} ✓ · {t("clear")}
            </button>
          )}
        </div>
      )}

      {groups ? (
        <div className="flex flex-col gap-1.5">
          {groups.map((g) => {
            const visible = searching ? g.items.filter((v) => matchSet.has(v.value)) : g.items;
            if (visible.length === 0) return null;
            const picked = g.items.filter((v) => chosen.includes(v.value)).length;
            // Open by default when it holds a pick — a selection must never be invisible —
            // or when a search found something inside it.
            const isOpen = openMap[g.key] ?? (searching || picked > 0);
            const allOn = picked === g.items.length;
            return (
              <div key={g.key} className="overflow-hidden rounded-[9px] border border-border/70">
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 bg-transparent text-left"
                    onClick={() => setOpenMap((m) => ({ ...m, [g.key]: !isOpen }))}>
                    <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                    <span className="truncate text-[12.5px] font-bold text-foreground">{g.title}</span>
                    {/* When the whole group is picked, "12 · 12 ✓" says the same thing twice. */}
                    {!allOn && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {searching ? `${visible.length}/${g.items.length}` : g.items.length}
                      </span>
                    )}
                    {picked > 0 && <span className="shrink-0 text-[11px] font-semibold text-primary-emphasis">{picked} ✓</span>}
                  </button>
                  {/* A part that fits a whole make is one tap, not nine. */}
                  <button type="button"
                    onClick={() => onSetMany(g.items.map((v) => v.value), !allOn)}
                    className="shrink-0 bg-transparent text-[11px] font-semibold text-muted-foreground hover:text-primary">
                    {allOn ? t("clear") : t("all")}
                  </button>
                </div>
                {isOpen && (
                  <div className="flex flex-wrap gap-1.5 px-2.5 pb-2.5">
                    {/* The make is already the heading, so the chips under it drop it:
                        "BYD Han" reads as "Han" inside BYD. Only the display is trimmed —
                        the value stored on the variant is untouched. */}
                    {visible.map((v) => (
                      <ValueChip key={v.value} v={v} on={chosen.includes(v.value)} color={color}
                        label={(x) => stripGroup(label(x), g.key)} onToggle={onToggle} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {matches.length === 0 && <span className="py-1 text-[12px] text-muted-foreground">{t("empty")}</span>}
        </div>
      ) : shown.length === 0 ? (
        <span className="py-1 text-[12px] text-muted-foreground">{t("empty")}</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {shown.map((v) => <ValueChip key={v.value} v={v} on={chosen.includes(v.value)} color={color} label={label} onToggle={onToggle} />)}
        </div>
      )}

      {!groups && hidden > 0 && (
        <button type="button" onClick={() => setExpanded(true)}
          className="self-start text-[11.5px] font-semibold text-primary hover:underline">
          {t("show_all")} (+{hidden})
        </button>
      )}
    </div>
  );
}

function ValueChip({ v, on, color, label, onToggle }: {
  v: PropertyDefinitionValue;
  on: boolean;
  color: boolean;
  label: (v: PropertyDefinitionValue) => string;
  onToggle: (value: string) => void;
}) {
  return (
    <button type="button" onClick={() => onToggle(v.value)}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${on ? "border-primary bg-primary-soft text-primary-emphasis" : "border-border text-muted-foreground hover:bg-secondary"}`}>
      {color && <span className="size-3.5 rounded-full border border-black/10" style={{ background: v.colorHex || "#888" }} />}
      {label(v)}
    </button>
  );
}
