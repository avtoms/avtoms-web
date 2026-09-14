"use client";
// Warehouse, after the "Ombor" redesign. Four figures over the list — what the stock is worth at
// cost, what is running low, what left the shelf this month (for jobs and by hand), and what the
// shop owes its suppliers — then one row per variant: brand, name and pack; what is left against
// its minimum and how many days that lasts at the current rate; cost, shelf price and margin;
// who supplies it and when it last came in. Rows that are low or empty are tinted, and a banner
// says what to reorder and puts the order together.
//
// The header carries the three jobs done here most: a stock count (Tuzatish), a new product
// (Mahsulot — the catalogue first, then a hand-typed form), and a delivery (Kirim hujjati).
//
// Kept from before though the design does not draw them: the barcode scanner, the stock-value
// line under the shelf price, the warnings about variants with no cost or price, and the column
// picker.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle, ArrowRight, BarChart3, Check, ChevronDown, ClipboardCheck, Download, FileDown,
  MoreHorizontal, MoreVertical, Plus, Printer, ScanBarcode, Search,
} from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kit/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui-kit/dropdown-menu";
import { ProductForm, type ProductPrefill } from "@/components/product-form";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { TemplatePicker } from "@/components/template-picker";
import { qtyUnit, unitLabel } from "@/components/catalog-fields";
import { PageHeader } from "@/components/page-header";
import { VariantSheet, type SheetTab } from "@/components/inventory/variant-sheet";
import { ReceiptDoc, type ReceiptSeed } from "@/components/inventory/receipt-doc";
import { Stocktake } from "@/components/inventory/stocktake";
import { ReorderSheet, type ReorderRow } from "@/components/inventory/reorder";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { useAutoRefresh } from "@/lib/use-refresh";
import { useShopProfile } from "@/lib/shop";
import { countVariants, dayMonth, money, num, qty as fmtQty } from "@/lib/format";
import { currentMonth, monthRange, todayYMD } from "@/lib/range";
import {
  downloadCsv, fill, inputFromProduct, isLoss, isLow, marginPct, moveKind, printLabels, reorderQty,
  statsByVariant, variantText, type LabelItem,
} from "@/lib/stock";
import { cn } from "@/lib/utils";
import type {
  CatalogTerm, Contragent, MenuItem, Product, ProductTemplate, ProductVariant, PropertyDefinition, Staff, Statistics, StockMovement,
} from "@/lib/types";
import { KpiCard } from "../_shared";
import { tourPrefill } from "@/lib/tour-bridge";

// One row per variant: the product it belongs to and the variant itself. `id` is the product's,
// so pointing at a product (?hl=) finds its rows.
type Row = { id: string; key: string; p: Product; v: ProductVariant };
type Seg = "all" | "low" | "loss" | "archive";
const DAY = 86_400_000;

export default function InventoryPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t, lang } = useLang();
  const { toast } = useToast();
  const router = useRouter();
  const profile = useShopProfile();

  const [list, setList] = useState<Product[]>([]);
  const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
  const [brands, setBrands] = useState<CatalogTerm[]>([]);
  const [categories, setCategories] = useState<CatalogTerm[]>([]);
  const [contragents, setContragents] = useState<Contragent[]>([]);
  // What each supplier is owed right now, so receiving stock can show the debt it adds to.
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [staff, setStaff] = useState<Staff[]>([]);
  // The super admin's ready-made products: the catalogue this screen stocks from, and where the
  // picture on a row comes from for anything already stocked that way.
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  // The price list, to say which services an empty shelf is holding up.
  const [menu, setMenu] = useState<MenuItem[]>([]);
  // This month's figures, for the supplier debt and as a fallback for the outflow.
  const [month, setMonth] = useState<Statistics | null>(null);
  // The last month or so of the whole warehouse's ledger: usage rates, last deliveries, and this
  // month's outflow split by where it went. A gateway that predates it leaves those figures to
  // the statistics instead.
  const [moves, setMoves] = useState<StockMovement[]>([]);
  const [movesOk, setMovesOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ mode: "new" | "edit"; product: Product | null; prefill?: ProductPrefill } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false); // the registry lookup after a read
  const [fromCatalog, setFromCatalog] = useState(false);
  const [detail, setDetail] = useState<{ productId: string; variantId?: string; tab?: SheetTab } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptSeed | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [stocktake, setStocktake] = useState(false);
  const [reorder, setReorder] = useState<ReorderRow[] | null>(null);
  const [seg, setSeg] = useState<Seg>("all");
  const [cats, setCats] = useState<string[]>([]);
  const [supplier, setSupplier] = useState("");

  const monthStart = useMemo(() => Date.parse(monthRange(currentMonth()).from), []);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listProducts(shopId)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
    const r = monthRange(currentMonth());
    api.getStatistics(shopId, r.from, r.to).then(setMonth).catch(() => setMonth(null));
    const since = new Date(Math.min(monthStart, Date.now() - 31 * DAY)).toISOString();
    api.listShopMovements(shopId, since)
      .then((m) => { setMoves(m); setMovesOk(true); })
      .catch(() => { setMoves([]); setMovesOk(false); });
  }, [shopId, t, toast, monthStart]);

  useEffect(() => { load(); }, [load]);
  // Other staff change these records while this tab sits open; refresh when it regains focus.
  useAutoRefresh(load);
  const loadContragents = useCallback(() => {
    api.listContragents().then(setContragents).catch(() => {});
    // Owner-only; a worker managing stock simply sees the forms without the running debt.
    api.contragentBalances(shopId).then((r) => {
      const m: Record<string, number> = {};
      for (const b of r.balances ?? []) m[b.contragentId] = num(b.balance);
      setBalances(m);
    }).catch(() => {});
  }, [shopId]);
  useEffect(() => {
    api.listPropertyDefinitions().then(setDefinitions).catch(() => {});
    api.listCatalogTerms("brand").then(setBrands).catch(() => {});
    api.listCatalogTerms("category").then(setCategories).catch(() => {});
    api.listStaff(shopId).then(setStaff).catch(() => {});
    api.listProductTemplates().then(setTemplates).catch(() => {});
    api.listMenuItems(shopId).then(setMenu).catch(() => {});
    loadContragents();
  }, [loadContragents, shopId]);

  // Brand name -> logo, and template id -> the admin's picture of the goods.
  const brandLogos = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of brands) if (b.logoUrl) m[b.name] = b.logoUrl;
    return m;
  }, [brands]);
  const templateImages = useMemo(() => {
    const m: Record<string, string> = {};
    for (const tpl of templates) if (tpl.imageUrl) m[tpl.id] = tpl.imageUrl;
    return m;
  }, [templates]);

  const stats = useMemo(() => statsByVariant(moves, list), [moves, list]);
  const variantById = useMemo(() => {
    const m = new Map<string, { p: Product; v: ProductVariant }>();
    for (const p of list) for (const v of p.variants ?? []) if (v.id) m.set(v.id, { p, v });
    return m;
  }, [list]);
  const contragentName = useCallback((id?: string) => (id ? contragents.find((c) => c.id === id)?.name : undefined), [contragents]);
  const lastCost = useCallback((vid: string) => num(stats.get(vid)?.lastIn?.unitCost), [stats]);

  // Which services draw on a variant, so an empty shelf can say what it is holding up.
  const usedIn = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const it of menu) {
      if (it.active === false) continue;
      const name = (lang === "ru" ? it.nameRu : lang === "uzc" ? it.nameUzCyrl : it.nameUzLatn) || it.nameUzLatn;
      for (const mat of it.materials ?? []) if (mat.variantId) m.set(mat.variantId, [...(m.get(mat.variantId) ?? []), name]);
    }
    return m;
  }, [menu, lang]);

  // Who supplies a row: the product's own supplier, else whoever delivered it last.
  const supplierOf = useCallback((r: Row) => {
    const id = r.p.supplierId || stats.get(r.key)?.lastIn?.contragentId || "";
    return { id, name: contragentName(id) || r.p.supplier || "" };
  }, [stats, contragentName]);

  const rowsAll = useMemo<Row[]>(() => list.flatMap((p) => (p.variants ?? [])
    .filter((v) => v.id && (v.active !== false || p.active === false))
    .map((v) => ({ id: p.id, key: v.id!, p, v }))), [list]);
  const activeRows = useMemo(() => rowsAll.filter((r) => r.p.active !== false), [rowsAll]);
  const archivedRows = useMemo(() => rowsAll.filter((r) => r.p.active === false), [rowsAll]);

  const catOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of activeRows) { const c = (r.p.category || "").trim(); if (c) m.set(c, (m.get(c) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [activeRows]);
  const supplierOptions = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number }>();
    for (const r of activeRows) {
      const s = supplierOf(r);
      if (!s.name) continue;
      const k = s.id || `name:${s.name}`;
      const g = m.get(k) ?? { id: k, name: s.name, n: 0 };
      g.n++;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [activeRows, supplierOf]);

  const narrow = useCallback((rows: Row[]) => rows.filter((r) => {
    if (cats.length && !cats.includes((r.p.category || "").trim())) return false;
    if (supplier) { const s = supplierOf(r); if ((s.id || `name:${s.name}`) !== supplier) return false; }
    return true;
  }), [cats, supplier, supplierOf]);
  const base = useMemo(() => narrow(activeRows), [narrow, activeRows]);
  const lowRows = useMemo(() => base.filter((r) => isLow(r.v)), [base]);
  const lossRows = useMemo(() => base.filter((r) => isLoss(r.v)), [base]);
  const archBase = useMemo(() => narrow(archivedRows), [narrow, archivedRows]);
  const shown = seg === "archive" ? archBase : seg === "low" ? lowRows : seg === "loss" ? lossRows : base;

  // What the whole warehouse is worth, summed from the same rows the table shows. Missing prices
  // are counted rather than assumed: a variant with stock and no cost makes the total understate,
  // and the screen says by how many rather than presenting a short number as the whole truth.
  const wh = useMemo(() => {
    let sell = 0, cost = 0, positions = 0, noCost = 0, noPrice = 0;
    for (const r of activeRows) {
      const q = num(r.v.quantityOnHand);
      if (q <= 0) continue;
      positions++;
      sell += Math.round(q * num(r.v.unitPrice));
      cost += Math.round(q * num(r.v.unitCost));
      if (num(r.v.unitCost) <= 0) noCost++;
      if (num(r.v.unitPrice) <= 0) noPrice++;
    }
    return { sell, cost, positions, noCost, noPrice };
  }, [activeRows]);
  const avgMargin = wh.sell > 0 ? Math.round(((wh.sell - wh.cost) / wh.sell) * 1000) / 10 : 0;
  const lowAll = useMemo(() => activeRows.filter((r) => isLow(r.v)), [activeRows]);
  const lossAll = useMemo(() => activeRows.filter((r) => isLoss(r.v)).length, [activeRows]);

  // This month's outflow at cost: for jobs and sales, and issued by hand.
  const out = useMemo(() => {
    let orders = 0, manual = 0;
    for (const m of moves) {
      if (Date.parse(m.createdAt) < monthStart) continue;
      const k = moveKind(m);
      const c = num(variantById.get(m.variantId)?.v.unitCost);
      if (k === "order" || k === "sale") orders += -m.delta * c;
      else if (k === "manual") manual += -m.delta * c;
    }
    return { orders: Math.round(orders), manual: Math.round(manual) };
  }, [moves, monthStart, variantById]);

  const topDebt = useMemo(() => {
    let best: [string, number] | null = null;
    for (const [id, b] of Object.entries(balances)) if (b > 0 && (!best || b > best[1])) best = [id, b];
    return best ? { name: contragentName(best[0]) ?? "", amount: best[1] } : null;
  }, [balances, contragentName]);

  // The banner: which low variant runs out first at its rate, and what to order.
  const soonest = useMemo(() => {
    let best: { r: Row; d: number } | null = null;
    for (const r of lowRows) {
      const d = stats.get(r.key)?.daysLeft;
      if (d !== null && d !== undefined && (!best || d < best.d)) best = { r, d };
    }
    return best;
  }, [lowRows, stats]);
  const recText = lowRows.slice(0, 3)
    .map((r) => qtyUnit(t, reorderQty(r.v, stats.get(r.key)?.perDay ?? 0), r.p.unit)).join(" + ") + (lowRows.length > 3 ? " …" : "");

  const toReorder = (rows: Row[]): ReorderRow[] => rows.map((r) => {
    const s = supplierOf(r);
    return { p: r.p, v: r.v, rec: reorderQty(r.v, stats.get(r.key)?.perDay ?? 0), supplierId: s.id, supplierName: s.name, lastCost: lastCost(r.key) };
  });
  const labelOf = (r: Row): LabelItem => ({
    name: `${r.p.brand ? r.p.brand + " " : ""}${r.p.name}`, variant: variantText(r.v), sku: r.v.sku ?? "", barcode: r.v.barcode, price: num(r.v.unitPrice),
  });

  // Archiving takes a product off the list without losing its history; the Arxiv tab brings it back.
  const archive = async (p: Product) => {
    const back = p.active === false;
    try {
      await api.updateProduct(p.id, { ...inputFromProduct(p), active: back });
      toast(back ? t("whx_unarchived") : t("whx_archived"), { icon: "check" });
      setDetail(null);
      load();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
  };

  const exportCsv = () => downloadCsv(`ombor-${todayYMD()}.csv`, [
    [t("product_name"), t("brand"), t("variant"), t("art"), t("barcode"), t("category"), t("supplier"),
      t("whx_stock"), t("unit"), t("reorder_level"), t("cost"), t("sell_price"), `${t("whx_margin_word")} %`, t("whx_value_cost")],
    ...shown.map((r) => [
      r.p.name, r.p.brand ?? "", variantText(r.v), r.v.sku ?? "", r.v.barcode ?? "", r.p.category ?? "", supplierOf(r).name,
      num(r.v.quantityOnHand), r.p.unit ? unitLabel(t, r.p.unit) : "", num(r.v.reorderLevel), num(r.v.unitCost), num(r.v.unitPrice),
      marginPct(num(r.v.unitCost), num(r.v.unitPrice)) ?? "", Math.round(Math.max(0, num(r.v.quantityOnHand)) * num(r.v.unitCost)),
    ]),
  ]);
  const shownCost = shown.reduce((s, r) => s + Math.round(Math.max(0, num(r.v.quantityOnHand)) * num(r.v.unitCost)), 0);

  // A barcode read at the warehouse screen. Cheapest first: a variant here already carries it —
  // open it, because the job is a delivery or a count; the tax registry knows it — a new product
  // with its name, brand and MXIK filled in; neither, or the registry is down — a new product
  // with just the barcode and the MXIK search waiting.
  const onScanned = async (code: string) => {
    for (const p of list) {
      const v = (p.variants ?? []).find((x) => x.barcode === code);
      if (v) {
        setDetail({ productId: p.id, variantId: v.id });
        toast(t("scan_in_stock"), { icon: "check", tone: "accent" });
        return;
      }
    }
    setScanBusy(true);
    try {
      const r = await api.mxikLookup(code, lang);
      const hit = r.kind === "gtin" ? r.items[0] : undefined;
      if (hit) {
        const mxik = await api.mxikDetails(hit.code, lang)
          .then((d) => ({ mxikCode: d.code, mxikName: d.name, packageCode: d.packages[0]?.code ?? "", packageName: d.packages[0]?.name ?? "" }))
          .catch(() => ({ mxikCode: hit.code, mxikName: hit.name, packageCode: "", packageName: "" }));
        setEditing({ mode: "new", product: null, prefill: { name: hit.name, brand: hit.brand, mxik, barcode: code } });
        return;
      }
      setEditing({ mode: "new", product: null, prefill: { barcode: code, searchMxik: true } });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      setEditing({ mode: "new", product: null, prefill: { barcode: code, searchMxik: true } });
    } finally {
      setScanBusy(false);
    }
  };

  const addProduct = () => {
    // During the onboarding tour the demo part goes straight to the hand-typed form, already
    // filled in, rather than through the catalogue first.
    const demo = tourPrefill("part");
    if (demo) setEditing({ mode: "new", product: null, prefill: { name: demo.name, unit: demo.unit, quantity: demo.qty, unitCost: demo.cost, unitPrice: demo.price } });
    else setFromCatalog(true);
  };

  const columns = useMemo<ColumnDef<Row>[]>(() => [
    {
      id: "name",
      // Barcodes and article numbers ride along in the searchable text, so a code typed, pasted or
      // read by a USB scanner into the search box finds its variant.
      accessorFn: (r) => `${r.p.name} ${r.p.brand ?? ""} ${variantText(r.v)} ${r.v.barcode ?? ""} ${r.v.sku ?? ""} ${r.p.category ?? ""}`,
      header: ({ column }) => <SortHeader column={column}>{t("col_product_variant")}</SortHeader>,
      cell: ({ row }) => {
        const { p, v } = row.original;
        const photo = p.templateId ? templateImages[p.templateId] : undefined;
        const logo = p.brand ? brandLogos[p.brand] : undefined;
        const thumb = logo || photo;
        const q = num(v.quantityOnHand);
        const services = q <= 0 ? usedIn.get(v.id!) : undefined;
        const sub = [variantText(v), p.unit ? unitLabel(t, p.unit) : "", v.sku ? `${t("art")} ${v.sku}` : "", p.category || ""].filter(Boolean).join(" · ");
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="size-9 shrink-0 rounded-[8px] bg-card object-contain" />
            ) : (
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-[8px] font-mono text-[10.5px] font-bold",
                q <= 0 ? "bg-destructive-soft text-destructive" : isLow(v) ? "bg-warning-soft text-warning" : "bg-secondary text-ink-2")}>
                {(p.brand || p.name || "?").slice(0, 3).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                {p.brand && <Badge tone="info">{p.brand}</Badge>}
                <span className="truncate text-[14px] font-semibold text-foreground">{p.name}</span>
              </div>
              {services?.length
                ? <div className="truncate text-[12.5px] font-medium text-destructive">{fill(t("whx_out_used_in"), { s: services[0] })}</div>
                : sub && <div className="truncate text-[12.5px] text-muted-foreground">{sub}</div>}
            </div>
          </div>
        );
      },
    },
    {
      id: "stock",
      accessorFn: (r) => num(r.v.quantityOnHand),
      header: ({ column }) => <SortHeader column={column}>{t("col_stock")}</SortHeader>,
      cell: ({ row }) => {
        const { p, v, key } = row.original;
        const have = num(v.quantityOnHand);
        const min = num(v.reorderLevel);
        const out = have <= 0;
        const low = isLow(v);
        const pct = Math.max(4, Math.min(100, (have / Math.max(min * 3, have, 1)) * 100));
        const d = stats.get(key)?.daysLeft;
        return (
          <div className="flex w-[190px] max-w-full flex-col gap-1 max-md:ml-auto max-md:w-full max-md:max-w-[220px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("font-mono text-[14px] font-bold", out ? "text-destructive" : low ? "text-warning" : "text-foreground")}>
                {qtyUnit(t, have, p.unit)}
              </span>
              {min > 0 && <span className="font-mono text-[11px] text-muted-foreground">{t("min_label")} {fmtQty(min)}</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className={cn("h-full rounded-full", out ? "bg-destructive" : low ? "bg-warning" : "bg-success")} style={{ width: `${out ? 0 : pct}%` }} />
            </div>
            {!out && d !== null && d !== undefined && (
              <span className={cn("text-[11.5px]", d < 7 ? "font-semibold text-warning" : "text-muted-foreground")}>{fill(t("whx_days_left"), { n: d })}</span>
            )}
          </div>
        );
      },
    },
    {
      id: "cost",
      accessorFn: (r) => num(r.v.unitCost),
      header: ({ column }) => <SortHeader column={column}>{t("cost")}</SortHeader>,
      cell: ({ row }) => {
        const c = num(row.original.v.unitCost);
        return <span className="whitespace-nowrap font-mono text-[13.5px] text-ink-2">{c > 0 ? money(c) : "—"}</span>;
      },
    },
    {
      id: "price",
      accessorFn: (r) => num(r.v.unitPrice),
      header: ({ column }) => <SortHeader column={column}>{t("sell_price")}</SortHeader>,
      // The shelf price, and under it what the stock on hand is worth at it.
      cell: ({ row }) => {
        const { v } = row.original;
        const price = num(v.unitPrice);
        const worth = Math.round(Math.max(0, num(v.quantityOnHand)) * price);
        return (
          <div className="flex flex-col items-start">
            <span className="whitespace-nowrap font-mono text-[13.5px] font-semibold text-foreground">{price > 0 ? money(price) : "—"}</span>
            {worth > 0 && <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">{t("wh_value_col")}: {money(worth)}</span>}
          </div>
        );
      },
    },
    {
      id: "margin",
      accessorFn: (r) => marginPct(num(r.v.unitCost), num(r.v.unitPrice)) ?? -9999,
      header: ({ column }) => <SortHeader column={column}>{t("whx_margin_word")}</SortHeader>,
      cell: ({ row }) => {
        const { v } = row.original;
        const c = num(v.unitCost), p = num(v.unitPrice);
        const m = marginPct(c, p);
        if (m === null) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className={cn("rounded-full px-2 py-0.5 font-mono text-[12px] font-bold",
              m < 0 ? "bg-destructive-soft text-destructive" : "bg-success-soft text-success")}>{m > 0 ? "+" : ""}{m}%</span>
            {p < c && <span className="whitespace-nowrap text-[11px] text-destructive">{t("whx_loss_per")} {money(c - p)}</span>}
          </div>
        );
      },
    },
    {
      id: "supplier",
      accessorFn: (r) => supplierOf(r).name,
      header: ({ column }) => <SortHeader column={column}>{t("supplier")}</SortHeader>,
      // Who supplies it, and the last time it came in: when, how much, at what.
      cell: ({ row }) => {
        const r = row.original;
        const s = supplierOf(r);
        const li = stats.get(r.key)?.lastIn;
        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] text-foreground">{s.name || "—"}</span>
            {li && (
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {dayMonth(li.createdAt)} · +{fmtQty(li.delta)}{num(li.unitCost) > 0 && <> @ {money(num(li.unitCost))}</>}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "actions",
      enableHiding: false,
      header: () => <span className="sr-only">{t("adjust_stock")}</span>,
      cell: ({ row }) => {
        const r = row.original;
        const empty = num(r.v.quantityOnHand) <= 0;
        const archived = r.p.active === false;
        return (
          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {!archived && (empty
              ? <Button size="sm" onClick={() => setReorder(toReorder([r]))}>{t("whx_order_btn")}</Button>
              : <Button variant={isLow(r.v) ? "default" : "secondary"} size="sm" onClick={() => setDetail({ productId: r.p.id, variantId: r.key, tab: "in" })}>{t("act_receive")}</Button>)}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="size-8 touch:size-11" aria-label={t("nav_more")}><MoreVertical /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[210px]">
                <DropdownMenuItem onClick={() => setDetail({ productId: r.p.id, variantId: r.key })}>{t("whx_open")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditing({ mode: "edit", product: r.p })}>{t("edit_product")}</DropdownMenuItem>
                {!archived && <DropdownMenuItem onClick={() => setDetail({ productId: r.p.id, variantId: r.key, tab: "adjust" })}>{t("whx_adjust_btn")}</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => printLabels([labelOf(r)])}>{t("whx_label")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant={archived ? undefined : "destructive"} onClick={() => archive(r.p)}>
                  {archived ? t("whx_unarchive") : t("whx_archive_do")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, brandLogos, templateImages, usedIn, stats, supplierOf, lastCost]);

  const segBtn = (k: Seg, label: string, n: number, tone?: string) => (
    <button key={k} onClick={() => setSeg(k)} aria-pressed={seg === k}
      className={cn("inline-flex min-h-8 items-center gap-1.5 shrink-0 whitespace-nowrap rounded-[8px] px-3 text-[13px] font-semibold transition-colors touch:min-h-11",
        seg === k ? "bg-card text-foreground shadow-[var(--shadow)]" : tone ?? "text-muted-foreground hover:text-foreground")}>
      {label}<span className="font-mono text-[11.5px] text-muted-foreground">{n}</span>
    </button>
  );

  const detailProduct = detail ? list.find((p) => p.id === detail.productId) ?? null : null;
  const activeProducts = list.filter((p) => p.active !== false).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        meta={list.length > 0 ? <span>{activeProducts} {t("inv_products")} · {activeRows.length} {t("svc_variants")} · {catOptions.length} {t("whx_cats")}</span> : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => setStocktake(true)}><ClipboardCheck /> <span className="hidden md:inline">{t("whx_adjust_btn")}</span></Button>
            {/* Scanning sits beside adding: a scan of something already on the shelf opens it
                instead of starting a second card for the same goods. */}
            <Button variant="secondary" size="icon" disabled={scanBusy} onClick={() => setScanOpen(true)} aria-label={t("scan_cta")} title={t("scan_cta")}>
              {scanBusy ? <Spinner /> : <ScanBarcode />}
            </Button>
            <Button variant="secondary" data-tour="inv-add" onClick={addProduct}><Plus /> {t("whx_product_btn")}</Button>
            <Button onClick={() => { setReceipt(null); setReceiptOpen(true); }}><Download /> {t("whx_receipt_btn")}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label={t("nav_more")}><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[230px]">
                <DropdownMenuItem onClick={() => router.push("/inventory/movements")}><BarChart3 /> {t("whx_movements")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditing({ mode: "new", product: null })}><Plus /> {t("add_part")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exportCsv}><FileDown /> {t("whx_export")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => printLabels(shown.map(labelOf))}><Printer /> {t("whx_labels")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {list.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label={t("whx_stock_at_cost")}
              value={money(wh.cost)}
              sub={<>{t("whx_on_sale")} {money(wh.sell)} · {t("whx_avg_margin")} {avgMargin}%
                {lossAll > 0 && <> · <span className="font-semibold text-destructive">{lossAll} {t("whx_at_loss_n")}</span></>}</>}
              onClick={lossAll > 0 ? () => setSeg("loss") : undefined}
            />
            <KpiCard
              label={t("inv_low")}
              value={lowAll.length}
              tone={lowAll.length ? "warn" : "neutral"}
              edge={lowAll.length ? "warn" : undefined}
              sub={lowAll.length ? lowAll.slice(0, 3).map((r) => [r.p.name, variantText(r.v)].filter(Boolean).join(" ")).join(" · ") : undefined}
              onClick={lowAll.length ? () => setSeg("low") : undefined}
            />
            <KpiCard
              label={t("inv_out_month")}
              value={movesOk ? money(out.orders + out.manual) : month ? money(num(month.costOfGoods)) : wh.positions}
              sub={movesOk
                ? `${t("whx_at_cost")} · ${t("whx_to_orders")} ${money(out.orders)} · ${t("whx_manual")} ${money(out.manual)}`
                : month ? `${t("inv_out_sub")} · ${wh.positions} ${t("inv_positions")}` : t("wh_in_stock_now")}
              onClick={() => router.push("/inventory/movements")}
            />
            <KpiCard
              label={t("inv_supplier_debt")}
              value={month ? money(num(month.payable)) : "—"}
              tone={month && num(month.payable) > 0 ? "danger" : "neutral"}
              sub={topDebt?.name ? `${topDebt.name} · ${money(topDebt.amount)}` : undefined}
            >
              <Link href="/contragents" className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary-emphasis hover:underline">
                {t("nav_contragents")} <ArrowRight className="size-3.5" />
              </Link>
            </KpiCard>
          </div>
          {(wh.noCost > 0 || wh.noPrice > 0) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12px] text-muted-foreground">
              {wh.noCost > 0 && <span>⚠ {countVariants(wh.noCost, t)} {t("wh_no_cost")}</span>}
              {wh.noPrice > 0 && <span>⚠ {countVariants(wh.noPrice, t)} {t("wh_no_price")}</span>}
            </div>
          )}
        </div>
      )}

      {seg !== "archive" && lowRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-warning/40 bg-warning-soft px-4 py-3">
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-[13.5px] text-foreground">
            <b>{lowRows.length} {t("whx_low_banner")}</b>{" "}
            {soonest && <>{fill(t("whx_runs_out"), { name: [soonest.r.p.name, variantText(soonest.r.v)].filter(Boolean).join(" "), n: soonest.d })}{" "}</>}
            {recText && <>{t("whx_recommend")} {recText}.</>}
          </p>
          <Button size="sm" onClick={() => setReorder(toReorder(lowRows))}>{t("whx_make_order")} · {lowRows.length} {t("whx_positions")}</Button>
        </div>
      )}

      {loading && list.length === 0 ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="an-skel h-11 w-full rounded-[8px]" />)}</Card>
      ) : (
        <DataTable
          columns={columns}
          data={shown}
          onRowClick={(r) => setDetail({ productId: r.p.id, variantId: r.key })}
          rowClassName={(r) => (num(r.v.quantityOnHand) <= 0 ? "bg-destructive-soft/40" : isLow(r.v) ? "bg-warning-soft/50" : undefined)}
          searchPlaceholder={t("whx_search_ph")}
          emptyText={t("empty")}
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex max-w-full flex-nowrap gap-0.5 overflow-x-auto rounded-[10px] bg-secondary p-1 [scrollbar-width:none]">
                {segBtn("all", t("all"), base.length)}
                {segBtn("low", t("inv_low"), lowRows.length, lowRows.length ? "text-warning hover:text-foreground" : undefined)}
                {segBtn("loss", t("whx_loss"), lossRows.length, lossRows.length ? "text-destructive hover:text-foreground" : undefined)}
                {segBtn("archive", t("whx_archive"), archBase.length)}
              </div>
              {catOptions.length > 0 && <CategoryFilter options={catOptions} value={cats} onChange={setCats} />}
              {supplierOptions.length > 0 && <SupplierFilter options={supplierOptions} value={supplier} onChange={setSupplier} />}
            </div>
          }
          columnLabels={{ name: t("col_product_variant"), stock: t("col_stock"), cost: t("cost"), price: t("sell_price"), margin: t("whx_margin_word"), supplier: t("supplier") }}
          pageSize={15}
        />
      )}

      {list.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[12.5px] text-muted-foreground">
          <span>{t("whx_total_cost")} <span className="font-mono">{money(shownCost)}</span></span>
          <span className="flex items-center gap-2">
            <button onClick={exportCsv} className="font-semibold hover:text-foreground">{t("whx_export")}</button>
            <span aria-hidden>·</span>
            <button onClick={() => printLabels(shown.map(labelOf))} className="font-semibold hover:text-foreground">{t("whx_labels")}</button>
          </span>
        </div>
      )}

      <ProductForm
        open={!!editing}
        mode={editing?.mode ?? "new"}
        product={editing?.product ?? null}
        prefill={editing?.prefill}
        shopId={shopId}
        definitions={definitions}
        brands={brands}
        categories={categories}
        contragents={contragents}
        existing={list}
        onOpenExisting={(p) => setDetail({ productId: p.id })}
        onContragentsChange={loadContragents}
        onClose={() => setEditing(null)}
        // A product save can bring stock in, so the supplier balances move with it.
        onSaved={() => { load(); loadContragents(); }}
      />
      <TemplatePicker
        open={fromCatalog}
        shopId={shopId}
        templates={templates}
        products={list}
        definitions={definitions}
        brands={brands}
        contragents={contragents}
        onContragentsChange={loadContragents}
        onClose={() => setFromCatalog(false)}
        onManual={() => { setFromCatalog(false); setEditing({ mode: "new", product: null }); }}
        onSaved={() => { load(); loadContragents(); }}
      />
      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onScanned} />
      <VariantSheet
        product={detailProduct}
        variantId={detail?.variantId}
        tab={detail?.tab}
        definitions={definitions}
        contragents={contragents}
        balances={balances}
        staff={staff}
        brandLogos={brandLogos}
        templateImages={templateImages}
        stats={stats}
        onClose={() => setDetail(null)}
        onEdit={(p) => { setDetail(null); setEditing({ mode: "edit", product: p }); }}
        // A receipt moves stock and the supplier's balance together, so refresh both.
        onDone={() => { load(); loadContragents(); }}
        onArchive={archive}
        onLabel={printLabels}
      />
      <ReceiptDoc
        open={receiptOpen}
        seed={receipt}
        shopId={shopId}
        products={list}
        contragents={contragents}
        balances={balances}
        lastCost={lastCost}
        onClose={() => { setReceiptOpen(false); setReceipt(null); }}
        onDone={() => { load(); loadContragents(); }}
      />
      <Stocktake open={stocktake} products={list} onClose={() => setStocktake(false)} onDone={load} />
      <ReorderSheet
        open={!!reorder}
        rows={reorder ?? []}
        shopName={profile.name || t("app_name")}
        onClose={() => setReorder(null)}
        onReceive={(seed) => { setReorder(null); setReceipt(seed); setReceiptOpen(true); }}
      />
    </div>
  );
}

// The category filter: several at once, searched — a shop with a hundred categories cannot scroll
// a row of tabs. Picked ones stay at the top; nothing applies until "Qo'llash".
function CategoryFilter({ options, value, onChange }: { options: [string, number][]; value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<string[]>(value);
  useEffect(() => { if (open) { setDraft(value); setQ(""); } }, [open, value]);
  const s = q.trim().toLowerCase();
  const items = options
    .filter(([c]) => !s || c.toLowerCase().includes(s))
    .sort((a, b) => Number(draft.includes(b[0])) - Number(draft.includes(a[0])));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn("inline-flex h-10 items-center gap-2 rounded-[10px] border px-3 text-[13.5px] font-semibold transition-colors touch:h-11",
          value.length ? "border-primary bg-primary-soft text-primary-emphasis" : "border-input bg-card text-foreground hover:bg-secondary")}>
          {t("category")}
          {value.length > 0 && <>: <span className="max-w-[130px] truncate">{value[0]}</span></>}
          {value.length > 1 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">{value.length}</span>}
          <ChevronDown className="size-4 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t("whx_cat_search")} (${options.length})`} className="h-9 pl-8" autoFocus />
        </div>
        <div className="flex max-h-[280px] flex-col overflow-y-auto">
          {items.map(([c, n]) => {
            const on = draft.includes(c);
            return (
              <button key={c} onClick={() => setDraft(on ? draft.filter((x) => x !== c) : [...draft, c])}
                className={cn("flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13.5px]",
                  on ? "bg-primary-soft font-semibold text-primary-emphasis" : "text-foreground hover:bg-secondary")}>
                <span className={cn("grid size-4 shrink-0 place-items-center rounded-[4px] border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{c}</span>
                <span className="font-mono text-[12px] text-muted-foreground">{n}</span>
              </button>
            );
          })}
          {items.length === 0 && <p className="px-2.5 py-2 text-[12.5px] text-muted-foreground">{t("empty")}</p>}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <button onClick={() => { onChange([]); setOpen(false); }} className="px-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground">{t("clear")}</button>
          <button onClick={() => { onChange(draft); setOpen(false); }} className="px-2 text-[13px] font-semibold text-primary-emphasis hover:underline">{t("whx_apply")}</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SupplierFilter({ options, value, onChange }: {
  options: { id: string; name: string; n: number }[]; value: string; onChange: (v: string) => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn("inline-flex h-10 max-w-[240px] items-center gap-2 rounded-[10px] border px-3 text-[13.5px] font-semibold transition-colors touch:h-11",
          cur ? "border-primary bg-primary-soft text-primary-emphasis" : "border-input bg-card text-foreground hover:bg-secondary")}>
          <span className="truncate">{cur ? cur.name : t("supplier")}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2">
        <div className="flex max-h-[300px] flex-col overflow-y-auto">
          <button onClick={() => { onChange(""); setOpen(false); }}
            className={cn("rounded-[8px] px-2.5 py-2 text-left text-[13.5px]", !value ? "bg-primary-soft font-semibold text-primary-emphasis" : "text-foreground hover:bg-secondary")}>
            {t("whx_supplier_all")}
          </button>
          {options.map((o) => (
            <button key={o.id} onClick={() => { onChange(o.id); setOpen(false); }}
              className={cn("flex items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13.5px]",
                o.id === value ? "bg-primary-soft font-semibold text-primary-emphasis" : "text-foreground hover:bg-secondary")}>
              <span className="min-w-0 truncate">{o.name}</span>
              <span className="font-mono text-[12px] text-muted-foreground">{o.n}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
