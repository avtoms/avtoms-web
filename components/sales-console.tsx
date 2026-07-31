"use client";
// The counter-sale console: selling warehouse stock to someone who is not having work done.
// No order, no vehicle, no customer — pick the parts, agree the price, take the money.
//
// The whole sale is one call (api.createSale): the gateway moves the stock, issues the
// receipt and marks it paid, reversing everything if any step fails. So there is no
// half-finished state for this screen to represent — a sale either appears in the list, or
// nothing happened.
//
// Mounted twice, because selling is not an owner-only job: at /sales in the owner console
// and at /m/sales for a worker the owner trusted with the counter. The gateway enforces
// that permission; this component assumes the caller already has it.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote, Check, CreditCard, HandCoins, Minus, Plus, Printer, Send, Trash2, Undo2, Wallet,
} from "lucide-react";
import { Card } from "@/components/ui-kit/card";
import { Button } from "@/components/ui-kit/button";
import { Badge } from "@/components/ui-kit/badge";
import { Input } from "@/components/ui-kit/input";
import { Field } from "@/components/ui-kit/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { Spinner } from "@/components/ui-kit/misc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui-kit/dialog";
import { SkeletonRows } from "@/components/ui";
import { ProductPicker, variantLabel } from "@/components/product-picker";
import { MoneyInput } from "@/components/catalog-fields";
import { useAuth, useLang, useToast } from "@/components/providers";
import { useAutoRefresh } from "@/lib/use-refresh";
import { api, ApiError } from "@/lib/api";
import { money, num, shortDateTime } from "@/lib/format";
import { paymentFromProto, paymentLabelKey, type PaymentMethod } from "@/lib/enums";
import { useStaffNames } from "@/lib/use-staff";
import { cn } from "@/lib/utils";
import type { Customer, Product, ProductVariant, Sale, ShopCard } from "@/lib/types";

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : fallback);

const saleLabel = (s: Sale) => "S-" + String(num(s.saleNo) || 0).padStart(4, "0");


// One sellable thing: a variant flattened together with the product it belongs to. `id` is
// pulled out because a variant only exists on the shelf once it has been saved, and an
// unsaved one cannot be sold.
type Sellable = { id: string; product: Product; variant: ProductVariant };
// A line in the basket. `qty` and `price` stay as strings while being typed so a
// half-written "3." or an emptied field doesn't get rewritten under the cursor.
type Line = { key: string; item: Sellable; qty: string; price: string };

// A quantity may be fractional — 3.5 litres of oil is as ordinary a sale as one filter.
const parseQty = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const lineTotal = (l: Line) => Math.round((parseInt(l.price, 10) || 0) * parseQty(l.qty));

export function SalesConsole() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [cards, setCards] = useState<ShopCard[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [discountKind, setDiscountKind] = useState<"fixed" | "percent">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [selling, setSelling] = useState(false);
  const [detail, setDetail] = useState<Sale | null>(null);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      api.listProducts(shopId).catch(() => [] as Product[]),
      api.listSales(shopId).catch(() => [] as Sale[]),
    ]);
    setProducts(p);
    setSales(s);
  }, [shopId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.listShopCards().then((c) => setCards(c.filter((x) => x.active !== false))).catch(() => {}); }, []);
  // Stock moves under this page whenever a mechanic consumes a material, so keep it current.
  useAutoRefresh(load);



  const inBasket = (variantId: string) => lines.find((l) => l.item.id === variantId);
  const pickedIds = useMemo(() => new Set(lines.map((l) => l.item.id)), [lines]);

  const add = (item: Sellable) => {
    const existing = inBasket(item.id);
    if (existing) {
      // Adding the same thing twice bumps its quantity rather than opening a second row.
      setQty(existing.key, String(parseQty(existing.qty) + 1));
      return;
    }
    setLines((ls) => [...ls, {
      key: item.id,
      item,
      qty: "1",
      price: String(num(item.variant.unitPrice)),
    }]);
  };
  const setQty = (key: string, qty: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty } : l)));
  const setPrice = (key: string, price: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, price } : l)));
  const drop = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  // A counter discount is given on the basket, not by re-typing every line's price.
  // discountValue is digits only: tiyin when fixed, whole percent when percent.
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const discountPct = discountKind === "percent";
  const discountRaw = parseInt(discountValue, 10) || 0;
  // Clamped to the basket, the same rule the backend applies, so the screen can never promise
  // a total the server will not honour.
  const discount = Math.min(
    subtotal,
    discountPct ? Math.round((subtotal * discountRaw) / 100) : discountRaw,
  );
  const total = subtotal - discount;
  // A line asking for more than is on the shelf blocks the sale here rather than letting the
  // backend refuse the whole basket after the till has been opened.
  const overStock = lines.filter((l) => parseQty(l.qty) > num(l.item.variant.quantityOnHand));
  const sellable = lines.length > 0 && lines.every((l) => parseQty(l.qty) > 0) && overStock.length === 0;

  const [customers, setCustomers] = useState<Customer[]>([]);

  const sell = async (method: PaymentMethod, card?: { cardId?: string; cardNumber?: string }, customerId?: string) => {
    if (!sellable || selling) return;
    setSelling(true);
    try {
      const sale = await api.createSale({
        items: lines.map((l) => ({
          variantId: l.item.id,
          quantity: parseQty(l.qty),
          unitPrice: parseInt(l.price, 10) || 0,
        })),
        method, cardId: card?.cardId, cardNumber: card?.cardNumber,
        // Optional: naming a buyer is what lets the receipt be sent to them.
        customerId,
        // Percent goes over the wire as basis points, the unit the contract uses.
        discountKind: discount > 0 ? discountKind : undefined,
        discountValue: discountPct ? discountRaw * 100 : discountRaw,
      });
      setLines([]);
      setDiscountValue("");
      setPayOpen(false);
      toast(`${saleLabel(sale)} · ${money(sale.total)} ${t("soum")}`, { icon: "money" });
      // No money came in, so the "sold!" toast on its own would be misleading. Say where
      // the amount went instead.
      if (method === "credit") {
        const who = customers.find((c) => c.id === customerId)?.name;
        toast(`${t("cl_charge")}${who ? " · " + who : ""}`, { icon: "alert", tone: "accent" });
      }
      // Delivery is best-effort and happens after the sale is committed, so tell the
      // cashier which way it went rather than leaving them to wonder.
      if (customerId) {
        const sent = customers.find((c) => c.id === customerId)?.telegramChatId;
        toast(t(sent ? "receipt_sent" : "receipt_not_linked"), { icon: sent ? "check" : "alert", tone: sent ? "ok" : "accent" });
      }
      setDetail(sale);
      await load();
    } catch (e) {
      toast(errMsg(e, t("error")), { icon: "alert", tone: "danger" });
    } finally {
      setSelling(false);
    }
  };

  const voidSale = async (s: Sale) => {
    try {
      const updated = await api.voidSale(s.id);
      setDetail(updated);
      toast(t("sale_voided"), { icon: "check" });
      await load();
    } catch (e) {
      toast(errMsg(e, t("error")), { icon: "alert", tone: "danger" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[24px] font-extrabold tracking-[-0.025em] text-foreground">{t("nav_sales")}</h1>
        <div className="mt-0.5 text-[13px] font-medium text-muted-foreground">{t("sales_hint")}</div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* ── what's on the shelf ── */}
        <Card className="gap-3 px-5 py-4">
          <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">{t("nav_inventory")}</h2>

          {products === null ? (
            <SkeletonRows rows={5} avatar={false} />
          ) : (
            <ProductPicker
              products={products}
              onPick={(product, variant) => add({ id: variant.id!, product, variant })}
              pickedIds={pickedIds}
              blockOutOfStock
              maxHeight={520}
              emptyText={t("empty")}
            />
          )}
        </Card>

        {/* ── the basket ── */}
        <Card className="gap-3 px-5 py-4">
          <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">{t("sale_basket")}</h2>

          {lines.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">{t("sale_basket_empty")}</div>
          ) : (
            <div className="flex flex-col gap-3">
              {lines.map((l) => {
                const left = num(l.item.variant.quantityOnHand);
                const over = parseQty(l.qty) > left;
                return (
                  <div key={l.key} className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-bold text-foreground">{l.item.product.name}</div>
                        {variantLabel(l.item.variant) && (
                          <div className="truncate text-[11.5px] text-muted-foreground">{variantLabel(l.item.variant)}</div>
                        )}
                      </div>
                      <button onClick={() => drop(l.key)} aria-label={t("delete")} className="shrink-0 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-[1fr_1fr] gap-2">
                      <Field label={`${t("qty")} (${l.item.product.unit || t("pcs")})`}>
                        <div className="flex items-center gap-1">
                          <Button variant="secondary" size="icon-sm" onClick={() => setQty(l.key, String(Math.max(0, parseQty(l.qty) - 1)))}><Minus /></Button>
                          {/* Decimal, not integer: half a litre is a real sale. */}
                          <Input
                            value={l.qty}
                            inputMode="decimal"
                            onChange={(e) => setQty(l.key, e.target.value.replace(/[^\d.,]/g, ""))}
                            className={cn("h-8 text-center font-mono text-[13px]", over && "border-destructive")}
                          />
                          <Button variant="secondary" size="icon-sm" onClick={() => setQty(l.key, String(parseQty(l.qty) + 1))}><Plus /></Button>
                        </div>
                      </Field>
                      <Field label={t("sell_price")}>
                        <MoneyInput value={l.price} onChange={(v) => setPrice(l.key, v)} />
                      </Field>
                    </div>
                    {over && (
                      <div className="text-[12px] font-semibold text-destructive">
                        {t("only_n_left")}: {left} {l.item.product.unit || t("pcs")}
                      </div>
                    )}
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] text-muted-foreground">{t("total")}</span>
                      <span className="font-mono text-[14px] font-extrabold text-foreground">{money(lineTotal(l))}</span>
                    </div>
                  </div>
                );
              })}

              {/* Discount on the whole basket. Percent or a flat sum — the two ways a counter
                  discount is actually given. */}
              <div className="flex items-center gap-2">
                <Tabs value={discountKind} onValueChange={(v: string) => setDiscountKind(v as "fixed" | "percent")}>
                  <TabsList>
                    <TabsTrigger value="percent" className="px-3">%</TabsTrigger>
                    <TabsTrigger value="fixed" className="px-3">{t("soum")}</TabsTrigger>
                  </TabsList>
                </Tabs>
                {discountPct ? (
                  <Input value={discountValue} inputMode="numeric" placeholder={t("discount")}
                    className="h-9 flex-1 font-mono text-[13px]"
                    onChange={(e) => setDiscountValue(e.target.value.replace(/\D/g, "").slice(0, 3))} />
                ) : (
                  <div className="flex-1"><MoneyInput value={discountValue} onChange={setDiscountValue} placeholder={t("discount")} hideHint /></div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 rounded-[12px] bg-secondary/60 px-4 py-3">
                {discount > 0 && (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12.5px] text-muted-foreground">{t("subtotal")}</span>
                      <span className="font-mono text-[13px] font-semibold text-foreground">{money(subtotal)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12.5px] text-muted-foreground">{t("discount")}</span>
                      <span className="font-mono text-[13px] font-bold text-success">−{money(discount)}</span>
                    </div>
                  </>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold text-muted-foreground">{t("total")}</span>
                  <span className="font-mono text-[20px] font-extrabold tracking-[-0.02em] text-foreground">
                    {money(total)} <span className="font-sans text-[12px] font-semibold text-muted-foreground">{t("soum")}</span>
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setLines([])}>{t("cancel")}</Button>
                <Button className="flex-1" disabled={!sellable || selling} onClick={() => setPayOpen(true)}>
                  {selling ? <Spinner /> : <Banknote />}{t("sell")}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── what has been sold ── */}
      <Card className="gap-3 px-5 py-4">
        <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">{t("sales_history")}</h2>
        {sales === null ? (
          <SkeletonRows rows={4} avatar={false} />
        ) : sales.length === 0 ? (
          <div className="py-10 text-center text-[13.5px] text-muted-foreground">{t("no_sales")}</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sales.map((s) => (
              <button
                key={s.id}
                onClick={() => setDetail(s)}
                className="flex items-center gap-3 rounded-[10px] border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13.5px] font-bold text-foreground">{saleLabel(s)}</span>
                    {s.voided
                      ? <Badge tone="danger">{t("voided")}</Badge>
                      : <Badge tone="neutral">{t(paymentLabelKey(paymentFromProto(s.paymentMethod)))}</Badge>}
                  </div>
                  <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                    {shortDateTime(s.createdAt)} · {(s.items ?? []).length} {t("items_n")}
                  </div>
                </div>
                <span className={cn("shrink-0 font-mono text-[14px] font-extrabold", s.voided ? "text-muted-foreground line-through" : "text-foreground")}>
                  {money(s.total)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <PayDialog
        open={payOpen}
        total={total}
        cards={cards}
        busy={selling}
        shopId={shopId}
        onClose={() => setPayOpen(false)}
        onPay={sell}
        onCustomers={setCustomers}
      />
      <SaleDetailDialog sale={detail} onClose={() => setDetail(null)} onVoid={voidSale} />
    </div>
  );
}

/* ── taking the money ── */
function PayDialog({ open, total, cards, busy, shopId, onClose, onPay, onCustomers }: {
  open: boolean; total: number; cards: ShopCard[]; busy: boolean; shopId: string;
  onClose: () => void;
  onPay: (m: PaymentMethod, card?: { cardId?: string; cardNumber?: string }, customerId?: string) => void;
  onCustomers: (list: Customer[]) => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [cardMode, setCardMode] = useState(false);
  const [pickedCard, setPickedCard] = useState("");
  const [adhoc, setAdhoc] = useState("");
  // Who to send the check to. Optional throughout: a walk-in leaves it alone and the sale
  // behaves exactly as it did before this existed.
  const [buyerQuery, setBuyerQuery] = useState("");
  const [buyer, setBuyer] = useState<Customer | null>(null);
  const [matches, setMatches] = useState<Customer[]>([]);
  useEffect(() => {
    if (!open) { setCardMode(false); setPickedCard(""); setAdhoc(""); setBuyer(null); setBuyerQuery(""); setMatches([]); }
  }, [open]);
  // Search only once the cashier has typed enough to mean something, and never while a
  // buyer is already chosen.
  useEffect(() => {
    if (!open || buyer || buyerQuery.trim().length < 2) { setMatches([]); return; }
    let alive = true;
    const id = setTimeout(() => {
      api.listCustomers(shopId, buyerQuery.trim())
        .then((list) => { if (alive) { setMatches(list.slice(0, 5)); onCustomers(list); } })
        .catch(() => { if (alive) setMatches([]); });
    }, 250);
    return () => { alive = false; clearTimeout(id); };
  }, [open, buyer, buyerQuery, shopId, onCustomers]);

  const payCard = () => {
    const chosen = cards.find((c) => c.id === pickedCard);
    const number = chosen ? chosen.cardNumber : adhoc.trim();
    if (!number) { toast(t("card_required"), { icon: "alert", tone: "danger" }); return; }
    onPay("card", { cardId: chosen ? chosen.id : undefined, cardNumber: number }, buyer?.id);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader><DialogTitle>{t("payment_method")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-4 pb-5">
          <div className="flex items-baseline justify-between rounded-[12px] bg-secondary/60 px-4 py-3">
            <span className="text-[13px] font-semibold text-muted-foreground">{t("total")}</span>
            <span className="font-mono text-[20px] font-extrabold text-foreground">{money(total)} {t("soum")}</span>
          </div>

          {/* Optional recipient. Left blank the sale is anonymous, exactly as before. */}
          <Field label={t("send_check_to")} hint={t("send_check_to_hint")}>
            {buyer ? (
              <div className="flex items-center gap-2 rounded-[9px] border border-primary bg-primary-soft px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold">{buyer.name || t("walk_in_customer")}</div>
                  <div className="truncate font-mono text-[12.5px] text-muted-foreground">
                    {buyer.phone}{!buyer.telegramChatId && ` · ${t("receipt_not_linked")}`}
                  </div>
                </div>
                <button className="text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
                  onClick={() => { setBuyer(null); setBuyerQuery(""); }}>✕</button>
              </div>
            ) : (
              <>
                <Input value={buyerQuery} placeholder={t("search")} onChange={(e) => setBuyerQuery(e.target.value)} />
                {matches.length > 0 && (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {matches.map((c) => (
                      <button key={c.id} onClick={() => { setBuyer(c); setMatches([]); }}
                        className="flex items-center gap-2 rounded-[9px] border border-border bg-card px-3 py-2 text-left hover:bg-secondary">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] font-semibold">{c.name || t("walk_in_customer")}</div>
                          <div className="truncate font-mono text-[12.5px] text-muted-foreground">{c.phone}</div>
                        </div>
                        {c.telegramChatId && <Send className="size-4 text-muted-foreground" />}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Field>

          {!cardMode ? (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-3 gap-2.5">
                <Button variant="soft" disabled={busy} onClick={() => onPay("cash", undefined, buyer?.id)}><Banknote />{t("pay_cash")}</Button>
                <Button variant="soft" disabled={busy} onClick={() => setCardMode(true)}><CreditCard />{t("pay_card")}</Button>
                <Button variant="soft" disabled={busy} onClick={() => onPay("other", undefined, buyer?.id)}><Wallet />{t("pay_other")}</Button>
              </div>
              {/* Nasiya. Disabled rather than hidden without a buyer, so the cashier can see
                  the option exists and what unlocks it — a debt has to be owed by somebody,
                  and the server refuses one that is not. */}
              <Button variant="soft" disabled={busy || !buyer} onClick={() => onPay("credit", undefined, buyer?.id)}>
                <HandCoins />{t("pay_credit")}
              </Button>
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                {buyer ? t("credit_hint") : t("credit_needs_client")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="text-[12.5px] font-semibold text-muted-foreground">{t("pay_card")} · {t("select_card")}</div>
                <button className="text-[12.5px] font-semibold text-muted-foreground hover:text-foreground" onClick={() => { setCardMode(false); setPickedCard(""); setAdhoc(""); }}>← {t("back")}</button>
              </div>
              {cards.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {cards.map((c) => (
                    <button key={c.id} onClick={() => { setPickedCard(c.id); setAdhoc(""); }}
                      className={cn("flex items-center gap-3 rounded-[9px] border px-3 py-2.5 text-left transition-colors", pickedCard === c.id ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary")}>
                      <CreditCard className="size-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        {c.label && <div className="truncate text-[13.5px] font-semibold">{c.label}</div>}
                        <div className="truncate font-mono text-[13px] text-muted-foreground">{c.cardNumber}</div>
                      </div>
                      {pickedCard === c.id && <Check className="size-[17px] text-primary-emphasis" />}
                    </button>
                  ))}
                </div>
              )}
              <Field label={cards.length > 0 ? t("new_card") : t("card_number")}>
                <Input value={adhoc} inputMode="numeric" placeholder="8600 0000 0000 0000" className="font-mono"
                  onChange={(e) => { setAdhoc(e.target.value); if (e.target.value) setPickedCard(""); }} />
              </Field>
              <Button disabled={busy || (!pickedCard && !adhoc.trim())} onClick={payCard}>{t("sell")}</Button>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/* ── one sale, after the fact ── */
function SaleDetailDialog({ sale, onClose, onVoid }: { sale: Sale | null; onClose: () => void; onVoid: (s: Sale) => void }) {
  const { t } = useLang();
  const who = useStaffNames();
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { setConfirming(false); }, [sale?.id]);
  if (!sale) return null;

  return (
    <Dialog open={!!sale} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-mono">{saleLabel(sale)}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 pb-5">
          <div className="flex items-center justify-between">
            <Badge tone={sale.voided ? "danger" : "ok"} dot>{sale.voided ? t("voided") : t("paid")}</Badge>
            <span className="font-mono text-[12px] text-muted-foreground">
              {shortDateTime(sale.createdAt)}{who(sale.staffId) ? " · " + who(sale.staffId) : ""}
            </span>
          </div>

          <div className="rounded-[12px] bg-secondary/60 p-4">
            {(sale.items ?? []).map((it, i) => (
              <div key={it.id || i} className="flex items-center gap-3 border-b border-border py-2 first:pt-0 last:border-b-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-foreground">{it.description}</div>
                  <div className="font-mono text-[11.5px] text-muted-foreground">{money(it.unitPrice)} × {it.quantity}</div>
                </div>
                <span className="shrink-0 font-mono text-[13px] font-bold">{money(Math.round(num(it.unitPrice) * (it.quantity || 0)))}</span>
              </div>
            ))}
            {/* A receipt that omits the discount looks like the prices were simply lower.
                Shown the same way the basket showed it before the sale was taken. */}
            {num(sale.discountAmount) > 0 && (
              <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span className="text-muted-foreground">{t("subtotal")}</span>
                  <span className="font-mono font-semibold">{money(sale.subtotal || sale.total)}</span>
                </div>
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span className="text-muted-foreground">
                    {t("discount")}
                    {sale.discountKind === "DISCOUNT_KIND_PERCENT" && ` ${num(sale.discountValue) / 100}%`}
                  </span>
                  <span className="font-mono font-bold text-success">−{money(num(sale.discountAmount))}</span>
                </div>
              </div>
            )}
            <div className="mt-2 flex items-baseline justify-between border-t-2 border-foreground pt-2.5">
              <span className="text-[13px] font-bold text-muted-foreground">{t("total")}</span>
              <span className="font-mono text-[18px] font-extrabold">{money(sale.total)} {t("soum")}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-[9px] border border-border bg-card px-3 py-2 text-[13px]">
            <CreditCard className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t(paymentLabelKey(paymentFromProto(sale.paymentMethod)))}</span>
            {sale.cardNumber && <span className="ml-auto font-mono font-semibold">{sale.cardNumber}</span>}
          </div>

          {sale.invoiceId && (
            <Button variant="secondary" onClick={() => window.open(`/print-invoice/${sale.invoiceId}`, "_blank")}>
              <Printer />{t("print")}
            </Button>
          )}

          {/* Voiding puts the stock back and takes the money out of the statistics, so it asks
              once before doing it. */}
          {!sale.voided && (confirming ? (
            <div className="flex flex-col gap-2 rounded-[10px] border border-destructive/40 bg-destructive-soft p-3">
              <div className="text-[13px] font-semibold text-destructive">{t("void_sale_confirm")}</div>
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setConfirming(false)}>{t("cancel")}</Button>
                <Button variant="destructive" className="flex-1" onClick={() => onVoid(sale)}><Undo2 />{t("void_sale")}</Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}><Undo2 />{t("void_sale")}</Button>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
