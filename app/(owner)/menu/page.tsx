"use client";
// Services and prices, after the redesign. One row per service: its name with a line of
// context (how often it sold this month, its variants, or that it is switched off), its
// category, how long it takes, the materials it draws from the warehouse — each coloured by
// the stock actually on the shelf — its price (a range when it has variants), and a switch to
// take it off the list. Category tabs and a count of services short of material sit above.
//
// Editing still opens the full form, with options, materials and the price history.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { MoneyInput, UnitSelect, qtyUnit, unitLabel } from "@/components/catalog-fields";
import { useStaffNames } from "@/lib/use-staff";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/page-header";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { canAny } from "@/lib/perms";
import { currentMonth, monthRange } from "@/lib/range";
import { money, num, qty, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tourPrefill } from "@/lib/tour-bridge";
import type { MenuItem, MenuMaterial, MenuPriceChange, Product, PropertyDefinition, CatalogTerm, Contragent } from "@/lib/types";
import { activeOptions, priceLabel } from "@/components/service-options";

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

const ALL = "__all";
type Stock = { qty: number; reorder: number; unit: string };
type Level = "ok" | "low" | "out" | "unknown";

export default function MenuPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { lang, t } = useLang();
  const { toast } = useToast();
  const canStock = canAny(session, "warehouse.view", "warehouse.manage");

  const [list, setList] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  // How many times each service sold this month, by name — the statistics count services by
  // what the line said, which is the service's name at the time.
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [cat, setCat] = useState(ALL);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listMenuItems(shopId)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
    if (canStock) api.listProducts(shopId).then(setProducts).catch(() => {});
    const r = monthRange(currentMonth());
    api.getStatistics(shopId, r.from, r.to).then((st) => {
      const m: Record<string, number> = {};
      for (const s of st.topServices ?? []) m[(s.name || "").trim().toLowerCase()] = s.times ?? num(s.quantity);
      setUsage(m);
    }).catch(() => {});
  }, [shopId, canStock, t, toast]);

  useEffect(() => { load(); }, [load]);

  // What the shelf holds for each variant a service draws on.
  const stock = useMemo(() => {
    const m = new Map<string, Stock>();
    for (const p of products) for (const v of p.variants ?? []) if (v.id) m.set(v.id, { qty: num(v.quantityOnHand), reorder: num(v.reorderLevel), unit: p.unit ?? "" });
    return m;
  }, [products]);
  const level = useCallback((mat: MenuMaterial): Level => {
    const s = mat.variantId ? stock.get(mat.variantId) : undefined;
    if (!s) return "unknown";
    if (s.qty <= 0) return "out";
    if (s.qty <= s.reorder) return "low";
    return "ok";
  }, [stock]);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of list) { const c = (x.category || "").trim(); if (c) m.set(c, (m.get(c) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);
  const shown = useMemo(() => (cat === ALL ? list : list.filter((m) => (m.category || "").trim() === cat)), [list, cat]);
  const shortCount = useMemo(
    () => list.filter((m) => m.active && (m.materials ?? []).some((x) => { const l = level(x); return l === "low" || l === "out"; })).length,
    [list, level],
  );

  // Switching a service on or off from the row. The same fields the edit form sends, taken
  // from what the row already holds, so nothing else about the service changes.
  const toggle = async (m: MenuItem) => {
    if (busyId) return;
    setBusyId(m.id);
    try {
      await api.updateMenuItem(m.id, {
        name: menuName(m, lang),
        defaultPrice: num(m.defaultPrice),
        options: (m.options ?? []).filter((o) => o.active !== false && o.name.trim()).map((o) => ({
          id: o.id, name: o.name, price: num(o.price), cost: num(o.cost), estimatedMinutes: o.estimatedMinutes || 0,
        })),
        defaultCost: num(m.defaultCost),
        category: m.category ?? "",
        estimatedMinutes: m.estimatedMinutes || 0,
        materials: (m.materials ?? []).map((x) => ({
          name: x.name, quantity: x.quantity || 1, unit: x.unit ?? "", unitCost: num(x.unitCost), unitPrice: num(x.unitPrice),
          variantId: x.variantId || undefined,
        })),
        active: !m.active,
      });
      setList((l) => l.map((x) => (x.id === m.id ? { ...x, active: !m.active } : x)));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally { setBusyId(null); }
  };

  const minutes = (n: number) => (n < 60 ? `${n} ${t("min_abbr")}` : `${Math.floor(n / 60)} ${t("hours_short")}${n % 60 ? ` ${n % 60} ${t("min_abbr")}` : ""}`);

  const chip = (mat: MenuMaterial, i: number) => {
    const l = level(mat);
    const s = mat.variantId ? stock.get(mat.variantId) : undefined;
    const need = mat.unit ? qtyUnit(t, mat.quantity, mat.unit) : mat.quantity > 1 ? `×${qty(mat.quantity)}` : "";
    const text = l === "out" || l === "low"
      ? `${mat.name} · ${qty(s!.qty)} ${unitLabel(t, s!.unit)}${l === "low" ? ` ${t("dash_att_low")}` : ""}`
      : `${mat.name}${need ? ` · ${need}` : ""}`;
    return (
      <span key={i} className={cn(
        "inline-flex max-w-[220px] items-center gap-1.5 truncate rounded-[7px] px-2 py-1 text-[12px] font-medium",
        l === "out" ? "bg-destructive-soft text-destructive" : l === "low" ? "bg-warning-soft text-warning" : "bg-secondary text-ink-2",
      )} title={text}>
        <span className={cn("size-1.5 shrink-0 rounded-full", l === "out" ? "bg-destructive" : l === "low" ? "bg-warning" : l === "ok" ? "bg-success" : "bg-ink-3")} />
        <span className="truncate">{text}</span>
      </span>
    );
  };

  const columns = useMemo<ColumnDef<MenuItem>[]>(() => [
    {
      id: "name",
      accessorFn: (m) => menuName(m, lang),
      header: ({ column }) => <SortHeader column={column}>{t("col_service")}</SortHeader>,
      cell: ({ row }) => {
        const m = row.original;
        const opts = activeOptions(m);
        const out = (m.materials ?? []).some((x) => level(x) === "out");
        const times = usage[menuName(m, lang).trim().toLowerCase()];
        const sub = !m.active ? t("svc_off")
          : out ? t("svc_no_stock")
          : opts.length ? `${opts.length} ${t("svc_variants")}: ${opts.map((o) => o.name).join(" · ")}`
          : times ? `${times} ${t("svc_used")}`
          : (m.materials ?? []).length === 0 ? t("svc_no_materials") : "";
        return (
          <div className={cn("min-w-0 max-w-[300px]", !m.active && "opacity-55")}>
            <div className="truncate text-[14.5px] font-semibold text-foreground">{menuName(m, lang)}</div>
            {sub && <div className={cn("truncate text-[12.5px]", out && m.active ? "text-destructive" : "text-muted-foreground")} title={sub}>{sub}</div>}
          </div>
        );
      },
    },
    {
      id: "category",
      accessorFn: (m) => m.category || "",
      header: ({ column }) => <SortHeader column={column}>{t("category")}</SortHeader>,
      cell: ({ row }) => row.original.category
        ? <span className={cn("inline-block max-w-[140px] truncate rounded-[7px] bg-secondary px-2.5 py-1 text-[12.5px] font-medium text-ink-2", !row.original.active && "opacity-55")}>{row.original.category}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "time",
      accessorFn: (m) => num(m.estimatedMinutes),
      header: ({ column }) => <SortHeader column={column}>{t("col_time")}</SortHeader>,
      cell: ({ row }) => num(row.original.estimatedMinutes) > 0
        ? <span className={cn("whitespace-nowrap font-mono text-[13px] text-ink-2", !row.original.active && "opacity-55")}>{minutes(num(row.original.estimatedMinutes))}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "materials",
      accessorFn: (m) => m.materials?.length ?? 0,
      header: ({ column }) => <SortHeader column={column}>{t("col_materials")}</SortHeader>,
      cell: ({ row }) => {
        const mats = row.original.materials ?? [];
        if (mats.length === 0) return <span className="text-muted-foreground">—</span>;
        const out = mats.some((x) => level(x) === "out");
        return (
          <div className={cn("flex max-w-[340px] flex-wrap items-center gap-1.5", !row.original.active && "opacity-55")}>
            {mats.slice(0, 3).map(chip)}
            {mats.length > 3 && <span className="text-[12px] text-muted-foreground">+{mats.length - 3}</span>}
            {out && canStock && <Link href="/inventory" onClick={(e) => e.stopPropagation()} className="text-[12.5px] font-semibold text-primary-emphasis hover:underline">{t("act_restock")}</Link>}
          </div>
        );
      },
    },
    {
      id: "price",
      accessorFn: (m) => num(m.defaultPrice),
      header: ({ column }) => <SortHeader column={column}>{t("price")}</SortHeader>,
      cell: ({ row }) => <div className={cn("whitespace-nowrap text-right font-mono text-[14px] font-semibold text-foreground", !row.original.active && "opacity-55")}>{priceLabel(row.original, t)}</div>,
    },
    {
      id: "status",
      accessorFn: (m) => (m.active ? "active" : "inactive"),
      header: ({ column }) => <SortHeader column={column}>{t("wo_active")}</SortHeader>,
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch checked={row.original.active} disabled={busyId === row.original.id} onCheckedChange={() => void toggle(row.original)} aria-label={t("active")} />
        </div>
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [lang, t, level, usage, busyId, canStock]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        meta={<span>{list.length} {t("svc_count")} · {categories.length} {t("cat_count")}</span>}
        actions={<Button data-tour="menu-add" onClick={() => setAdding(true)}><Plus /> {t("add_service")}</Button>}
      />
      {loading && list.length === 0 ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="an-skel h-11 w-full rounded-[8px]" />)}</Card>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={shown}
            searchPlaceholder={t("search") + "…"}
            emptyText={t("empty")}
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-[10px] bg-secondary p-1">
                  {[[ALL, t("all"), list.length] as const, ...categories.map(([c, n]) => [c, c, n] as const)].map(([key, label, n]) => (
                    <button key={key} onClick={() => setCat(key)} aria-pressed={cat === key}
                      className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-semibold transition-colors touch:min-h-11",
                        cat === key ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground hover:text-foreground")}>
                      {label}<span className="font-mono text-[11.5px] text-muted-foreground">{n}</span>
                    </button>
                  ))}
                </div>
                {shortCount > 0 && <Badge tone="warn">{shortCount} {t("svc_low_chip")}</Badge>}
              </div>
            }
            columnLabels={{ name: t("col_service"), category: t("category"), time: t("col_time"), materials: t("col_materials"), price: t("price"), status: t("wo_active") }}
            onRowClick={(m) => setEditing(m)}
            pageSize={12}
          />
          {canStock && <p className="px-1 text-[12.5px] text-muted-foreground">{t("svc_legend")}</p>}
        </>
      )}
      <MenuModal open={adding} onClose={() => setAdding(false)} shopId={shopId} onSaved={() => load()} />
      <MenuModal open={!!editing} item={editing} onClose={() => setEditing(null)} shopId={shopId} onSaved={() => load()} />
    </div>
  );
}

type MatRow = { name: string; qty: string; unit: string; cost: string; price: string; variantId: string };
// An option row keeps the id it came back with: the server upserts by it, and a line item
// already sold under this option points at it. A row with no id is one the shop just added.
type OptRow = { id?: string; name: string; price: string; cost: string; minutes: string };


const emptyForm = { name: "", category: "", minutes: "", price: "", cost: "" };

function MenuModal({ open, onClose, shopId, item, onSaved }: { open: boolean; onClose: () => void; shopId: string; item?: MenuItem | null; onSaved: () => void }) {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const who = useStaffNames();
  const isEdit = !!item;
  const [f, setF] = useState(emptyForm);
  const [active, setActive] = useState(true);
  const [materials, setMaterials] = useState<MatRow[]>([]);
  const [options, setOptions] = useState<OptRow[]>([]);
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
      setOptions((item.options ?? []).filter((o) => o.active !== false).map((o) => ({
        id: o.id, name: o.name, price: String(num(o.price)),
        cost: o.cost ? String(num(o.cost)) : "", minutes: o.estimatedMinutes ? String(o.estimatedMinutes) : "",
      })));
      setHistory(null);
      api.listMenuPriceHistory(item.id).then(setHistory).catch(() => setHistory([]));
    } else {
      // The onboarding tour's demo service, when a tour step is asking for one: the shop sees
      // this real form filled in, part attached, and only has to save it.
      const demo = tourPrefill("service");
      setF(demo ? { ...emptyForm, name: demo.name, minutes: String(demo.minutes), price: String(demo.price) } : emptyForm);
      setActive(true);
      setMaterials(demo?.material ? [{
        name: demo.material.name, qty: String(demo.material.qty), unit: demo.material.unit,
        cost: String(demo.material.cost), price: String(demo.material.price), variantId: demo.material.variantId,
      }] : []);
      setOptions([]); setHistory(null);
    }
  }, [open, item, lang, loadProducts, loadContragents]);

  const setOpt = (i: number, patch: Partial<OptRow>) => setOptions((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addOpt = () => setOptions((rows) => [...rows, { name: "", price: "", cost: "", minutes: "" }]);
  const delOpt = (i: number) => setOptions((rows) => rows.filter((_, j) => j !== i));
  // Options are the prices when there are any, so the service's own price stops being asked
  // for and becomes the cheapest of them — the "from" figure the price list shows.
  const namedOpts = options.filter((o) => o.name.trim());
  const hasOpts = namedOpts.length > 0;

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
    if (!f.name.trim() || busy) return;
    // Either a price, or options that carry the prices instead.
    if (!hasOpts && !f.price) return;
    setBusy(true);
    const optionRows = namedOpts.map((o) => ({
      id: o.id, name: o.name.trim(), price: parseInt(o.price, 10) || 0,
      cost: parseInt(o.cost, 10) || 0, estimatedMinutes: parseInt(o.minutes, 10) || 0,
    }));
    const payload = {
      name: f.name.trim(),
      // The "from" price the list shows. Priced options only: a row somebody has named but not
      // yet given a price to would otherwise drag the whole service down to zero — which reads
      // on the price list as a service the shop gives away.
      defaultPrice: hasOpts
        ? (() => {
            const priced = optionRows.map((o) => o.price).filter((n) => n > 0);
            return priced.length > 0 ? Math.min(...priced) : 0;
          })()
        : parseInt(f.price, 10) || 0,
      options: optionRows,
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

  // Category options come from the shared category catalog (same list products use),
  // keeping a legacy free-typed value selectable so old services don't lose their label.
  const categoryOptions = useMemo(() => {
    const names = categories.map((c) => c.name);
    const legacy = f.category && !names.includes(f.category) ? [{ value: f.category, label: f.category }] : [];
    return [...legacy, ...categories.map((c) => ({ value: c.name, label: c.name }))];
  }, [categories, f.category]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader><DialogTitle>{isEdit ? t("edit") : t("add_service")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          <Field label={t("service_name")}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("category")}><SearchSelect value={f.category} options={categoryOptions} placeholder={t("category")} onChange={(v) => setF({ ...f, category: v })} /></Field>
            <Field label={t("est_time")}>{numInput(f.minutes, (s) => setF({ ...f, minutes: s }))}</Field>
          </div>
          {/* With options the options carry the prices, so asking for one more here would be
              asking which of them is the real one. */}
          {!hasOpts && (
            <Field label={t("sell_price") + " (" + t("soum") + ")"}><MoneyInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>
          )}

          {/* options editor — the same job done several ways, at several prices */}
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-muted-foreground">{t("opt_options")}</div>
              <div className="text-[11.5px] text-muted-foreground/80">{t("opt_hint")}</div>
            </div>
            <Button variant="soft" size="sm" className="sm:shrink-0" onClick={addOpt}><Plus /> {t("opt_add")}</Button>
          </div>
          {options.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {options.map((o, i) => (
                <div key={i} className="flex flex-col gap-2.5 rounded-[10px] border border-border bg-secondary/30 p-2.5">
                  <div className="flex items-end gap-2">
                    <Field label={t("opt_name")} className="flex-1">
                      <Input value={o.name} onChange={(e) => setOpt(i, { name: e.target.value })} placeholder={t("opt_name_ph")} />
                    </Field>
                    <Button variant="ghost" size="icon" aria-label={t("delete")} onClick={() => delOpt(i)}><Trash2 /></Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label={t("sell_price")}><MoneyInput value={o.price} onChange={(v) => setOpt(i, { price: v })} hideHint /></Field>
                    <Field label={t("est_time")}>{numInput(o.minutes, (v) => setOpt(i, { minutes: v }))}</Field>
                  </div>
                </div>
              ))}
              <div className="px-1 text-[11.5px] text-muted-foreground">{t("opt_from_note")}</div>
            </div>
          )}

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
          {/* Two full-width buttons on a phone; a heading with its actions beside it on a desktop.
              Side by side at 390px they ran a centimetre past the edge of the drawer. */}
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[12.5px] font-semibold text-muted-foreground">{t("materials_needed")}</span>
            <div className="flex flex-wrap items-center gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
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
                      <span className="ml-auto truncate font-mono text-[11.5px] text-muted-foreground">
                        {shortDate(h.changedAt)}{who(h.changedBy) ? " · " + who(h.changedBy) : ""}
                      </span>
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
