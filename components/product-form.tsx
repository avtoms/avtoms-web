"use client";
// Create/edit a warehouse product. Properties can be picked from the predefined
// catalog (admin-managed) or added ad-hoc. How values are captured depends on the
// property kind: select/color -> pick from predefined values (color shows swatches);
// number/text/ad-hoc -> type the values. Variants are generated from the property-
// value combinations, each with its own SKU, cost, price, stock and reorder level.
import React, { useEffect, useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Badge } from "@/components/ui-kit/badge";
import { Spinner } from "@/components/ui-kit/misc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import { MoneyInput, UnitSelect } from "@/components/catalog-fields";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError, type ProductInput } from "@/lib/api";
import type { Product, PropertyDefinition, CatalogTerm } from "@/lib/types";

// TermSelect is a dropdown over an admin-managed term list (brand/category). It
// tolerates a legacy free-typed value by keeping it selectable, and offers a
// blank ("—") option.
const TERM_NONE = "__none__";
function TermSelect({ value, terms, placeholder, onChange }: { value: string; terms: CatalogTerm[]; placeholder: string; onChange: (v: string) => void }) {
  const names = terms.map((t) => t.name);
  const legacy = value && !names.includes(value) ? [value] : [];
  return (
    <Select value={value || TERM_NONE} onValueChange={(v) => onChange(v === TERM_NONE ? "" : v)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={TERM_NONE}>—</SelectItem>
        {legacy.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
        {terms.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
      </SelectContent>
    </Select>
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
  sku: string;
  qty: string;
  reorder: string;
  cost: string;
  price: string;
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
let skuSeq = 0;
const genSku = () => `${String(Date.now()).slice(-7)}${String(skuSeq++ % 1000).padStart(3, "0")}`;

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
  key: newKey(), sku: genSku(), qty: "", reorder: "", cost: "", price: "", active: true, attrs,
});

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

function varsFromProduct(p: Product): VarRow[] {
  const vars = (p.variants ?? []).map((v) => {
    const attrs: Record<string, string> = {};
    for (const a of v.attributes ?? []) attrs[a.property] = a.value;
    return {
      key: newKey(),
      sku: v.sku ?? "",
      qty: v.quantityOnHand ? String(v.quantityOnHand) : "",
      reorder: v.reorderLevel ? String(v.reorderLevel) : "",
      cost: v.unitCost ?? "",
      price: v.unitPrice ?? "",
      active: v.active,
      attrs,
    };
  });
  return vars.length ? vars : [blankVar()];
}

export function ProductForm({
  open, mode, product, shopId, definitions, brands, categories, onClose, onSaved,
}: {
  open: boolean;
  mode: "new" | "edit";
  product: Product | null;
  shopId: string;
  definitions: PropertyDefinition[];
  brands: CatalogTerm[];
  categories: CatalogTerm[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [brand, setBrand] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [description, setDescription] = useState("");
  const [props, setProps] = useState<PropRow[]>([]);
  const [vars, setVars] = useState<VarRow[]>(() => [blankVar()]);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && product) {
      setName(product.name);
      setCategory(product.category ?? "");
      setSupplier(product.supplier ?? "");
      setBrand(product.brand ?? "");
      setUnit(product.unit || "pcs");
      setDescription(product.description ?? "");
      setProps(propsFromProduct(product, definitions));
      setVars(varsFromProduct(product));
    } else {
      setName(""); setCategory(""); setSupplier(""); setBrand(""); setUnit("pcs"); setDescription("");
      setProps([]); setVars([blankVar()]);
    }
  }, [open, mode, product, definitions]);

  const hasProps = props.some((p) => p.name.trim() && propValues(p).length > 0);

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

  // Regenerate the variant grid from current property combinations, preserving
  // data already entered for combinations that still exist.
  const generate = () => {
    const wanted = combos(props);
    if (wanted.length === 0) { setVars((prev) => (prev.length ? prev : [blankVar()])); return; }
    const bySig = new Map(vars.map((v) => [sigOf(props, v.attrs), v]));
    setVars(wanted.map((attrs) => {
      const existing = bySig.get(sigOf(props, attrs));
      return existing ? { ...existing, attrs } : blankVar(attrs);
    }));
  };

  const setVar = (key: string, patch: Partial<VarRow>) =>
    setVars((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  const save = async () => {
    if (!name.trim() || busy) return;
    const activeVars = vars.filter((v) => !hasProps || Object.keys(v.attrs).length > 0);
    if (activeVars.length === 0) { toast(t("no_variants"), { icon: "alert", tone: "danger" }); return; }
    const payload: ProductInput = {
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      unit,
      supplier: supplier.trim(),
      brand: brand.trim(),
      properties: props
        .filter((p) => p.name.trim() && propValues(p).length > 0)
        .map((p) => ({ name: p.name.trim(), values: propValues(p) })),
      variants: activeVars.map((v) => ({
        sku: v.sku.trim(),
        quantityOnHand: parseFloat(v.qty) || 0,
        reorderLevel: parseFloat(v.reorder) || 0,
        unitCost: parseInt(v.cost, 10) || 0,
        unitPrice: parseInt(v.price, 10) || 0,
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
            <Field label={t("supplier")}><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
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
                <Select value="" onValueChange={addPropertyFromCatalog}>
                  <SelectTrigger><SelectValue placeholder={t("add_property")} /></SelectTrigger>
                  <SelectContent>
                    {available.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    <SelectItem value={ADHOC}>{t("custom_property")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {props.map((p) => (
              <div key={p.key} className="flex flex-col gap-2 rounded-[10px] border border-border/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  {p.defId ? (
                    <span className="text-[13.5px] font-semibold text-foreground">
                      {p.name}
                      {p.kind === "number" && p.unit ? <span className="text-muted-foreground"> ({p.unit})</span> : null}
                    </span>
                  ) : (
                    <Input value={p.name} placeholder={t("property_name")} className="h-8 max-w-[240px]"
                      onChange={(e) => setProp(p.key, { name: e.target.value })} />
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setProps(props.filter((x) => x.key !== p.key))}><Trash2 /></Button>
                </div>

                {/* Values by kind */}
                {p.kind === "color" && p.defId ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(definitions.find((d) => d.id === p.defId)?.values ?? []).map((v) => {
                      const on = p.chosen.includes(v.value);
                      return (
                        <button key={v.value} type="button" onClick={() => toggleChosen(p.key, v.value)}
                          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[12px] transition-colors ${on ? "border-primary bg-primary-soft text-primary-emphasis" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                          <span className="size-3.5 rounded-full border border-black/10" style={{ background: v.colorHex || "#888" }} />
                          {v.value}
                        </button>
                      );
                    })}
                  </div>
                ) : p.kind === "select" && p.defId ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(definitions.find((d) => d.id === p.defId)?.values ?? []).map((v) => {
                      const on = p.chosen.includes(v.value);
                      return (
                        <button key={v.value} type="button" onClick={() => toggleChosen(p.key, v.value)}
                          className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${on ? "border-primary bg-primary-soft text-primary-emphasis" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                          {v.value}
                        </button>
                      );
                    })}
                  </div>
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
                              {val}
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
                    <Field label={t("cost")}><MoneyInput value={v.cost} onChange={(val) => setVar(v.key, { cost: val })} /></Field>
                    <Field label={t("price")}><MoneyInput value={v.price} onChange={(val) => setVar(v.key, { price: val })} /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t("in_stock")}><Input value={v.qty} inputMode="decimal" placeholder="0" className="font-mono" onChange={(e) => setVar(v.key, { qty: dec(e.target.value) })} /></Field>
                    <Field label={t("reorder_level")}><Input value={v.reorder} inputMode="decimal" placeholder="0" className="font-mono" onChange={(e) => setVar(v.key, { reorder: dec(e.target.value) })} /></Field>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
