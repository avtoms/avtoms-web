"use client";
// Warehouse products: a product carries shared info plus named properties whose
// value combinations define variants. This screen lists products, opens a manage
// dialog to view/adjust each variant's stock, and hosts the create/edit form.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { QRCodeSVG } from "qrcode.react";
import { Plus } from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
import { ProductForm } from "@/components/product-form";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { MoneyInput, unitLabel } from "@/components/catalog-fields";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { useAutoRefresh } from "@/lib/use-refresh";
import { money, num } from "@/lib/format";
import { pickLangText, type Lang } from "@/lib/i18n";
import { stockReason } from "@/lib/system-text";
import { cn } from "@/lib/utils";
import type { Product, ProductVariant, PropertyDefinition, StockMovement, CatalogTerm, Contragent, Staff } from "@/lib/types";
import { DeliverySummary, NoSupplierNote } from "@/components/delivery-summary";

// Total on-hand across a product's variants, and whether any variant is low.
const totalStock = (p: Product) => (p.variants ?? []).reduce((s, v) => s + num(v.quantityOnHand), 0);
const anyLow = (p: Product) => (p.variants ?? []).some((v) => num(v.quantityOnHand) <= num(v.reorderLevel));
const variantLabel = (v: ProductVariant) =>
  (v.attributes ?? []).map((a) => a.value).join(" · ") || (v.sku ?? "");

// Resolve a color swatch for an attribute value from the predefined catalog.
const hexOf = (defs: PropertyDefinition[], prop: string, value: string) =>
  defs.find((d) => d.name === prop && d.kind === "color")?.values?.find((x) => x.value === value)?.colorHex || undefined;

// Attributes store the canonical value; show the admin's translation for the active language.
const attrLabelOf = (defs: PropertyDefinition[], lang: Lang, prop: string, value: string) => {
  const v = defs.find((d) => d.name === prop)?.values?.find((x) => x.value === value);
  return v ? pickLangText(lang, v.valueUzLatn, v.valueUzCyrl, v.valueRu, value) : value;
};

export default function InventoryPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [list, setList] = useState<Product[]>([]);
  const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
  const [brands, setBrands] = useState<CatalogTerm[]>([]);
  const [categories, setCategories] = useState<CatalogTerm[]>([]);
  const [contragents, setContragents] = useState<Contragent[]>([]);
  // What each supplier is owed right now, so receiving stock can show the debt it is about
  // to add to an account that already has one.
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ mode: "new" | "edit"; product: Product | null } | null>(null);
  const [managing, setManaging] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listProducts(shopId)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);
  // Other staff change these records while this tab sits open; refresh when it regains focus.
  useAutoRefresh(load);
  // The predefined property catalog + brand/category lists power the product form.
  const loadContragents = useCallback(() => {
    api.listContragents().then(setContragents).catch(() => {});
    // Owner-only; a worker managing stock simply sees the form without the running debt.
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
    loadContragents();
  }, [loadContragents, shopId]);

  // Brand name -> logo URL, so a product's brand can show its logo in the list.
  const brandLogos = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of brands) if (b.logoUrl) m[b.name] = b.logoUrl;
    return m;
  }, [brands]);

  const columns = useMemo<ColumnDef<Product>[]>(() => [
    {
      id: "name",
      accessorFn: (p) => `${p.name || ""} ${p.brand || ""}`,
      header: ({ column }) => <SortHeader column={column}>{t("product_name")}</SortHeader>,
      cell: ({ row }) => {
        const p = row.original;
        const logo = p.brand ? brandLogos[p.brand] : undefined;
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="size-6 shrink-0 rounded-[6px] object-contain" />
            )}
            {p.brand && <Badge tone="info">{p.brand}</Badge>}
            <span className="truncate text-[14px] font-semibold text-foreground">{p.name}</span>
          </div>
        );
      },
    },
    {
      id: "category",
      accessorFn: (p) => p.category || "",
      header: ({ column }) => <SortHeader column={column}>{t("category")}</SortHeader>,
      cell: ({ row }) => row.original.category
        ? <span className="text-[13px] text-foreground">{row.original.category}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "supplier",
      accessorFn: (p) => p.supplier || "",
      header: ({ column }) => <SortHeader column={column}>{t("supplier")}</SortHeader>,
      cell: ({ row }) => row.original.supplier
        ? <span className="text-[13px] text-foreground">{row.original.supplier}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "variants",
      accessorFn: (p) => (p.variants ?? []).length,
      header: ({ column }) => <SortHeader column={column}>{t("variants")}</SortHeader>,
      cell: ({ row }) => <span className="font-mono text-[13px] text-muted-foreground">{(row.original.variants ?? []).length}</span>,
    },
    {
      id: "stock",
      accessorFn: (p) => totalStock(p),
      header: ({ column }) => <SortHeader column={column}>{t("in_stock")}</SortHeader>,
      cell: ({ row }) => {
        const p = row.original;
        const low = anyLow(p);
        return (
          <div className="flex flex-col items-start gap-1">
            <span className={cn("font-mono text-[15px] font-bold", low ? "text-destructive" : "text-foreground")}>
              {num(totalStock(p))} {unitLabel(t, p.unit)}
            </span>
            {low && <Badge tone="danger" dot>{t("low_stock")}</Badge>}
          </div>
        );
      },
    },
    {
      id: "actions",
      enableHiding: false,
      header: () => <span className="sr-only">{t("adjust_stock")}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="soft" size="sm" onClick={(e) => { e.stopPropagation(); setManaging(row.original); }}>{t("adjust_stock")}</Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditing({ mode: "edit", product: row.original }); }}>{t("edit_product")}</Button>
        </div>
      ),
    },
  ], [t, brandLogos]);

  return (
    <div className="flex flex-col gap-4">
      {loading && list.length === 0 ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="an-skel h-11 w-full rounded-[8px]" />)}</Card>
      ) : (
        <DataTable
          columns={columns}
          data={list}
          onRowClick={(p) => setManaging(p)}
          searchPlaceholder={t("search") + "…"}
          emptyText={t("empty")}
          toolbar={<Button onClick={() => setEditing({ mode: "new", product: null })}><Plus /> {t("add_part")}</Button>}
          columnLabels={{ name: t("product_name"), category: t("category"), supplier: t("supplier"), variants: t("variants"), stock: t("in_stock") }}
          pageSize={12}
        />
      )}
      <ProductForm
        open={!!editing}
        mode={editing?.mode ?? "new"}
        product={editing?.product ?? null}
        shopId={shopId}
        definitions={definitions}
        brands={brands}
        categories={categories}
        contragents={contragents}
        onContragentsChange={loadContragents}
        onClose={() => setEditing(null)}
        // A product save can bring stock in, so the supplier balances move with it.
        onSaved={() => { load(); loadContragents(); }}
      />
      <ManageModal
        product={managing}
        definitions={definitions}
        contragents={contragents}
        balances={balances}
        staff={staff}
        brandLogos={brandLogos}
        onClose={() => setManaging(null)}
        onEdit={(p) => { setManaging(null); setEditing({ mode: "edit", product: p }); }}
        // A receipt moves stock and the supplier's balance together, so refresh both —
        // otherwise the next delivery in the same sitting quotes a stale debt.
        onDone={() => { load(); loadContragents(); }}
      />
    </div>
  );
}

// ManageModal lists a product's variants with their stock and a per-variant
// receive/consume stock adjustment.
function ManageModal({
  product, definitions, contragents, balances, staff, brandLogos, onClose, onEdit, onDone,
}: {
  product: Product | null;
  definitions: PropertyDefinition[];
  contragents: Contragent[];
  balances: Record<string, number>;
  staff: Staff[];
  brandLogos: Record<string, string>;
  onClose: () => void;
  onEdit: (p: Product) => void;
  onDone: () => void;
}) {
  const { t, lang } = useLang();
  const [adjust, setAdjust] = useState<ProductVariant | null>(null);
  const [history, setHistory] = useState<string | null>(null); // variant id whose history is open
  useEffect(() => { if (!product) { setAdjust(null); setHistory(null); } }, [product]);

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            {product?.brand && brandLogos[product.brand] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogos[product.brand]} alt="" aria-hidden className="size-6 shrink-0 rounded-[5px] object-contain" />
            )}
            <span className="truncate">{product ? `${product.brand ? product.brand + " · " : ""}${product.name}` : ""}</span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto py-1">
          {product && (product.variants ?? []).length === 0 && (
            <p className="text-[13px] text-muted-foreground">{t("no_variants")}</p>
          )}
          {product?.variants?.map((v) => {
            const low = num(v.quantityOnHand) <= num(v.reorderLevel);
            const isAdjusting = adjust?.id === v.id;
            return (
              <div key={v.id} className="flex flex-col gap-2 rounded-[10px] border border-border/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  {v.sku && (
                    <span className="shrink-0 rounded-[6px] bg-white p-0.5">
                      <QRCodeSVG value={v.sku} size={40} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
                      {(v.attributes ?? []).length ? (v.attributes ?? []).map((a) => {
                        const hex = hexOf(definitions, a.property, a.value);
                        return (
                          <span key={a.property} className="inline-flex items-center gap-1">
                            {hex && <span className="inline-block size-2.5 rounded-full border border-black/10" style={{ background: hex }} />}
                            {attrLabelOf(definitions, lang, a.property, a.value)}
                          </span>
                        );
                      }) : (variantLabel(v) || t("variant"))}
                    </div>
                    <div className="flex flex-wrap gap-x-2 text-[11.5px] text-muted-foreground">
                      {v.sku && <span className="font-mono">{v.sku}</span>}
                      {num(v.unitPrice) > 0 && <span>· {money(v.unitPrice!)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-mono text-[14px] font-bold", low ? "text-destructive" : "text-foreground")}>
                      {num(v.quantityOnHand)} {unitLabel(t, product.unit)}
                    </span>
                    {low && <Badge tone="danger" dot>{t("low_stock")}</Badge>}
                    <Button variant="ghost" size="sm" onClick={() => setHistory(history === v.id ? null : v.id!)}>{t("history")}</Button>
                    <Button variant="soft" size="sm" onClick={() => setAdjust(isAdjusting ? null : v)}>{t("adjust_stock")}</Button>
                  </div>
                </div>
                {isAdjusting && <AdjustPanel variant={v} unit={product.unit} brand={product.brand} contragents={contragents} balances={balances} onClose={() => setAdjust(null)} onDone={onDone} />}
                {history === v.id && v.id && <HistoryPanel variantId={v.id} unit={product.unit} contragents={contragents} staff={staff} />}
              </div>
            );
          })}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          {product && <Button onClick={() => onEdit(product)}>{t("edit_product")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// AdjustPanel is an inline receive/consume control for one variant. On receive it
// also records which supplier delivered the stock and the purchase price per unit,
// so the history shows a full procurement picture.
//
// A receipt is also a purchase on credit: whatever is not handed over now becomes a debt on
// the supplier's account, and it is repaid there rather than here. The panel says that in
// full — running balance, what this delivery adds, and a way through to the account — because
// stock arriving is the moment the debt is created and the only moment the shop is looking.
function AdjustPanel({
  variant, unit, brand, contragents, balances, onClose, onDone,
}: {
  variant: ProductVariant;
  unit?: string;
  brand?: string;
  contragents: Contragent[];
  balances: Record<string, number>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [mode, setMode] = useState<"receive" | "consume">("receive");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  // How much of the delivery was handed over now. Empty is the honest default: the shop
  // took the goods and owes for them until it says otherwise.
  const [paidNow, setPaidNow] = useState("");
  const [busy, setBusy] = useState(false);

  // Narrow suppliers to the product's brand (keeping brand-agnostic ones), so receiving
  // stock offers the same brand-scoped supplier list as the product form.
  const suppliers = useMemo(() => {
    const b = (brand ?? "").trim();
    if (!b) return contragents;
    return contragents.filter((c) => c.id === supplierId || !c.brand || c.brand === b);
  }, [contragents, brand, supplierId]);

  const receiving = mode === "receive";
  const qty = parseFloat(amount) || 0;
  const cost = parseInt(unitCost, 10) || 0;
  const total = Math.round(qty * cost);
  // Never let the form claim more was paid than the delivery was worth.
  const paid = Math.min(parseInt(paidNow, 10) || 0, total);
  const owed = Math.max(0, total - paid);

  const save = async () => {
    if (qty <= 0 || busy || !variant.id) return;
    setBusy(true);
    try {
      await api.adjustVariantStock(
        variant.id,
        receiving ? qty : -qty,
        reason.trim() || mode,
        receiving ? { contragentId: supplierId, unitCost: cost, paidAmount: paid } : undefined,
      );
      toast(t("save"), { icon: "check" });
      onClose();
      onDone();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-2.5 border-t border-border/60 pt-2.5">
      <Tabs value={mode} onValueChange={(v) => setMode(v as "receive" | "consume")}>
        <TabsList className="w-full">
          <TabsTrigger value="receive" className="flex-1">{t("receive")}</TabsTrigger>
          <TabsTrigger value="consume" className="flex-1">{t("consume")}</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("qty") + (unit ? ` (${unitLabel(t, unit)})` : "")}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0" className="font-mono" />
        </Field>
        <Field label={t("notes")}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      {receiving && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("supplier")}>
            <SearchSelect
              value={supplierId}
              options={suppliers.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={t("supplier")}
              onChange={setSupplierId}
            />
          </Field>
          <Field label={t("purchase_price") + (unit ? ` (${unitLabel(t, unit)})` : "")}>
            <MoneyInput value={unitCost} onChange={setUnitCost} placeholder="0" hideHint />
          </Field>
        </div>
      )}
      {/* Settling on the spot is optional, and only means anything once a supplier is named —
          without one there is no account for the rest to become a debt on. */}
      {receiving && supplierId && (
        <Field label={t("paid_now")}>
          <MoneyInput value={paidNow} onChange={setPaidNow} placeholder="0" hideHint />
        </Field>
      )}
      <NoSupplierNote show={receiving && total > 0 && !supplierId} />
      {receiving && (
        <DeliverySummary supplierId={supplierId} total={total} paid={paid} balance={balances[supplierId] ?? 0} />
      )}
      <div className="flex justify-end">
        <Button disabled={busy} size="sm" onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
      </div>
    </div>
  );
}


// HistoryPanel shows a variant's income/outcome ledger, newest first, with the full
// procurement detail per entry: who received it, which supplier delivered it, and the
// purchase price (per unit + line total).
function HistoryPanel({ variantId, unit, contragents, staff }: {
  variantId: string;
  unit?: string;
  contragents: Contragent[];
  staff: Staff[];
}) {
  const { t, lang } = useLang();
  const [items, setItems] = useState<StockMovement[] | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    api.listStockMovements(variantId).then((m) => { if (alive) setItems(m); }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [variantId]);

  const supplierName = (id?: string) => contragents.find((c) => c.id === id)?.name;
  const staffName = (id?: string) => staff.find((s) => s.id === id)?.name;

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2.5">
      {items === null && <div className="flex justify-center py-2"><Spinner /></div>}
      {items?.length === 0 && <p className="py-1 text-[12.5px] text-muted-foreground">{t("no_movements")}</p>}
      {items?.map((m) => {
        const income = m.delta >= 0;
        const supplier = supplierName(m.contragentId);
        const receiver = staffName(m.staffId);
        const cost = num(m.unitCost);
        return (
          <div key={m.id} className="flex flex-col gap-1 rounded-[8px] bg-secondary/30 px-2.5 py-2 text-[12.5px]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Badge tone={income ? "ok" : "danger"}>{income ? t("receive") : t("consume")}</Badge>
                {/* Why it moved, in the language on screen. A reason typed by hand on an
                    adjustment is not one the system wrote and passes through as typed. */}
                <span className="truncate text-muted-foreground">{stockReason(lang, m.reason)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2.5 font-mono">
                <span className={cn("font-bold", income ? "text-success" : "text-destructive")}>
                  {income ? "+" : ""}{num(m.delta)}
                </span>
                <span className="text-muted-foreground">= {num(m.balanceAfter)}{unit ? " " + unitLabel(t, unit) : ""}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
              {supplier && <span>🚚 {supplier}</span>}
              {receiver && <span>👤 {receiver}</span>}
              {income && cost > 0 && (
                <span className="font-mono">
                  {money(cost)}{unit ? "/" + unitLabel(t, unit) : ""} · {t("total")} <span className="font-semibold text-foreground">{money(cost * Math.abs(num(m.delta)))}</span>
                </span>
              )}
              <span className="ml-auto font-mono">{fmtDate(m.createdAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
