"use client";
// Create/edit a warehouse product: shared fields, a property editor (e.g. Size ->
// S/M/L), and a variant grid generated from the property-value combinations. Each
// variant carries its own SKU, cost, price, stock and reorder level.
import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Badge } from "@/components/ui-kit/badge";
import { Spinner } from "@/components/ui-kit/misc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
import { MoneyInput, UnitSelect } from "@/components/catalog-fields";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError, type ProductInput } from "@/lib/api";
import type { Product } from "@/lib/types";

type PropRow = { name: string; valuesText: string };
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
// A stable signature for a variant's attribute combination, given the property order.
const sigOf = (props: PropRow[], attrs: Record<string, string>) =>
  props.map((p) => `${p.name}=${attrs[p.name] ?? ""}`).join("|");

// Cartesian product of each property's values, yielding one attrs map per combination.
function combos(props: PropRow[]): Record<string, string>[] {
  const usable = props.filter((p) => p.name.trim() && splitValues(p.valuesText).length > 0);
  if (usable.length === 0) return [];
  let out: Record<string, string>[] = [{}];
  for (const p of usable) {
    const next: Record<string, string>[] = [];
    for (const base of out) {
      for (const val of splitValues(p.valuesText)) {
        next.push({ ...base, [p.name.trim()]: val });
      }
    }
    out = next;
  }
  return out;
}

let keySeq = 0;
const newKey = () => `v${keySeq++}`;
const blankVar = (attrs: Record<string, string> = {}): VarRow => ({
  key: newKey(), sku: "", qty: "", reorder: "", cost: "", price: "", active: true, attrs,
});

function fromProduct(p: Product): { props: PropRow[]; vars: VarRow[] } {
  const props: PropRow[] = (p.properties ?? []).map((pp) => ({
    name: pp.name, valuesText: (pp.values ?? []).join(", "),
  }));
  const vars: VarRow[] = (p.variants ?? []).map((v) => {
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
  return { props, vars: vars.length ? vars : [blankVar()] };
}

export function ProductForm({
  open, mode, product, shopId, onClose, onSaved,
}: {
  open: boolean;
  mode: "new" | "edit";
  product: Product | null;
  shopId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [description, setDescription] = useState("");
  const [props, setProps] = useState<PropRow[]>([]);
  const [vars, setVars] = useState<VarRow[]>([blankVar()]);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && product) {
      setName(product.name);
      setCategory(product.category ?? "");
      setSupplier(product.supplier ?? "");
      setUnit(product.unit || "pcs");
      setDescription(product.description ?? "");
      const { props: p, vars: v } = fromProduct(product);
      setProps(p);
      setVars(v);
    } else {
      setName(""); setCategory(""); setSupplier(""); setUnit("pcs"); setDescription("");
      setProps([]); setVars([blankVar()]);
    }
  }, [open, mode, product]);

  const hasProps = props.some((p) => p.name.trim() && splitValues(p.valuesText).length > 0);

  // Regenerate the variant grid from the current property combinations, preserving
  // any data already entered for a combination that still exists.
  const generate = () => {
    const wanted = combos(props);
    if (wanted.length === 0) {
      setVars((prev) => (prev.length ? prev : [blankVar()]));
      return;
    }
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
    if (activeVars.length === 0) {
      toast(t("no_variants"), { icon: "alert", tone: "danger" });
      return;
    }
    const payload: ProductInput = {
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      unit,
      supplier: supplier.trim(),
      properties: props
        .filter((p) => p.name.trim() && splitValues(p.valuesText).length > 0)
        .map((p) => ({ name: p.name.trim(), values: splitValues(p.valuesText) })),
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
      if (mode === "edit" && product) {
        await api.updateProduct(product.id, { ...payload, active: product.active });
      } else {
        await api.createProduct(shopId, payload);
      }
      toast(t("save"), { icon: "check" });
      onClose();
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? t("edit_product") : t("add_part")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto py-1">
          {/* Shared product fields */}
          <Field label={t("product_name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-[1fr_1fr_80px] gap-2.5">
            <Field label={t("category")}><Input value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
            <Field label={t("supplier")}><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
            <Field label={t("unit")}><UnitSelect value={unit} onChange={setUnit} /></Field>
          </div>
          <Field label={t("description")}>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          {/* Property editor */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{t("properties")}</span>
              <Button variant="ghost" size="sm" onClick={() => setProps([...props, { name: "", valuesText: "" }])}>
                <Plus /> {t("add_property")}
              </Button>
            </div>
            {props.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.4fr_36px] items-center gap-2">
                <Input placeholder={t("property_name")} value={p.name}
                  onChange={(e) => setProps(props.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input placeholder={t("property_values")} value={p.valuesText}
                  onChange={(e) => setProps(props.map((x, j) => (j === i ? { ...x, valuesText: e.target.value } : x)))} />
                <Button variant="ghost" size="sm" onClick={() => setProps(props.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
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
                <Button variant="ghost" size="sm" onClick={() => setVars([...vars, blankVar()])}>
                  <Plus /> {t("add_variant")}
                </Button>
              )}
            </div>
            {vars.length === 0 && <p className="text-[13px] text-muted-foreground">{t("no_variants")}</p>}
            {vars.map((v) => {
              const label = Object.entries(v.attrs).map(([, val]) => val).join(" · ");
              return (
                <div key={v.key} className="flex flex-col gap-2 rounded-[10px] border border-border/60 p-2.5">
                  <div className="flex items-center justify-between">
                    {label
                      ? <Badge tone="neutral">{label}</Badge>
                      : <span className="text-[12px] text-muted-foreground">{t("variant")}</span>}
                    {!hasProps && vars.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setVars(vars.filter((x) => x.key !== v.key))}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2">
                    <Field label="SKU"><Input value={v.sku} className="font-mono" onChange={(e) => setVar(v.key, { sku: e.target.value })} /></Field>
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
