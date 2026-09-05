"use client";
// Warehouse products: a product carries shared info plus named properties whose
// value combinations define variants. This screen lists products, opens a manage
// dialog to view/adjust each variant's stock, and hosts the create/edit form.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { TemplatePicker } from "@/components/template-picker";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { MoneyInput, unitLabel, qtyUnit } from "@/components/catalog-fields";
import { FxMoneyInput } from "@/components/fx-money";
import { emptyFx, findCurrency, fxLabel, fxPayload, fxSoum, useCurrencies, type FxValue } from "@/lib/currency";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { useAutoRefresh } from "@/lib/use-refresh";
import { countVariants, money, num } from "@/lib/format";
import { pickLangText, type Lang } from "@/lib/i18n";
import { stockReason } from "@/lib/system-text";
import { cn } from "@/lib/utils";
import type { Product, ProductVariant, PropertyDefinition, StockMovement, CatalogTerm, Contragent, Staff, ProductTemplate } from "@/lib/types";
import { DeliverySummary, NoSupplierNote } from "@/components/delivery-summary";
import { PaymentPicker, toParts, usePayment, useShopCards, useShopAccounts, useContragentAccounts } from "@/components/payment-picker";
import { StatCard } from "../_shared";

// Total on-hand across a product's variants, and whether any variant is low.
const totalStock = (p: Product) => (p.variants ?? []).reduce((s, v) => s + num(v.quantityOnHand), 0);
const anyLow = (p: Product) => (p.variants ?? []).some((v) => num(v.quantityOnHand) <= num(v.reorderLevel));

// What a product's stock on hand is worth, both ways round: what it would bring in at the
// shelf price, and what the shop paid to have it sitting there.
//
// Only stock actually on hand counts. A variant at zero is worth nothing however it is priced,
// and a negative count is a correction waiting to happen, not stock the shop can sell.
const productValue = (p: Product) => {
  let sell = 0, cost = 0;
  for (const v of p.variants ?? []) {
    const qty = num(v.quantityOnHand);
    if (qty <= 0) continue;
    sell += Math.round(qty * num(v.unitPrice));
    cost += Math.round(qty * num(v.unitCost));
  }
  return { sell, cost };
};
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
  // The super admin's ready-made products: the catalogue this screen stocks from, and where
  // the picture on a row comes from for anything already stocked that way.
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ mode: "new" | "edit"; product: Product | null } | null>(null);
  const [fromCatalog, setFromCatalog] = useState(false);
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
    api.listProductTemplates().then(setTemplates).catch(() => {});
    loadContragents();
  }, [loadContragents, shopId]);

  // Brand name -> logo URL, so a product's brand can show its logo in the list.
  const brandLogos = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of brands) if (b.logoUrl) m[b.name] = b.logoUrl;
    return m;
  }, [brands]);

  // Template id -> the admin's picture of the goods. Resolved here rather than stored on the
  // product, so replacing a bad photo in the console fixes every shop's list at once.
  const templateImages = useMemo(() => {
    const m: Record<string, string> = {};
    for (const tpl of templates) if (tpl.imageUrl) m[tpl.id] = tpl.imageUrl;
    return m;
  }, [templates]);

  // What the whole warehouse is worth. Summed here from the same rows the table shows, so the
  // figure above the list and the list itself can never disagree.
  //
  // Missing prices are counted rather than assumed. A variant with stock and no cost recorded
  // makes the cost total understate — quietly, and by exactly the amount nobody would notice —
  // so the screen says how many, instead of presenting a short number as the whole truth.
  const wh = useMemo(() => {
    let sell = 0, cost = 0, positions = 0, noCost = 0, noPrice = 0;
    for (const p of list) {
      for (const v of p.variants ?? []) {
        const qty = num(v.quantityOnHand);
        if (qty <= 0) continue;
        positions++;
        sell += Math.round(qty * num(v.unitPrice));
        cost += Math.round(qty * num(v.unitCost));
        if (num(v.unitCost) <= 0) noCost++;
        if (num(v.unitPrice) <= 0) noPrice++;
      }
    }
    return { sell, cost, margin: sell - cost, positions, noCost, noPrice };
  }, [list]);
  // Margin against the sell price, which is the number a shop prices against.
  const marginPct = wh.sell > 0 ? Math.round((wh.margin / wh.sell) * 1000) / 10 : 0;

  const columns = useMemo<ColumnDef<Product>[]>(() => [
    {
      id: "name",
      accessorFn: (p) => `${p.name || ""} ${p.brand || ""}`,
      header: ({ column }) => <SortHeader column={column}>{t("product_name")}</SortHeader>,
      cell: ({ row }) => {
        const p = row.original;
        // The brand mark wins at this size, and the photograph is the fallback — the opposite
        // of the card grid, on purpose. This thumbnail is 28px: a mark is drawn to survive
        // that, a photograph of a bottle on a workbench turns to mud. The photo still leads
        // wherever there is room for it — the catalogue cards and the manage dialog.
        const photo = p.templateId ? templateImages[p.templateId] : undefined;
        const logo = p.brand ? brandLogos[p.brand] : undefined;
        const thumb = logo || photo;
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="size-7 shrink-0 rounded-[6px] object-contain" />
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
              {qtyUnit(t, totalStock(p), p.unit)}
            </span>
            {low && <Badge tone="danger" dot>{t("low_stock")}</Badge>}
          </div>
        );
      },
    },
    {
      id: "value",
      accessorFn: (p) => productValue(p).sell,
      header: ({ column }) => <SortHeader column={column}>{t("wh_value_col")}</SortHeader>,
      // Sell price above, what it cost below — the pair that makes the totals at the top
      // explicable, and sortable so "where is the money sitting" is one click away.
      cell: ({ row }) => {
        const { sell, cost } = productValue(row.original);
        if (sell <= 0 && cost <= 0) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-col items-start">
            <span className="font-mono text-[13.5px] font-semibold text-foreground">{money(sell)}</span>
            {cost > 0 && <span className="font-mono text-[11.5px] text-muted-foreground">{money(cost)}</span>}
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
  ], [t, brandLogos, templateImages]);

  return (
    <div className="flex flex-col gap-4">
      {list.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            <StatCard label={t("wh_sell_value")} value={money(wh.sell)} sub={t("wh_if_all_sold")} icon="money" tone="accent" big />
            <StatCard label={t("wh_cost_value")} value={money(wh.cost)} sub={t("wh_paid_for_goods")} icon="list" tone="warn" />
            <StatCard
              label={t("wh_margin")}
              value={money(wh.margin)}
              sub={marginPct + "% " + t("margin")}
              icon="chart"
              tone={wh.margin >= 0 ? "ok" : "danger"}
            />
            <StatCard label={t("wh_positions")} value={wh.positions} sub={t("wh_in_stock_now")} icon="clipboard" tone="neutral" />
          </div>
          {/* Say what the totals are missing rather than let a short number pass for the whole
              shelf. Only shown when there is something to say. */}
          {(wh.noCost > 0 || wh.noPrice > 0) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12px] text-muted-foreground">
              {wh.noCost > 0 && <span>⚠ {countVariants(wh.noCost, t)} {t("wh_no_cost")}</span>}
              {wh.noPrice > 0 && <span>⚠ {countVariants(wh.noPrice, t)} {t("wh_no_price")}</span>}
            </div>
          )}
        </div>
      )}
      {loading && list.length === 0 ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="an-skel h-11 w-full rounded-[8px]" />)}</Card>
      ) : (
        <DataTable
          columns={columns}
          data={list}
          onRowClick={(p) => setManaging(p)}
          searchPlaceholder={t("search") + "…"}
          emptyText={t("empty")}
          // One way in, not a fork. Two buttons side by side made the reader choose between
          // "from catalogue" and "by hand" before they knew whether the catalogue had their
          // product; the catalogue answers that itself and offers the hand-built form when the
          // answer is no. With an empty catalogue this still opens the picker, which is then
          // nothing but that offer.
          toolbar={
            <Button onClick={() => setFromCatalog(true)}>
              <Plus /> {t("add_part_cta")}
            </Button>
          }
          columnLabels={{ name: t("product_name"), category: t("category"), supplier: t("supplier"), variants: t("variants"), stock: t("in_stock"), value: t("wh_value_col") }}
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
        // Stocking from the catalogue brings goods in, so the supplier balances move with it.
        onSaved={() => { load(); loadContragents(); }}
      />
      <ManageModal
        product={managing}
        definitions={definitions}
        contragents={contragents}
        balances={balances}
        staff={staff}
        brandLogos={brandLogos}
        templateImages={templateImages}
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
  product, definitions, contragents, balances, staff, brandLogos, templateImages, onClose, onEdit, onDone,
}: {
  product: Product | null;
  definitions: PropertyDefinition[];
  contragents: Contragent[];
  balances: Record<string, number>;
  staff: Staff[];
  brandLogos: Record<string, string>;
  templateImages: Record<string, string>;
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
            {(() => {
              const thumb = (product?.templateId && templateImages[product.templateId])
                || (product?.brand ? brandLogos[product.brand] : undefined);
              // eslint-disable-next-line @next/next/no-img-element
              return thumb ? <img src={thumb} alt="" aria-hidden className="size-6 shrink-0 rounded-[5px] object-contain" /> : null;
            })()}
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
                    {/* Bought for → sells for, then what this variant's stock is worth on the
                        shelf. The same arithmetic as the totals at the top of the screen, shown
                        where somebody is actually deciding whether to reorder. */}
                    <div className="flex flex-wrap gap-x-2 text-[11.5px] text-muted-foreground">
                      {v.sku && <span className="font-mono">{v.sku}</span>}
                      {num(v.unitPrice) > 0 && (
                        <span className="font-mono">
                          · {num(v.unitCost) > 0 && <>{money(v.unitCost!)} → </>}{money(v.unitPrice!)}
                        </span>
                      )}
                      {num(v.quantityOnHand) > 0 && num(v.unitPrice) > 0 && (
                        <span className="font-mono">
                          · {t("wh_value_col").toLowerCase()} <span className="font-semibold text-foreground">
                            {money(Math.round(num(v.quantityOnHand) * num(v.unitPrice)))}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-mono text-[14px] font-bold", low ? "text-destructive" : "text-foreground")}>
                      {qtyUnit(t, v.quantityOnHand, product.unit)}
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
  // Both amounts carry the currency they were agreed in. A delivery priced in dollars and
  // settled partly in so'm is an ordinary Tuesday here, so each amount says for itself
  // which it was rather than inheriting one setting for the whole panel.
  const [unitCost, setUnitCost] = useState<FxValue>(() => emptyFx());
  // How much of the delivery was handed over now. Empty is the honest default: the shop
  // took the goods and owes for them until it says otherwise.
  const [paidNow, setPaidNow] = useState<FxValue>(() => emptyFx());
  // How that money left the shop. Receiving goods from an MCHJ and wiring them the money is
  // one action on one screen: this is where the shop is standing when the payment is made,
  // and asking later — or not at all — is how a ledger stops matching a bank statement.
  const { payment, setPayment } = usePayment();
  const { session } = useAuth();
  const cards = useShopCards(session?.staff.shopId);
  const shopAccounts = useShopAccounts();
  // The supplier's own accounts, so "where is this money going" is answered on this screen
  // and a new one can be added the moment the delivery note shows a different number.
  const theirAccounts = useContragentAccounts(supplierId);
  const [busy, setBusy] = useState(false);
  const currencies = useCurrencies();

  // Narrow suppliers to the product's brand (keeping brand-agnostic ones), so receiving
  // stock offers the same brand-scoped supplier list as the product form.
  const suppliers = useMemo(() => {
    const b = (brand ?? "").trim();
    if (!b) return contragents;
    return contragents.filter((c) => c.id === supplierId || !c.brand || c.brand === b);
  }, [contragents, brand, supplierId]);

  const receiving = mode === "receive";
  const qty = parseFloat(amount) || 0;
  // so'm previews of what the server is about to work out, for the summary below. What
  // gets POSTed is the typed amount and its rate — see the fx* fields in save().
  const cost = fxSoum(unitCost, findCurrency(currencies, unitCost.currency));
  const total = Math.round(qty * cost);
  // Never let the form claim more was paid than the delivery was worth.
  const paid = Math.min(fxSoum(paidNow, findCurrency(currencies, paidNow.currency)), total);
  const owed = Math.max(0, total - paid);

  // A payment that has been described but not finished — "card" with no card named — must not
  // save as though nothing was said about it. The button goes dark instead, the same rule the
  // supplier's account uses.
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
          // Only when money actually moved: a delivery taken on credit has no payment to
          // describe, and describing one would put it on the account.
          parts: parts ?? undefined,
          fxUnitCost: fxPayload(unitCost, findCurrency(currencies, unitCost.currency)),
          // The settled amount only goes as a stamp when it was NOT capped above: `paid` is
          // clamped to the delivery's worth, and a stamp saying "$200" beside a so'm figure
          // that is no longer $200 would contradict it. A capped payment falls back to the
          // plain so'm number, which is the one that is true.
          fxPaidAmount: paid === fxSoum(paidNow, findCurrency(currencies, paidNow.currency))
            ? fxPayload(paidNow, findCurrency(currencies, paidNow.currency))
            : undefined,
        } : undefined,
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
            <FxMoneyInput value={unitCost} onChange={setUnitCost} currencies={currencies} placeholder="0" hideHint />
          </Field>
        </div>
      )}
      {/* Settling on the spot is optional, and only means anything once a supplier is named —
          without one there is no account for the rest to become a debt on. */}
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
      {/* Where the money is going, once it is going by bank. Read straight off the supplier's
          card, so nobody has to open another screen to check an account number mid-delivery. */}

      <NoSupplierNote show={receiving && total > 0 && !supplierId} />
      {receiving && (
        <DeliverySummary supplierId={supplierId} total={total} paid={paid} balance={balances[supplierId] ?? 0} />
      )}
      <div className="flex justify-end">
        <Button disabled={busy || payIncomplete} size="sm" onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
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
  const currencies = useCurrencies();

  useEffect(() => {
    let alive = true;
    setItems(null);
    api.listStockMovements(variantId).then((m) => { if (alive) setItems(m); }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [variantId]);

  // Where a movement's document lives. A sale has no page of its own — the sales screen is a
  // list of today's takings, not a per-sale route — so its number is shown without a link
  // rather than linking somewhere that cannot show it.
  const doc = (m: StockMovement) => (m.sourceKind === "work_order" && m.sourceId ? `/work-orders/${m.sourceId}` : null);

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
              <div className="flex min-w-0 items-center gap-2">
                <Badge tone={income ? "ok" : "danger"}>{income ? t("receive") : t("consume")}</Badge>
                {/* Why it moved, in the language on screen. A reason typed by hand on an
                    adjustment is not one the system wrote and passes through as typed. */}
                <span className="truncate text-muted-foreground">{stockReason(lang, m.reason, !m.sourceNo)}</span>
                {/* And WHICH document moved it — the whole point of a ledger. A shop chasing a
                    count that no longer matches opens the job from here instead of guessing at
                    it from the timestamp. Absent on opening stock, on a hand-made adjustment,
                    and on work-order movements recorded before this was kept. */}
                {m.sourceNo && (doc(m)
                  ? <Link href={doc(m)!} onClick={(e) => e.stopPropagation()}
                      className="shrink-0 font-mono text-[12px] font-bold text-primary-emphasis hover:underline">{m.sourceNo}</Link>
                  : <span className="shrink-0 font-mono text-[12px] font-bold text-foreground">{m.sourceNo}</span>)}
              </div>
              <div className="flex shrink-0 items-center gap-2.5 font-mono">
                <span className={cn("font-bold", income ? "text-success" : "text-destructive")}>
                  {income ? "+" : ""}{qtyUnit(t, m.delta)}
                </span>
                <span className="text-muted-foreground">= {qtyUnit(t, m.balanceAfter, unit)}</span>
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
              {/* What was actually agreed, when it was not so'm. This is the sentence the
                  whole feature exists to keep: six months on, a bare 3 175 000 is a number
                  nobody can account for, and "$250 × 12 700" is an answer. */}
              {income && m.fxUnitCost?.currency && (
                <span className="font-mono font-semibold text-foreground">
                  {fxLabel(m.fxUnitCost, currencies)}
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
