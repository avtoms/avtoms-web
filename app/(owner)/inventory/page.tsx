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
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product, ProductVariant, PropertyDefinition } from "@/lib/types";

// Total on-hand across a product's variants, and whether any variant is low.
const totalStock = (p: Product) => (p.variants ?? []).reduce((s, v) => s + num(v.quantityOnHand), 0);
const anyLow = (p: Product) => (p.variants ?? []).some((v) => num(v.quantityOnHand) <= num(v.reorderLevel));
const variantLabel = (v: ProductVariant) =>
  (v.attributes ?? []).map((a) => a.value).join(" · ") || (v.sku ?? "");

// Resolve a color swatch for an attribute value from the predefined catalog.
const hexOf = (defs: PropertyDefinition[], prop: string, value: string) =>
  defs.find((d) => d.name === prop && d.kind === "color")?.values?.find((x) => x.value === value)?.colorHex || undefined;

export default function InventoryPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [list, setList] = useState<Product[]>([]);
  const [definitions, setDefinitions] = useState<PropertyDefinition[]>([]);
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
  // The predefined property catalog powers the product form and value swatches.
  useEffect(() => { api.listPropertyDefinitions().then(setDefinitions).catch(() => {}); }, []);

  const columns = useMemo<ColumnDef<Product>[]>(() => [
    {
      id: "name",
      accessorFn: (p) => `${p.name || ""} ${p.category || ""} ${p.supplier || ""}`,
      header: ({ column }) => <SortHeader column={column}>{t("product_name")}</SortHeader>,
      cell: ({ row }) => {
        const p = row.original;
        const count = (p.variants ?? []).length;
        return (
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-foreground">{p.name}</div>
            <div className="flex flex-wrap gap-x-2 text-[11.5px] text-muted-foreground">
              {p.category && <span>{p.category}</span>}
              {p.supplier && <span>· {p.supplier}</span>}
              <span>· {count} {t("variants").toLowerCase()}</span>
            </div>
          </div>
        );
      },
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
              {num(totalStock(p))}{p.unit ? " " + p.unit : ""}
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
  ], [t]);

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
          columnLabels={{ name: t("product_name"), stock: t("in_stock") }}
          pageSize={12}
        />
      )}
      <ProductForm
        open={!!editing}
        mode={editing?.mode ?? "new"}
        product={editing?.product ?? null}
        shopId={shopId}
        definitions={definitions}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
      <ManageModal
        product={managing}
        definitions={definitions}
        onClose={() => setManaging(null)}
        onEdit={(p) => { setManaging(null); setEditing({ mode: "edit", product: p }); }}
        onDone={load}
      />
    </div>
  );
}

// ManageModal lists a product's variants with their stock and a per-variant
// receive/consume stock adjustment.
function ManageModal({
  product, definitions, onClose, onEdit, onDone,
}: {
  product: Product | null;
  definitions: PropertyDefinition[];
  onClose: () => void;
  onEdit: (p: Product) => void;
  onDone: () => void;
}) {
  const { t } = useLang();
  const [adjust, setAdjust] = useState<ProductVariant | null>(null);
  useEffect(() => { if (!product) setAdjust(null); }, [product]);

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader><DialogTitle>{product?.name ?? ""}</DialogTitle></DialogHeader>
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
                    <span className="shrink-0 rounded-[6px] bg-white p-0.5" title={v.sku}>
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
                            {a.value}
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
                      {num(v.quantityOnHand)}{product.unit ? " " + product.unit : ""}
                    </span>
                    {low && <Badge tone="danger" dot>{t("low_stock")}</Badge>}
                    <Button variant="soft" size="sm" onClick={() => setAdjust(isAdjusting ? null : v)}>{t("adjust_stock")}</Button>
                  </div>
                </div>
                {isAdjusting && <AdjustPanel variant={v} unit={product.unit} onClose={() => setAdjust(null)} onDone={onDone} />}
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

// AdjustPanel is an inline receive/consume control for one variant.
function AdjustPanel({
  variant, unit, onClose, onDone,
}: {
  variant: ProductVariant;
  unit?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [mode, setMode] = useState<"receive" | "consume">("receive");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0 || busy || !variant.id) return;
    setBusy(true);
    try {
      await api.adjustVariantStock(variant.id, mode === "consume" ? -amt : amt, reason.trim() || mode);
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
        <Field label={t("qty") + (unit ? ` (${unit})` : "")}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0" className="font-mono" />
        </Field>
        <Field label={t("notes")}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end">
        <Button disabled={busy} size="sm" onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
      </div>
    </div>
  );
}
