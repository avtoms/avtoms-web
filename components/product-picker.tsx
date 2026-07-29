"use client";
// Picking something off the shelf, wherever that happens: selling over the counter, or adding
// a part to a job.
//
// Both screens used to render every variant of every product as one flat list — a shop with
// 60 products and a few sizes each is several hundred rows to scroll past to find one filter.
// This shows PRODUCTS first and opens a product's variants only when it has more than one, so
// the list you scan is as long as your catalogue rather than your catalogue times its options.
//
// Search is the other half: it matches the product, its brand and category, and the variant
// values and SKUs underneath it, so typing "5w30" finds the oil even though no product is
// called that.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Package, Search } from "lucide-react";
import { Input } from "@/components/ui-kit/input";
import { Badge } from "@/components/ui-kit/badge";
import { useLang } from "@/components/providers";
import { money, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product, ProductVariant } from "@/lib/types";

// What a variant is called on screen: its property values ("5W-30 · 4 l"), falling back to the
// SKU for a product with no properties.
export const variantLabel = (v: ProductVariant) =>
  (v.attributes ?? []).map((a) => a.value).join(" · ") || (v.sku ?? "");

// Everything a row can be searched by, lowercased once per product.
const haystack = (p: Product) =>
  [p.name, p.brand, p.category, ...(p.variants ?? []).flatMap((v) => [v.sku, variantLabel(v)])]
    .filter(Boolean).join(" ").toLowerCase();

const sellableVariants = (p: Product) => (p.variants ?? []).filter((v) => v.active !== false && v.id);
const stockOf = (p: Product) => sellableVariants(p).reduce((s, v) => s + num(v.quantityOnHand), 0);

// A product's price as one figure when its variants agree, and a range when they do not.
function priceLabel(p: Product): string {
  const prices = sellableVariants(p).map((v) => num(v.unitPrice));
  if (prices.length === 0) return "";
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`;
}

export function ProductPicker({
  products, onPick, pickedIds, blockOutOfStock, maxHeight = 360, autoFocus = true, emptyText,
}: {
  products: Product[];
  onPick: (product: Product, variant: ProductVariant) => void;
  pickedIds?: Set<string>;      // variant ids already chosen, ticked in the list
  blockOutOfStock?: boolean;    // a sale cannot go below zero; a job's estimate can
  maxHeight?: number;
  autoFocus?: boolean;
  emptyText: string;
}) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (autoFocus) searchRef.current?.focus(); }, [autoFocus]);

  const live = useMemo(
    () => (products ?? []).filter((p) => p.active !== false && sellableVariants(p).length > 0),
    [products],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return live;
    // Every word has to appear somewhere, so "shell 5w30" narrows rather than widens.
    const words = q.split(/\s+/);
    return live.filter((p) => { const h = haystack(p); return words.every((w) => h.includes(w)); });
  }, [live, query]);

  // Searching inside an opened product is confusing — the results would be filtered by a term
  // the visible list cannot explain. Typing therefore returns to the product list.
  useEffect(() => { if (query) setOpenId(null); }, [query]);

  const open = openId ? live.find((p) => p.id === openId) ?? null : null;

  const pick = (p: Product, v: ProductVariant) => {
    if (blockOutOfStock && num(v.quantityOnHand) <= 0) return;
    onPick(p, v);
  };

  return (
    <div className="flex flex-col gap-2">
      {open ? (
        <button
          type="button"
          onClick={() => setOpenId(null)}
          className="flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {open.name}
        </button>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search") + "…"}
            className="h-9 pl-9 text-[13px]"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight }}>
        {open ? (
          sellableVariants(open).map((v) => (
            <VariantRow
              key={v.id}
              product={open}
              variant={v}
              picked={!!pickedIds?.has(v.id!)}
              blocked={!!blockOutOfStock && num(v.quantityOnHand) <= 0}
              onClick={() => pick(open, v)}
            />
          ))
        ) : matches.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-muted-foreground">{emptyText}</div>
        ) : (
          matches.map((p) => {
            const vs = sellableVariants(p);
            // One variant is not a choice — picking the product picks the thing.
            if (vs.length === 1) {
              return (
                <VariantRow
                  key={p.id}
                  product={p}
                  variant={vs[0]}
                  showProductName
                  picked={!!pickedIds?.has(vs[0].id!)}
                  blocked={!!blockOutOfStock && num(vs[0].quantityOnHand) <= 0}
                  onClick={() => pick(p, vs[0])}
                />
              );
            }
            const left = stockOf(p);
            const chosen = vs.filter((v) => pickedIds?.has(v.id!)).length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpenId(p.id)}
                className="flex items-center gap-3 rounded-[10px] border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary"
              >
                <Package className="size-4 shrink-0 text-muted-foreground" />
                {/* The name is what a person scans by, so it gets the whole line. A price
                    range beside it ("130 000 – 150 000") is wide enough to clip the name to
                    "Chevrolet tormoz kol…", which is unreadable and unsearchable by eye. */}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {p.brand && <Badge tone="info">{p.brand}</Badge>}
                    <span className="truncate text-[13.5px] font-bold text-foreground">{p.name}</span>
                  </div>
                  <div className="truncate text-[11.5px] text-muted-foreground">
                    <span className="font-mono">{priceLabel(p)}</span>
                    {" · "}
                    {t("variants")}: {vs.length}
                    {chosen > 0 && <span className="font-semibold text-primary-emphasis"> · {chosen} ✓</span>}
                    {" · "}
                    <span className={left <= 0 ? "font-semibold text-destructive" : ""}>
                      {left} {p.unit || t("pcs")}
                    </span>
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function VariantRow({ product, variant, picked, blocked, showProductName, onClick }: {
  product: Product;
  variant: ProductVariant;
  picked: boolean;
  blocked: boolean;
  showProductName?: boolean;
  onClick: () => void;
}) {
  const { t } = useLang();
  const left = num(variant.quantityOnHand);
  const label = variantLabel(variant);
  return (
    <button
      type="button"
      disabled={blocked}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors",
        blocked ? "cursor-not-allowed border-border bg-secondary/40 opacity-60"
          : picked ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary",
      )}
    >
      <Package className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {showProductName && product.brand && <Badge tone="info">{product.brand}</Badge>}
          <span className="truncate text-[13.5px] font-bold text-foreground">
            {showProductName ? product.name : (label || product.name)}
          </span>
        </div>
        <div className="truncate text-[11.5px] text-muted-foreground">
          {showProductName && label && <span>{label} · </span>}
          <span className={left <= 0 ? "font-semibold text-destructive" : ""}>
            {t("in_stock")}: {left} {product.unit || t("pcs")}
          </span>
        </div>
      </div>
      <span className="shrink-0 font-mono text-[13px] font-bold text-foreground">{money(num(variant.unitPrice))}</span>
      {picked ? <Check className="size-4 shrink-0 text-primary-emphasis" /> : null}
    </button>
  );
}
