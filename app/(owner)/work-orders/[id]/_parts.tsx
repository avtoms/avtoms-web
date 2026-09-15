"use client";
// The order screen's dialogs and small editors — adding and editing lines, the order
// discount, the internal note, assigning a mechanic, the Telegram approval link, the next
// service asked for at hand-back, and this visit's odometer reading. They live apart from the
// page so that the page itself reads as the screen's layout.
import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Send, Check, Bell, Gauge } from "lucide-react";
import { QR, Empty } from "@/components/ui";
import { Card } from "@/components/ui-kit/card";
import { Button } from "@/components/ui-kit/button";
import { UserAvatar } from "@/components/ui-kit/avatar";
import { Textarea } from "@/components/ui-kit/textarea";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { ProductForm } from "@/components/product-form";
import { ServicePicker } from "@/components/service-options";
import { ProductPicker, variantLabel } from "@/components/product-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { cn } from "@/lib/utils";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { useServiceNames } from "@/lib/use-services";
import { money, num, shortDate } from "@/lib/format";
import { kindFromProto, kindIsMaterial, discountFromProto, LINE_ITEM_KINDS, type LineItemKind, type DiscountKind } from "@/lib/enums";
import type { WorkOrder, Staff, MenuItem, Product, PropertyDefinition, CatalogTerm, Contragent, LineItem } from "@/lib/types";
import { MoneyInput, UnitSelect, unitLabel } from "@/components/catalog-fields";
import { SuggestInput } from "@/components/suggest-input";
import { SecTitle } from "../../_shared";

// A single stocked variant, flattened with its product context, for the material picker.
export type PickVariant = { id: string; name: string; unit?: string; unitPrice?: string; unitCost?: string; quantityOnHand: number };

// Flatten a product list to its active variants; each row's name combines the
// product name with the variant's property values (e.g. "T-Shirt · M · Red").
export function flattenVariants(products: Product[]): PickVariant[] {
  const out: PickVariant[] = [];
  for (const p of products) {
    for (const v of p.variants ?? []) {
      if (!v.active || !v.id) continue;
      const label = (v.attributes ?? []).map((a) => a.value).join(" · ");
      out.push({
        id: v.id,
        name: label ? `${p.name} · ${label}` : p.name,
        unit: p.unit,
        unitPrice: v.unitPrice,
        unitCost: v.unitCost,
        quantityOnHand: v.quantityOnHand,
      });
    }
  }
  return out;
}

export const NONE = "__none"; // Radix Select forbids empty item values; sentinel for "unassigned".

export function menuName(m: MenuItem, lang: string): string {
  return lang === "uzc" ? m.nameUzCyrl : lang === "ru" ? m.nameRu : m.nameUzLatn;
}

export type LineItemInput = {
  kind: LineItemKind; description: string; unitPrice: number; quantity: number;
  cost?: number; menuItemId?: string; menuOptionId?: string; defaultPrice?: number; variantId?: string; consumedQty?: number;
  // The unit of measure, as a symbol. It goes over the wire as its own field so the line can
  // be read in any language; it is never appended to `description`.
  unit?: string;
};

/* ── estimate approval (Telegram) ── */
export function ApprovalModal({ approval, onClose }: { approval: { deepLink: string; botUsername: string } | null; onClose: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const configured = !!approval?.deepLink;
  const copy = () => { if (approval?.deepLink) { navigator.clipboard?.writeText(approval.deepLink); toast(t("copied"), { icon: "check" }); } };
  return (
    <Dialog open={!!approval} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader><DialogTitle>{t("request_approval")}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          {!configured ? (
            <div className="text-[13.5px] leading-relaxed text-ink-2">{t("telegram_not_configured")}</div>
          ) : (
            <div className="flex flex-col items-center gap-3.5 pb-1">
              <div className="text-center text-[13.5px] leading-relaxed text-ink-2">{t("approval_share_hint")}</div>
              <div className="rounded-[12px] border border-border bg-white p-3"><QR data={approval!.deepLink} size={180} /></div>
              <div className="flex w-full gap-2">
                <Input value={approval!.deepLink} readOnly className="flex-1 font-mono text-[12px]" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="soft" onClick={copy}><Check /> {t("copy")}</Button>
              </div>
              <a href={approval!.deepLink} target="_blank" rel="noreferrer" className="w-full">
                <Button className="w-full"><Send /> {t("open_in_telegram")}</Button>
              </a>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/* ── add line item ── */
// Edit an existing line item in place (draft/editable states). Changes description, agreed
// price, unit cost and quantity; stock for a material line is reconciled by the backend.
export function EditLineItemModal({ item, onClose, onSave, busy }: {
  item: LineItem | null; onClose: () => void; onSave: (lineItemId: string, fields: { description: string; unitPrice: number; quantity: number; cost: number; consumedQty: number }) => void; busy: boolean;
}) {
  const { t } = useLang();
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState("1");
  useEffect(() => {
    if (item) { setDesc(item.description); setPrice(String(num(item.unitPrice))); setCost(String(num(item.cost))); setQty(String(item.quantity || 1)); }
  }, [item]);
  if (!item) return null;
  // A material may carry a fractional quantity (e.g. 3.5 L); a service stays whole.
  const material = kindIsMaterial(kindFromProto(item.kind));

  const save = () => {
    if (!desc.trim() || !price) return;
    const quantity = material ? (parseFloat(qty) || 1) : (parseInt(qty, 10) || 1);
    // Keep the exact stock draw unless it tracked the billing quantity (a directly-picked
    // material), in which case follow the new quantity. Bundled recipe amounts stay fixed.
    const oldQty = item.quantity || 0;
    const oldConsumed = item.consumedQty ?? 0;
    const consumedQty = item.variantId ? (oldConsumed === oldQty ? quantity : oldConsumed) : 0;
    onSave(item.id!, { description: desc.trim(), unitPrice: parseInt(price, 10) || 0, quantity, cost: parseInt(cost, 10) || 0, consumedQty });
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader><DialogTitle>{t("edit")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <Field label={t("description")}><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("description")} /></Field>
          <div className="grid grid-cols-[1fr_76px] gap-2.5">
            <Field label={t("sell_price")}><MoneyInput value={price} onChange={setPrice} /></Field>
            <Field label={t("qty")}><Input value={qty} onChange={(e) => setQty(e.target.value.replace(material ? /[^\d.]/g : /\D/g, ""))} inputMode={material ? "decimal" : "numeric"} className="text-center font-mono" /></Field>
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

// OrderDiscountModal sets or clears the whole-order discount (fixed so'm or percent).
export function OrderDiscountModal({ open, onClose, wo, onSaved }: {
  open: boolean; onClose: () => void; wo: WorkOrder; onSaved: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [kind, setKind] = useState<Exclude<DiscountKind, "none">>("percent");
  const [value, setValue] = useState(""); // fixed: so'm; percent: percent number (may be decimal)
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const k = discountFromProto(wo.discountKind);
    if (k === "percent") { setKind("percent"); setValue(String(num(wo.discountValue) / 100)); }
    else if (k === "fixed") { setKind("fixed"); setValue(String(num(wo.discountValue))); }
    else { setKind("percent"); setValue(""); }
  }, [open, wo]);

  const existing = discountFromProto(wo.discountKind) !== "none";

  const submit = async (clear: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (clear) {
        await api.setOrderDiscount(wo.id, "none", 0);
      } else {
        // percent → basis points (100 = 1%); fixed → so'm as entered.
        const v = kind === "percent" ? Math.round((parseFloat(value) || 0) * 100) : (parseInt(value, 10) || 0);
        await api.setOrderDiscount(wo.id, kind, v);
      }
      toast(t("save"), { icon: "check" });
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader><DialogTitle>{t("order_discount")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <Tabs value={kind} onValueChange={(v) => setKind(v as Exclude<DiscountKind, "none">)}>
            <TabsList className="w-full">
              <TabsTrigger value="percent" className="flex-1">{t("discount_percent")}</TabsTrigger>
              <TabsTrigger value="fixed" className="flex-1">{t("discount_fixed")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Field label={t("discount_value")}>
            {kind === "percent" ? (
              <Input value={value} inputMode="decimal" placeholder="10"
                onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} className="text-center font-mono" />
            ) : (
              <MoneyInput value={value} onChange={setValue} />
            )}
          </Field>
        </DialogBody>
        <DialogFooter>
          {existing && <Button variant="ghost" className="text-destructive hover:bg-destructive-soft mr-auto" disabled={busy} onClick={() => submit(true)}>{t("remove_discount")}</Button>}
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={() => submit(false)}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddLineItemModal({ open, onClose, onAdd, shopId, lang, busy, initialMode = "menu" }: {
  open: boolean; onClose: () => void; onAdd: (items: LineItemInput[]) => void; shopId: string; lang: string; busy: boolean;
  // The order screen has two doors into this dialog — "from the price list" and "add a row" —
  // and each should open on its own tab rather than both landing on the list.
  initialMode?: "menu" | "custom";
}) {
  const { t } = useLang();
  const [mode, setMode] = useState<"menu" | "custom">("menu");
  const [catalog, setCatalog] = useState<"services" | "materials">("services");
  const [picked, setPicked] = useState(false);
  const [kind, setKind] = useState<LineItemKind>("service");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState("1");
  // The unit the picked material is measured in, carried as its own value all the way to the
  // server. Blank for a service, and for a material somebody typed rather than picked.
  const [unit, setUnit] = useState("");
  const [from, setFrom] = useState<{ menuItemId: string; menuOptionId: string; defaultPrice: number }>({ menuItemId: "", menuOptionId: "", defaultPrice: 0 });
  const [fromVariant, setFromVariant] = useState(""); // warehouse variant to consume, if picked from stock
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [parts, setParts] = useState<PickVariant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [mats, setMats] = useState<{ on: boolean; mat: import("@/lib/types").MenuMaterial }[]>([]);
  type Extra = { name: string; qty: string; unit: string; cost: string; price: string; variantId: string };
  const [extras, setExtras] = useState<Extra[]>([]);
  const addExtra = () => setExtras((s) => [...s, { name: "", qty: "1", unit: "pcs", cost: "", price: "", variantId: "" }]);
  const setExtra = (i: number, patch: Partial<Extra>) => setExtras((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const delExtra = (i: number) => setExtras((s) => s.filter((_, j) => j !== i));
  // Warehouse catalog: extra materials can be picked from (or created in) the warehouse.
  const [defs, setDefs] = useState<PropertyDefinition[]>([]);
  const [brands, setBrands] = useState<CatalogTerm[]>([]);
  const [categories, setCategories] = useState<CatalogTerm[]>([]);
  const [contragents, setContragents] = useState<Contragent[]>([]);
  const [creating, setCreating] = useState(false);
  const variantOptions = parts.map((p) => ({ value: p.id, label: p.name }));

  const reset = () => { setPicked(false); setKind("service"); setDesc(""); setPrice(""); setCost(""); setQty("1"); setUnit(""); setFrom({ menuItemId: "", menuOptionId: "", defaultPrice: 0 }); setFromVariant(""); setMats([]); setExtras([]); };

  const loadProducts = useCallback(() => { api.listProducts(shopId).then((ps) => { setProducts(ps); setParts(flattenVariants(ps)); }).catch(() => {}); }, [shopId]);
  const loadContragents = useCallback(() => { api.listContragents().then(setContragents).catch(() => {}); }, []);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode); setCatalog("services"); reset();
    api.listMenuItems(shopId).then((m) => setMenu(m.filter((x) => x.active))).catch(() => {});
    loadProducts();
    api.listPropertyDefinitions().then(setDefs).catch(() => {});
    api.listCatalogTerms("brand").then(setBrands).catch(() => {});
    api.listCatalogTerms("category").then(setCategories).catch(() => {});
    loadContragents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shopId, loadProducts, loadContragents]);

  // Pick a warehouse variant for an extra material row: fill name/unit/cost/price and link it.
  const pickExtraVariant = (i: number, variantId: string) => {
    const v = parts.find((x) => x.id === variantId);
    if (!v) { setExtra(i, { variantId: "" }); return; }
    setExtra(i, { variantId: v.id, name: v.name, unit: v.unit || "pcs", cost: String(num(v.unitCost)), price: String(num(v.unitPrice)) });
  };

  // A service with options is added as one of them: the line reads "Moy almashtirish ·
  // Krossover", it is priced at that option, and it carries the option's id so the order still
  // says which one was sold after the price list has moved on.
  const pickMenu = (m: MenuItem, option?: import("@/lib/types").MenuItemOption) => {
    const price = option ? num(option.price) : num(m.defaultPrice);
    const cost = option ? num(option.cost) : num(m.defaultCost);
    setPicked(true); setKind("service"); setUnit(""); // a service is not measured in litres
    setDesc(option ? `${menuName(m, lang)} · ${option.name}` : menuName(m, lang));
    setPrice(String(price)); setCost(String(cost));
    setFrom({ menuItemId: m.id, menuOptionId: option?.id ?? "", defaultPrice: price });
    setFromVariant("");
    setMats((m.materials ?? []).map((mat) => ({ on: true, mat }))); setExtras([]); setMode("custom");
  };
  const pickPart = (p: PickVariant) => {
    setPicked(true); setKind("material"); setDesc(p.name); setUnit(p.unit || "");
    setPrice(String(num(p.unitPrice))); setCost(String(num(p.unitCost)));
    setFrom({ menuItemId: "", menuOptionId: "", defaultPrice: num(p.unitPrice) }); setFromVariant(p.id); setMats([]); setExtras([]); setMode("custom");
  };
  const matLine = (mat: import("@/lib/types").MenuMaterial): LineItemInput => {
    const q = mat.quantity || 1;
    // Bundled recipe material: billed as a per-unit price × its (possibly fractional) recipe
    // quantity, and drawn from stock at that exact amount via consumed_qty.
    return {
      kind: "material", description: mat.name, unit: mat.unit, unitPrice: num(mat.unitPrice), quantity: q,
      cost: num(mat.unitCost), defaultPrice: num(mat.unitPrice),
      variantId: mat.variantId || undefined,
      consumedQty: mat.variantId ? q : undefined,
    };
  };
  const addCustom = () => {
    if (!desc.trim() || !price) return;
    // Services are whole units; a material may be fractional (e.g. 3.5 L). Quantity is a real
    // number now, so the line total is unit_price × quantity and, for a stock material, exactly
    // that amount is drawn from the warehouse (consumed_qty).
    const q = kind === "material" ? (parseFloat(qty) || 1) : (parseInt(qty, 10) || 1);
    const items: LineItemInput[] = [{
      kind, description: desc.trim(), unit: kind === "material" ? unit : "",
      unitPrice: parseInt(price, 10) || 0, quantity: q, cost: parseInt(cost, 10) || 0,
      menuItemId: from.menuItemId || undefined, menuOptionId: from.menuOptionId || undefined,
      defaultPrice: from.defaultPrice || undefined,
      variantId: kind === "material" && fromVariant ? fromVariant : undefined,
      consumedQty: kind === "material" && fromVariant ? q : undefined,
    }];
    if (kind === "service") {
      for (const m of mats) if (m.on) items.push(matLine(m.mat));
      for (const e of extras) {
        if (!e.name.trim()) continue;
        const eqty = parseFloat(e.qty) || 1;
        items.push({
          kind: "material", description: e.name.trim(), unit: e.unit,
          unitPrice: parseInt(e.price, 10) || 0, quantity: eqty, cost: parseInt(e.cost, 10) || 0,
          variantId: e.variantId || undefined,
          consumedQty: e.variantId ? eqty : undefined,
        });
      }
    }
    onAdd(items);
  };

  const agreed = parseInt(price, 10) || 0;
  const discount = from.defaultPrice > agreed ? from.defaultPrice - agreed : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader><DialogTitle>{t("add_item")}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          <Tabs value={mode} onValueChange={(v) => { const nv = v as "menu" | "custom"; if (nv === "custom" && mode === "menu") reset(); setMode(nv); }} className="mb-4">
            <TabsList className="w-full"><TabsTrigger value="menu" className="flex-1">{t("from_menu")}</TabsTrigger><TabsTrigger value="custom" className="flex-1">{t("custom_item")}</TabsTrigger></TabsList>
          </Tabs>
          {mode === "menu" ? (
            <div className="flex flex-col gap-2.5">
              <Tabs value={catalog} onValueChange={(v) => setCatalog(v as "services" | "materials")}>
                <TabsList className="w-full"><TabsTrigger value="services" className="flex-1">{t("services")}</TabsTrigger><TabsTrigger value="materials" className="flex-1">{t("materials")}</TabsTrigger></TabsList>
              </Tabs>
              {catalog === "services" ? (
                <div className="max-h-[340px] overflow-y-auto">
                  {menu.length === 0 ? <Empty icon="list" text={t("empty")} />
                    : <ServicePicker items={menu} nameOf={(m) => menuName(m, lang)} disabled={busy} onPick={pickMenu} />}
                </div>
              ) : (
                  /* Products first, variants on tap: a flat list of every variant of every
                     product is hundreds of rows to scroll to reach one filter. */
                  <ProductPicker
                    products={products}
                    onPick={(prod, v) => pickPart({
                      id: v.id!,
                      name: variantLabel(v) ? `${prod.name} · ${variantLabel(v)}` : prod.name,
                      unit: prod.unit,
                      unitPrice: v.unitPrice,
                      unitCost: v.unitCost,
                      quantityOnHand: num(v.quantityOnHand),
                    })}
                    maxHeight={300}
                    emptyText={t("empty")}
                  />
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {!picked && (
                <Tabs value={kind} onValueChange={(v) => setKind(v as LineItemKind)}>
                  <TabsList className="w-full">{LINE_ITEM_KINDS.map((k) => <TabsTrigger key={k} value={k} className="flex-1">{t(k)}</TabsTrigger>)}</TabsList>
                </Tabs>
              )}
              {/* A custom line is usually a job the shop does often but never put on the menu.
                  Offering the menu here means it is at least written the same way each time. */}
              <Field label={t("description")}>
                <SuggestInput value={desc} options={menu.map((m) => menuName(m, lang))} onChange={setDesc} placeholder={t("description")} />
              </Field>
              <div className="grid grid-cols-[1fr_76px] gap-2.5">
                <Field label={t("sell_price")}><MoneyInput value={price} onChange={setPrice} /></Field>
                {/* Services are billed in whole units; a separately-added material may be
                    fractional (e.g. 3.5 L of oil), so it accepts a decimal quantity. */}
                {/* Naming the unit on the label is how "4" stops being ambiguous — four
                    litres, not four bottles — without it being written into the item's name. */}
                <Field label={unit ? `${t("qty")}, ${unitLabel(t, unit)}` : t("qty")}><Input value={qty} onChange={(e) => setQty(e.target.value.replace(kind === "material" ? /[^\d.]/g : /\D/g, ""))} inputMode={kind === "material" ? "decimal" : "numeric"} className="text-center font-mono" /></Field>
              </div>
              {from.defaultPrice > 0 && (
                <div className="flex justify-between gap-2 text-[12.5px] text-muted-foreground">
                  <span>{t("menu_price")}: <span className="font-mono">{money(from.defaultPrice)}</span></span>
                  {discount > 0 && <span className="text-primary-emphasis">{t("discount")}: −{money(discount)}</span>}
                </div>
              )}
              {kind === "service" && (
                <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{t("materials_needed")}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setCreating(true)}><Plus /> {t("new_product")}</Button>
                      <Button variant="soft" size="sm" onClick={addExtra}><Plus /> {t("add_material")}</Button>
                    </div>
                  </div>
                  {mats.map((m, i) => (
                    <button key={i} type="button" onClick={() => setMats((s) => s.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                      className={cn("flex items-center gap-2.5 rounded-[9px] border px-2.5 py-2 text-left transition-colors", m.on ? "border-primary bg-primary-soft" : "border-border bg-card")}>
                      <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px]", m.on ? "border-primary-emphasis bg-primary-emphasis" : "border-input")}>{m.on && <Check className="size-3 text-white" />}</span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">{m.mat.name}{m.mat.unit ? ` · ${m.mat.quantity} ${m.mat.unit}` : m.mat.quantity > 1 ? ` ×${m.mat.quantity}` : ""}</span>
                      <span className="font-mono text-[12.5px] font-bold text-ink-2">{money(Math.round(num(m.mat.unitPrice) * (m.mat.quantity || 1)))}</span>
                    </button>
                  ))}
                  {extras.map((e, i) => (
                    <div key={i} className="flex flex-col gap-2.5 rounded-[10px] border border-border bg-secondary/30 p-2.5">
                      {/* warehouse picker + remove */}
                      <div className="flex items-end gap-2">
                        <Field label={t("from_warehouse")} className="flex-1">
                          <SearchSelect
                            value={e.variantId}
                            options={variantOptions}
                            placeholder={t("choose_from_warehouse")}
                            onChange={(v) => pickExtraVariant(i, v)}
                          />
                        </Field>
                        <Button variant="ghost" size="icon" onClick={() => delExtra(i)} aria-label="remove" className="mb-0.5 shrink-0 text-destructive hover:bg-destructive-soft"><Trash2 /></Button>
                      </div>
                      {/* material name (auto-filled from the warehouse; editable for ad-hoc) */}
                      <Field label={t("material_name")}>
                        <Input value={e.name} placeholder={t("material_name")} onChange={(ev) => setExtra(i, { name: ev.target.value, variantId: "" })} />
                      </Field>
                      <div className="grid grid-cols-3 items-end gap-2">
                        <Field label={t("qty")}>
                          <Input value={e.qty} inputMode="decimal" onChange={(ev) => setExtra(i, { qty: ev.target.value.replace(/[^\d.]/g, "") })} className="h-10 text-center font-mono" />
                        </Field>
                        <Field label={t("unit")}>
                          <UnitSelect value={e.unit} onChange={(v) => setExtra(i, { unit: v })} style={{ height: 40, paddingTop: 0, paddingBottom: 0 }} />
                        </Field>
                        <Field label={t("price")}>
                          <MoneyInput value={e.price} onChange={(v) => setExtra(i, { price: v })} placeholder={t("price")} hideHint style={{ height: 40, paddingTop: 0, paddingBottom: 0 }} />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogBody>
        {mode === "custom" && (
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
            <Button disabled={busy} onClick={addCustom}><Plus /> {t("add")}</Button>
          </DialogFooter>
        )}
      </DialogContent>

      {/* Create a warehouse product without leaving the line-item editor. */}
      <ProductForm
        open={creating}
        mode="new"
        product={null}
        shopId={shopId}
        definitions={defs}
        brands={brands}
        categories={categories}
        contragents={contragents}
        onContragentsChange={loadContragents}
        onClose={() => setCreating(false)}
        onSaved={loadProducts}
      />
    </Dialog>
  );
}

/* ── assign mechanic ── */
// NotesCard is the order's free-text note: what the customer asked for, what to watch for
// next time, who collected it. Internal to the shop — it is not printed on the customer's
// check or sent with their copy — and editable at any point in the order's life, because
// the useful moment to write one is often after the work is finished.
export function NotesCard({ wo, onSaved }: { wo: WorkOrder; onSaved: (w: WorkOrder) => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(wo.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Re-sync when the order reloads under us, but never while the user is mid-edit —
  // a background refresh must not eat what they are typing.
  useEffect(() => { if (!editing) setDraft(wo.notes ?? ""); }, [wo.notes, editing]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      onSaved(await api.setNotes(wo.id, draft.trim()));
      setEditing(false);
      toast(t("save"), { icon: "check" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const has = (wo.notes ?? "").trim().length > 0;
  if (!editing && !has) {
    return (
      <Card className="p-4">
        <button onClick={() => { setDraft(""); setEditing(true); }}
          className="flex min-h-11 w-full items-center gap-2 text-left text-[13.5px] font-semibold text-muted-foreground hover:text-foreground sm:min-h-0">
          <Plus className="size-4" /> {t("add_note")}
        </button>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <SecTitle>{t("notes")}</SecTitle>
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">{t("edit")}</button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2.5">
          <Textarea value={draft} rows={4} maxLength={4000} autoFocus
            placeholder={t("note_placeholder")}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)} />
          <div className="flex items-center gap-2">
            <Button disabled={saving} onClick={save}>{saving ? <Spinner /> : t("save")}</Button>
            <Button variant="secondary" disabled={saving}
              onClick={() => { setDraft(wo.notes ?? ""); setEditing(false); }}>{t("cancel")}</Button>
            <span className="ml-auto text-[12px] text-muted-foreground">{t("note_internal_hint")}</span>
          </div>
        </div>
      ) : (
        <div className="whitespace-pre-wrap text-[14px] text-ink-2">{wo.notes}</div>
      )}
    </Card>
  );
}

export function AssignModal({ open, onClose, mechanics, current, onPick }: { open: boolean; onClose: () => void; mechanics: Staff[]; current?: string; onPick: (id: string) => void }) {
  const { t } = useLang();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader><DialogTitle>{t("assign")}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          <div className="flex flex-col gap-2 pb-1">
            {mechanics.length === 0 && <Empty icon="team" text={t("empty")} />}
            {mechanics.map((m) => (
              <button key={m.id} onClick={() => onPick(m.id)} className={cn("flex items-center gap-3 rounded-[9px] border bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary", current === m.id ? "border-primary" : "border-border")}>
                <UserAvatar name={m.name} className="size-9" />
                <div className="flex-1"><div className="text-[14.5px] font-semibold text-foreground">{m.name}</div><div className="font-mono text-[12px] text-muted-foreground">{m.phone}</div></div>
                {current === m.id && <Check className="size-[18px] text-primary-emphasis" />}
              </button>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/* ── next service, asked at the moment the car goes back ── */
// A reminder is set as an INTERVAL — every 6 months, every 10 000 km — rather than as a date,
// because that is how a shop actually thinks about servicing and how the customer will hear
// it. The date and odometer target are worked out from the interval and shown, so nobody has
// to do the arithmetic or trust that it was done right.
//
// Both bounds are honoured: whichever comes first is when the reminder is due. Only the date
// can fire on its own, since the shop does not see the car's odometer in between visits — the
// km target is what the reminder tells the customer when it does.
//
// The chips are the shop's own price list where there is one — this dialog opens straight
// after a job that is on that list, so the next one almost always is too. These generic ones
// are the fallback for a shop that has not filled its price list in yet.
const NEXT_PRESETS: { key: string; months: number; km: number }[] = [
  { key: "preset_oil", months: 6, km: 10000 },
  { key: "preset_inspection", months: 12, km: 0 },
  { key: "preset_air_filter", months: 12, km: 15000 },
];

export function NextServiceModal({ open, onClose, wo, shopId }: {
  open: boolean; onClose: () => void; wo: WorkOrder; shopId: string;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [months, setMonths] = useState("6");
  const [km, setKm] = useState("10000");
  const [currentKm, setCurrentKm] = useState("");
  const [busy, setBusy] = useState(false);
  const services = useServiceNames();

  useEffect(() => {
    if (!open) return;
    setTitle(t("preset_oil"));
    setMonths("6");
    setKm("10000");
    // The odometer the gateway carried over from the vehicle, so the usual case is one tap.
    // This visit's own reading first — it is what somebody looked at on the dash today; the
    // car's stored mileage is the fallback for an order where nobody wrote it down.
    setCurrentKm(num(wo.odometer) > 0 ? String(num(wo.odometer)) : num(wo.mileage) > 0 ? String(num(wo.mileage)) : "");
  }, [open, wo.mileage, t]);

  const m = parseInt(months, 10) || 0;
  const k = parseInt(km, 10) || 0;
  const cur = parseInt(currentKm, 10) || 0;
  // Its own services first; the generic list only while it has none.
  const chips: { label: string; months?: number; km?: number }[] = services.length > 0
    ? services.slice(0, 6).map((name) => ({ label: name }))
    : NEXT_PRESETS.map((p) => ({ label: t(p.key), months: p.months, km: p.km }));
  const due = m > 0 ? new Date(new Date().setMonth(new Date().getMonth() + m)) : null;
  const dueKm = k > 0 && cur > 0 ? cur + k : 0;

  const save = async () => {
    if (!title.trim() || busy || (m <= 0 && k <= 0)) return;
    setBusy(true);
    try {
      await api.createReminder(shopId, {
        title: title.trim(),
        vehicleId: wo.vehicleId,
        customerName: wo.customerName ?? "",
        phone: wo.customerPhone ?? "",
        plate: wo.plate ?? "",
        dueDate: due ? due.toISOString() : undefined,
        dueMileage: dueKm,
        repeatMonths: m,
        repeatKm: k,
      });
      // The same reading is this visit's line in the service book. Handing the car back is
      // the moment somebody actually looks at the dashboard, so it is the honest place to
      // take it. Best-effort: the reminder is already saved and is what was asked for.
      //
      // It is deliberately not written back to the VEHICLE's mileage: that would mean
      // re-sending every one of its other fields, and getting one wrong would quietly blank
      // real data. The book only needs the reading against the visit.
      if (cur > 0) {
        try { await api.setOdometer(wo.id, cur); } catch { /* the reminder is what mattered */ }
      }
      toast(t("reminders_saved"), { icon: "check" });
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader><DialogTitle>{t("next_service")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <p className="text-[12.5px] leading-snug text-muted-foreground">{t("next_service_hint")}</p>

          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <Button key={c.label} type="button" variant="secondary" size="sm"
                onClick={() => {
                  setTitle(c.label);
                  // A price-list service says nothing about how often it comes round, so the
                  // interval already on screen is kept rather than blanked — it is the one
                  // thing in this dialog that cannot be worked out from the job just done.
                  if (c.months !== undefined) { setMonths(String(c.months)); setKm(c.km ? String(c.km) : ""); }
                }}>
                {c.label}
              </Button>
            ))}
          </div>

          <Field label={t("reminder_title")} hint={services.length > 0 ? t("from_price_list") : undefined}>
            <SuggestInput value={title} options={services} max={20} onChange={setTitle} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("every_months")}>
              <Input value={months} inputMode="numeric" className="font-mono" placeholder="6"
                onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label={t("every_km")}>
              <Input value={km} inputMode="numeric" className="font-mono" placeholder="10000"
                onChange={(e) => setKm(e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          <Field label={t("current_km")} hint={wo.plate}>
            <Input value={currentKm} inputMode="numeric" className="font-mono"
              onChange={(e) => setCurrentKm(e.target.value.replace(/\D/g, ""))} />
          </Field>

          {/* What the interval actually works out to, so it is checked rather than trusted. */}
          {(due || dueKm > 0) && (
            <div className="flex items-baseline justify-between rounded-[10px] bg-secondary/60 px-3.5 py-2.5">
              <span className="text-[12.5px] font-semibold text-muted-foreground">{t("due_at")}</span>
              <span className="font-mono text-[13.5px] font-bold text-foreground">
                {[due ? shortDate(due.toISOString()) : "", dueKm > 0 ? `${dueKm.toLocaleString("ru-RU")} km` : ""]
                  .filter(Boolean).join(" · ")}
              </span>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("skip_reminder")}</Button>
          <Button disabled={busy || !title.trim() || (m <= 0 && k <= 0)} onClick={save}>
            {busy ? <Spinner /> : <><Bell /> {t("add_next_service")}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── the reading for this visit ── */
// Editable for the whole life of the order, and after it: the reliable moment to read a
// dashboard is whenever the car is actually there, which is rarely when a form is open.
// Empty says so in words instead of showing 0 km, which would read as a fact about the car.
export function OdometerField({ wo, onSaved }: { wo: WorkOrder; onSaved: (wo: WorkOrder) => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const odo = num(wo.odometer);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      onSaved(await api.setOdometer(wo.id, parseInt(value, 10) || 0));
      setEditing(false);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally { setBusy(false); }
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Gauge className="size-3.5 text-muted-foreground" />
        <Input value={value} inputMode="numeric" autoFocus placeholder="82000"
          className="h-7 w-[110px] font-mono text-[12.5px]"
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(false); }} />
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save()}>{busy ? <Spinner /> : <Check />}</Button>
      </span>
    );
  }
  return (
    <button
      onClick={() => { setValue(odo > 0 ? String(odo) : ""); setEditing(true); }}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-[7px] px-2 py-0.5 text-[12.5px] text-muted-foreground hover:bg-secondary hover:text-foreground sm:min-h-0 sm:px-1"
    >
      <Gauge className="size-3.5" />
      {odo > 0
        ? <span className="font-mono font-semibold text-foreground">{odo.toLocaleString("ru-RU")} km</span>
        : <span>{t("sb_no_reading")}</span>}
    </button>
  );
}
