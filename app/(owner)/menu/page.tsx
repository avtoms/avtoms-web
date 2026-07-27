"use client";
// Pricing menu (price list): list services with localized name + price; create AND edit
// each item. Editing logs a price-change history (viewable in the edit modal); existing
// work orders keep the price they were created with (line-item snapshot), so edits are safe.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner, Switch } from "@/components/ui-kit/misc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
import { MoneyInput, UnitSelect } from "@/components/catalog-fields";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { ProductForm } from "@/components/product-form";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num, durationFmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MenuItem, MenuPriceChange, Product, PropertyDefinition, CatalogTerm, Contragent } from "@/lib/types";

// A pickable warehouse variant, flattened with its product context, for material rows.
type PickVar = { id: string; label: string; unit: string; cost: number; price: number };
function flattenVariants(products: Product[]): PickVar[] {
  const out: PickVar[] = [];
  for (const p of products) {
    for (const v of p.variants ?? []) {
      if (!v.active || !v.id) continue;
      const vl = (v.attributes ?? []).map((a) => a.value).join(" · ");
      out.push({ id: v.id, label: vl ? `${p.name} · ${vl}` : p.name, unit: p.unit ?? "", cost: num(v.unitCost), price: num(v.unitPrice) });
    }
  }
  return out;
}

function menuName(m: MenuItem, lang: string): string {
  return lang === "uzc" ? m.nameUzCyrl : lang === "ru" ? m.nameRu : m.nameUzLatn;
}

export default function MenuPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { lang, t } = useLang();
  const { toast } = useToast();

  const [list, setList] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listMenuItems(shopId)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo<ColumnDef<MenuItem>[]>(() => [
    {
      id: "name",
      accessorFn: (m) => `${menuName(m, lang)} ${m.category || ""}`,
      header: ({ column }) => <SortHeader column={column}>{t("service_name")}</SortHeader>,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className={cn("min-w-0", !m.active && "opacity-55")}>
            <div className="truncate text-[14px] font-semibold text-foreground">{menuName(m, lang)}</div>
            {(m.category || num(m.estimatedMinutes) > 0) && (
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11.5px] text-muted-foreground">
                {m.category && <span>{m.category}</span>}
                {num(m.estimatedMinutes) > 0 && <span>· {durationFmt(num(m.estimatedMinutes))}</span>}
              </div>
            )}
            {m.materials && m.materials.length > 0 && (
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                <span className="font-semibold">{t("materials_needed")}:</span>{" "}
                {m.materials.map((x) => x.name + (x.unit ? ` · ${x.quantity} ${x.unit}` : x.quantity > 1 ? " ×" + x.quantity : "")).join(", ")}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: "price",
      accessorFn: (m) => num(m.defaultPrice),
      header: ({ column }) => <SortHeader column={column}>{t("price")}</SortHeader>,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div>
            <div className="font-mono text-[14px] font-bold text-foreground">{money(m.defaultPrice)}</div>
            {num(m.defaultCost) > 0 && <div className="font-mono text-[11.5px] text-muted-foreground">{t("cost")}: {money(m.defaultCost!)}</div>}
          </div>
        );
      },
    },
    {
      id: "status",
      accessorFn: (m) => (m.active ? "active" : "inactive"),
      header: ({ column }) => <SortHeader column={column}>{t("status")}</SortHeader>,
      cell: ({ row }) => (
        <Badge tone={row.original.active ? "ok" : "neutral"} dot>{row.original.active ? t("active") : t("inactive")}</Badge>
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      header: () => <span className="sr-only">{t("edit")}</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end text-muted-foreground">
          <Button variant="ghost" size="icon-sm" onClick={(ev) => { ev.stopPropagation(); setEditing(row.original); }} aria-label={t("edit")}><Pencil /></Button>
          <ChevronRight className="size-4" />
        </div>
      ),
    },
  ], [lang, t]);

  return (
    <div className="flex flex-col gap-4">
      {loading && list.length === 0 ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="an-skel h-11 w-full rounded-[8px]" />)}</Card>
      ) : (
        <DataTable
          columns={columns}
          data={list}
          searchPlaceholder={t("search") + "…"}
          emptyText={t("empty")}
          toolbar={<Button onClick={() => setAdding(true)}><Plus /> {t("add_service")}</Button>}
          columnLabels={{ name: t("service_name"), price: t("price"), status: t("status") }}
          onRowClick={(m) => setEditing(m)}
          pageSize={12}
        />
      )}
      <MenuModal open={adding} onClose={() => setAdding(false)} shopId={shopId} onSaved={() => load()} />
      <MenuModal open={!!editing} item={editing} onClose={() => setEditing(null)} shopId={shopId} onSaved={() => load()} />
    </div>
  );
}

type MatRow = { name: string; qty: string; unit: string; cost: string; price: string; variantId: string };
const emptyForm = { name: "", category: "", minutes: "", price: "", cost: "" };

function MenuModal({ open, onClose, shopId, item, onSaved }: { open: boolean; onClose: () => void; shopId: string; item?: MenuItem | null; onSaved: () => void }) {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const isEdit = !!item;
  const [f, setF] = useState(emptyForm);
  const [active, setActive] = useState(true);
  const [materials, setMaterials] = useState<MatRow[]>([]);
  const [history, setHistory] = useState<MenuPriceChange[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Warehouse catalog: materials are picked from (or created in) the warehouse.
  const [products, setProducts] = useState<Product[]>([]);
  const [defs, setDefs] = useState<PropertyDefinition[]>([]);
  const [brands, setBrands] = useState<CatalogTerm[]>([]);
  const [categories, setCategories] = useState<CatalogTerm[]>([]);
  const [contragents, setContragents] = useState<Contragent[]>([]);
  const [creating, setCreating] = useState(false);
  const variants = useMemo(() => flattenVariants(products), [products]);
  const variantOptions = useMemo(() => variants.map((v) => ({ value: v.id, label: v.label })), [variants]);

  const loadProducts = useCallback(() => { api.listProducts(shopId).then(setProducts).catch(() => {}); }, [shopId]);
  const loadContragents = useCallback(() => { api.listContragents().then(setContragents).catch(() => {}); }, []);

  useEffect(() => {
    if (!open) return;
    loadProducts();
    api.listPropertyDefinitions().then(setDefs).catch(() => {});
    api.listCatalogTerms("brand").then(setBrands).catch(() => {});
    api.listCatalogTerms("category").then(setCategories).catch(() => {});
    loadContragents();
    if (item) {
      setF({ name: menuName(item, lang), category: item.category ?? "", minutes: item.estimatedMinutes ? String(item.estimatedMinutes) : "", price: String(num(item.defaultPrice)), cost: item.defaultCost ? String(num(item.defaultCost)) : "" });
      setActive(item.active);
      setMaterials((item.materials ?? []).map((x) => ({ name: x.name, qty: String(x.quantity), unit: x.unit ?? "pcs", cost: x.unitCost ? String(num(x.unitCost)) : "", price: x.unitPrice ? String(num(x.unitPrice)) : "", variantId: x.variantId ?? "" })));
      setHistory(null);
      api.listMenuPriceHistory(item.id).then(setHistory).catch(() => setHistory([]));
    } else {
      setF(emptyForm); setActive(true); setMaterials([]); setHistory(null);
    }
  }, [open, item, lang, loadProducts, loadContragents]);

  const setMat = (i: number, patch: Partial<MatRow>) => setMaterials((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addMat = () => setMaterials((rows) => [...rows, { name: "", qty: "1", unit: "pcs", cost: "", price: "", variantId: "" }]);
  const delMat = (i: number) => setMaterials((rows) => rows.filter((_, j) => j !== i));

  // Pick a warehouse variant for a material row: fill name/unit/cost/price and link it.
  const pickVariant = (i: number, variantId: string) => {
    const v = variants.find((x) => x.id === variantId);
    if (!v) { setMat(i, { variantId: "" }); return; }
    setMat(i, { variantId: v.id, name: v.label, unit: v.unit || "pcs", cost: v.cost ? String(v.cost) : "", price: v.price ? String(v.price) : "" });
  };

  const save = async () => {
    if (!f.name.trim() || !f.price || busy) return;
    setBusy(true);
    const payload = {
      name: f.name.trim(),
      defaultPrice: parseInt(f.price, 10) || 0,
      defaultCost: parseInt(f.cost, 10) || 0,
      category: f.category.trim(),
      estimatedMinutes: parseInt(f.minutes, 10) || 0,
      materials: materials.filter((m) => m.name.trim()).map((m) => ({
        name: m.name.trim(), quantity: parseFloat(m.qty) || 1, unit: m.unit,
        unitCost: parseInt(m.cost, 10) || 0, unitPrice: parseInt(m.price, 10) || 0,
        variantId: m.variantId || undefined,
      })),
    };
    try {
      if (item) await api.updateMenuItem(item.id, { ...payload, active });
      else await api.createMenuItem(shopId, payload);
      toast(t("save"), { icon: "check" }); onClose(); onSaved();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  const numInput = (v: string, on: (s: string) => void, ph = "0") => (
    <Input value={v} onChange={(e) => on(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={ph} className="font-mono" />
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader><DialogTitle>{isEdit ? t("edit") : t("add_service")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          <Field label={t("service_name")}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("category")}><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
            <Field label={t("est_time")}>{numInput(f.minutes, (s) => setF({ ...f, minutes: s }))}</Field>
          </div>
          <Field label={t("sell_price") + " (" + t("soum") + ")"}><MoneyInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>

          {isEdit && (
            <div className="flex items-center justify-between rounded-[9px] border border-border bg-card px-3.5 py-2.5">
              <span className="text-[13.5px] font-semibold text-ink-2">{t("active")}</span>
              <div className="flex items-center gap-2.5">
                <Badge tone={active ? "ok" : "neutral"} dot>{active ? t("active") : t("inactive")}</Badge>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
            </div>
          )}

          {/* materials editor — sourced from the warehouse */}
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-semibold text-muted-foreground">{t("materials_needed")}</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreating(true)}><Plus /> {t("new_product")}</Button>
              <Button variant="soft" size="sm" onClick={addMat}><Plus /> {t("add_material")}</Button>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            {materials.map((m, i) => (
              <div key={i} className="flex flex-col gap-2.5 rounded-[10px] border border-border bg-secondary/30 p-2.5">
                {/* line 1: warehouse picker + remove */}
                <div className="flex items-end gap-2">
                  <Field label={t("from_warehouse")} className="flex-1">
                    <SearchSelect
                      value={m.variantId}
                      options={variantOptions}
                      placeholder={t("choose_from_warehouse")}
                      onChange={(v) => pickVariant(i, v)}
                    />
                  </Field>
                  <Button variant="ghost" size="icon" onClick={() => delMat(i)} aria-label="remove" className="mb-0.5 shrink-0 text-destructive hover:bg-destructive-soft"><Trash2 /></Button>
                </div>
                {/* material name (auto-filled from the warehouse; editable for ad-hoc) */}
                <Field label={t("material_name")}>
                  <Input value={m.name} placeholder={t("material_name")} onChange={(e) => setMat(i, { name: e.target.value, variantId: "" })} />
                </Field>
                {/* line 2: qty · unit · cost · price */}
                <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
                  <Field label={t("qty")}>
                    <Input value={m.qty} placeholder="0" inputMode="decimal" onChange={(e) => setMat(i, { qty: e.target.value.replace(/[^\d.]/g, "") })} className="h-10 font-mono text-center" />
                  </Field>
                  <Field label={t("unit")}>
                    <UnitSelect value={m.unit} onChange={(v) => setMat(i, { unit: v })} style={{ height: 40, paddingTop: 0, paddingBottom: 0 }} />
                  </Field>
                  <Field label={t("cost")}>
                    <MoneyInput value={m.cost} onChange={(v) => setMat(i, { cost: v })} placeholder={t("cost")} hideHint style={{ height: 40, paddingTop: 0, paddingBottom: 0 }} />
                  </Field>
                  <Field label={t("price")}>
                    <MoneyInput value={m.price} onChange={(v) => setMat(i, { price: v })} placeholder={t("price")} hideHint style={{ height: 40, paddingTop: 0, paddingBottom: 0 }} />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          {/* price-change history (edit only) */}
          {isEdit && (
            <div className="mt-1">
              <div className="mb-1.5 text-[12.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{t("price_history")}</div>
              {history === null ? <div className="flex justify-center py-3.5"><Spinner /></div>
                : history.length === 0 ? <div className="px-0.5 py-1 text-[12.5px] text-muted-foreground">{t("no_price_changes")}</div>
                : <div className="flex flex-col gap-1.5">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 rounded-[8px] bg-secondary px-2.5 py-1.5 text-[12.5px] text-ink-2">
                      <span className="font-mono text-muted-foreground">{money(h.oldPrice)}</span>
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                      <span className="font-mono font-bold text-foreground">{money(h.newPrice)}</span>
                      <span className="ml-auto font-mono text-[11.5px] text-muted-foreground">{new Date(h.changedAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>

      {/* Create a warehouse product without leaving the service editor. */}
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
