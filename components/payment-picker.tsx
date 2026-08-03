"use client";
// How money moved — asked the same way everywhere it moves.
//
// Paying the landlord, settling with a supplier and taking a client's repayment are the same
// question, so they get the same control: cash, card, other, or a split across them. A shop
// that learns it once on the expense dialog already knows it on the supplier account.
//
// The split rows work like the till's: every row but the last carries a typed amount and the
// last one is the remainder, so the parts always add up and there is nothing to reconcile
// before the button can be pressed. The server refuses a split that does not sum to the
// amount, which is a rule worth keeping unreachable rather than explaining.
import React, { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Wallet, Split, Plus, X, Check } from "lucide-react";
import { Input } from "@/components/ui-kit/input";
import { Badge } from "@/components/ui-kit/badge";
import { MoneyInput } from "@/components/catalog-fields";
import { useLang } from "@/components/providers";
import { money } from "@/lib/format";
import { paymentLabelKey, type PaymentMethod } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { api, type PaymentPart } from "@/lib/api";
import type { ShopCard } from "@/lib/types";

// What the picker holds. `mode` is a single method, or "split" for several.
export type Payment = {
  mode: PaymentMethod | "split";
  cardId: string;
  cardNumber: string;
  rows: { method: PaymentMethod; amount: string; cardId: string; cardNumber: string }[];
};

// The three ways money moves out of, or into, a shop by hand. Credit is deliberately absent:
// it means nobody paid, which is a debt on an account rather than a movement of money, and
// both ledgers already have a direction for that.
const METHODS: PaymentMethod[] = ["cash", "card", "other"];

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  cash: Banknote, card: CreditCard, other: Wallet, split: Split,
};

export const blankPayment = (): Payment => ({
  mode: "cash", cardId: "", cardNumber: "",
  rows: [
    { method: "cash", amount: "", cardId: "", cardNumber: "" },
    { method: "card", amount: "", cardId: "", cardNumber: "" },
  ],
});

export function usePayment() {
  const [payment, setPayment] = useState<Payment>(blankPayment);
  return { payment, setPayment, reset: () => setPayment(blankPayment()) };
}

// toParts turns the picker's state into what the API takes, given the amount being paid.
// Returns null when the split does not describe a whole payment yet — the caller keeps its
// save button disabled rather than sending something the server will refuse.
export function toParts(p: Payment, total: number): PaymentPart[] | null {
  if (total <= 0) return null;
  if (p.mode !== "split") {
    if (p.mode === "card" && !p.cardId && !p.cardNumber.trim()) return null;
    return [{
      amount: total, method: p.mode,
      cardId: p.mode === "card" ? p.cardId || undefined : undefined,
      cardNumber: p.mode === "card" ? p.cardNumber.trim() || undefined : undefined,
    }];
  }
  const allocated = p.rows.slice(0, -1).reduce((s, r) => s + (parseInt(r.amount, 10) || 0), 0);
  const rest = total - allocated;
  if (rest <= 0) return null;
  if (p.rows.some((r, i) => i < p.rows.length - 1 && (parseInt(r.amount, 10) || 0) <= 0)) return null;
  if (p.rows.some((r) => r.method === "card" && !r.cardId && !r.cardNumber.trim())) return null;
  return p.rows.map((r, i) => ({
    amount: i === p.rows.length - 1 ? rest : parseInt(r.amount, 10) || 0,
    method: r.method,
    cardId: r.method === "card" ? r.cardId || undefined : undefined,
    cardNumber: r.method === "card" ? r.cardNumber.trim() || undefined : undefined,
  }));
}

export function PaymentPicker({ value, onChange, total, cards, disabled }: {
  value: Payment;
  onChange: (p: Payment) => void;
  total: number;
  cards: ShopCard[];
  disabled?: boolean;
}) {
  const { t } = useLang();
  const set = (patch: Partial<Payment>) => onChange({ ...value, ...patch });
  const setRow = (i: number, patch: Partial<Payment["rows"][number]>) =>
    onChange({ ...value, rows: value.rows.map((r, n) => (n === i ? { ...r, ...patch } : r)) });

  const allocated = value.rows.slice(0, -1).reduce((s, r) => s + (parseInt(r.amount, 10) || 0), 0);
  const rest = total - allocated;
  // A card payment that does not name a card is refused, so the button stays dark. Saying why
  // costs one line; leaving it unsaid makes the form look broken.
  const unnamedCard = value.mode === "card"
    ? !value.cardId && !value.cardNumber.trim()
    : value.mode === "split" && value.rows.some((r) => r.method === "card" && !r.cardId && !r.cardNumber.trim());

  return (
    <div className="flex flex-col gap-2">
      {/* Two across on a phone, four when there is room. Four on a 390px screen truncates
          "Aralash" to "Arala…", and the split is the one choice a shop cannot guess from
          its icon. */}
      <div className="grid grid-cols-2 gap-1 min-[420px]:grid-cols-4">
        {([...METHODS, "split"] as const).map((m) => {
          const Icon = ICON[m];
          const on = value.mode === m;
          return (
            <button key={m} type="button" disabled={disabled} onClick={() => set({ mode: m, cardId: "", cardNumber: "" })}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[9px] border px-2 text-[12.5px] font-semibold transition-colors sm:min-h-9",
                on ? "border-primary bg-primary-soft text-primary-emphasis"
                   : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}>
              <Icon className="size-[15px] shrink-0" />
              <span className="truncate">{t(m === "split" ? "pay_split" : paymentLabelKey(m))}</span>
            </button>
          );
        })}
      </div>

      {value.mode === "card" && (
        <CardChoice cards={cards} cardId={value.cardId} cardNumber={value.cardNumber} disabled={disabled}
          onPick={(cardId) => set({ cardId, cardNumber: "" })}
          onType={(cardNumber) => set({ cardNumber, cardId: cardNumber ? "" : value.cardId })} />
      )}

      {value.mode === "split" && (
        <div className="flex flex-col gap-2 rounded-[11px] border border-border bg-secondary/30 p-2.5">
          {value.rows.map((row, i) => {
            const last = i === value.rows.length - 1;
            return (
              <div key={i} className="flex flex-col gap-1.5 rounded-[9px] border border-border bg-card p-2">
                <div className="flex items-center gap-1.5">
                  <div className="grid flex-1 grid-cols-3 gap-1">
                    {METHODS.map((m) => (
                      <button key={m} type="button" disabled={disabled}
                        onClick={() => setRow(i, { method: m, cardId: "", cardNumber: "" })}
                        className={cn(
                          "inline-flex min-h-9 items-center justify-center gap-1 rounded-[7px] border px-1 text-[12px] font-semibold transition-colors",
                          row.method === m ? "border-primary bg-primary-soft text-primary-emphasis"
                                           : "border-border bg-card text-muted-foreground hover:bg-secondary",
                        )}>
                        {React.createElement(ICON[m], { className: "size-3.5 shrink-0" })}
                        <span className="truncate">{t(paymentLabelKey(m))}</span>
                      </button>
                    ))}
                  </div>
                  {value.rows.length > 2 && (
                    <button type="button" disabled={disabled} aria-label={t("delete")}
                      onClick={() => onChange({ ...value, rows: value.rows.filter((_, n) => n !== i) })}
                      className="shrink-0 rounded-[7px] p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                {last ? (
                  // The remainder, shown rather than typed. There is no state in which the
                  // parts do not add up, so nothing has to be reconciled before saving.
                  <div className="flex items-baseline justify-between rounded-[7px] bg-secondary/70 px-2.5 py-1.5">
                    <span className="text-[12px] font-semibold text-muted-foreground">{t("split_rest")}</span>
                    <span className={cn("font-mono text-[14px] font-extrabold", rest > 0 ? "text-foreground" : "text-destructive")}>
                      {money(rest)}
                    </span>
                  </div>
                ) : (
                  <MoneyInput value={row.amount} onChange={(d) => setRow(i, { amount: d })} hideHint placeholder="0" />
                )}
                {row.method === "card" && (
                  <CardChoice cards={cards} cardId={row.cardId} cardNumber={row.cardNumber} disabled={disabled}
                    onPick={(cardId) => setRow(i, { cardId, cardNumber: "" })}
                    onType={(cardNumber) => setRow(i, { cardNumber, cardId: cardNumber ? "" : row.cardId })} />
                )}
              </div>
            );
          })}
          {value.rows.length < 4 && (
            <button type="button" disabled={disabled}
              onClick={() => onChange({ ...value, rows: [...value.rows, { method: "other", amount: "", cardId: "", cardNumber: "" }] })}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[9px] border border-dashed border-border text-[12.5px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Plus className="size-3.5" /> {t("split_add_part")}
            </button>
          )}
          {rest <= 0 && <p className="px-0.5 text-[11.5px] leading-snug text-destructive">{t("split_over")}</p>}
        </div>
      )}

      {unnamedCard && <p className="px-0.5 text-[11.5px] leading-snug text-muted-foreground">{t("pay_which_card")}</p>}
    </div>
  );
}

// Which card the money moved through — chosen from the shop's own, or typed once.
function CardChoice({ cards, cardId, cardNumber, disabled, onPick, onType }: {
  cards: ShopCard[]; cardId: string; cardNumber: string; disabled?: boolean;
  onPick: (id: string) => void; onType: (n: string) => void;
}) {
  const { t } = useLang();
  return (
    <div className="flex flex-col gap-1.5">
      {cards.map((c) => (
        <button key={c.id} type="button" disabled={disabled} onClick={() => onPick(c.id)}
          className={cn("flex min-h-11 items-center gap-2.5 rounded-[9px] border px-2.5 py-1.5 text-left transition-colors sm:min-h-9",
            cardId === c.id ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary")}>
          <CreditCard className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            {c.label && <div className="truncate text-[13px] font-semibold">{c.label}</div>}
            <div className="truncate font-mono text-[12px] text-muted-foreground">{c.cardNumber}</div>
          </div>
          {cardId === c.id && <Check className="size-4 shrink-0 text-primary-emphasis" />}
        </button>
      ))}
      <Input value={cardNumber} inputMode="numeric" className="font-mono" disabled={disabled}
        placeholder={cards.length > 0 ? t("new_card") : t("card_number")}
        onChange={(e) => onType(e.target.value)} />
    </div>
  );
}

/* ── reading it back ──────────────────────────────────────────────────────────────────── */

// What the server sends back on a movement: the first part flattened onto the row, plus the
// parts themselves. Every screen that shows money moving reads this one shape.
export type Paid = {
  method?: string;
  cardNumber?: string;
  parts?: { amount?: string | number; method?: string; cardNumber?: string }[];
};

// PaidBadge says how a movement was paid, in one chip. A split names its parts rather than
// saying "split", because "cash + card" is the answer and "split" is only the shape of it.
//
// A movement recorded before any of this existed has neither, and gets nothing at all — an
// absent badge is honest, where a "cash" badge on a row nobody recorded would be a guess.
export function PaidBadge({ paid, className }: { paid: Paid | undefined; className?: string }) {
  const { t } = useLang();
  const parts = paid?.parts ?? [];
  const label = useMemo(() => {
    const names = (parts.length > 0 ? parts.map((p) => p.method) : [paid?.method])
      .filter(Boolean)
      .map((m) => methodKey(m as string));
    const seen: string[] = [];
    for (const n of names) if (n && !seen.includes(n)) seen.push(n);
    return seen.map((k) => t(paymentLabelKey(k as PaymentMethod))).join(" + ");
  }, [parts, paid?.method, t]);

  if (!label) return null;
  const card = parts.find((p) => methodKey(p.method) === "card")?.cardNumber || paid?.cardNumber || "";
  return (
    <Badge tone="neutral" className={className}>
      {React.createElement(ICON[parts.length > 1 ? "split" : methodKey(paid?.method) || "cash"] ?? Wallet, { className: "mr-1 size-3" })}
      {label}{card ? <span className="ml-1 font-mono opacity-70">{card}</span> : null}
    </Badge>
  );
}

// PaidParts spells a split out line by line, for the places with room to show it.
export function PaidParts({ paid }: { paid: Paid | undefined }) {
  const { t } = useLang();
  const parts = paid?.parts ?? [];
  if (parts.length < 2) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {parts.map((p, i) => (
        <div key={i} className="flex items-baseline justify-between gap-3 text-[12.5px]">
          <span className="text-muted-foreground">
            {t(paymentLabelKey((methodKey(p.method) || "cash") as PaymentMethod))}
            {p.cardNumber ? <span className="ml-1 font-mono opacity-70">{p.cardNumber}</span> : null}
          </span>
          <span className="font-mono font-semibold text-foreground">{money(Number(p.amount ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

// The proto enum name reduced to the app's short key. Unspecified stays empty, which is what
// tells the badge to show nothing rather than to guess.
function methodKey(s?: string): PaymentMethod | "" {
  if (!s || s === "PAYMENT_METHOD_UNSPECIFIED") return "";
  if (s === "PAYMENT_METHOD_CARD") return "card";
  if (s === "PAYMENT_METHOD_OTHER") return "other";
  if (s === "PAYMENT_METHOD_CREDIT") return "credit";
  return "cash";
}

// useShopCards loads the shop's receiving cards once per screen that offers a card payment.
export function useShopCards(shopId?: string) {
  const [cards, setCards] = useState<ShopCard[]>([]);
  useEffect(() => {
    let live = true;
    api.listShopCards(shopId)
      .then((c) => { if (live) setCards(c.filter((x) => x.active !== false)); })
      .catch(() => {});
    return () => { live = false; };
  }, [shopId]);
  return cards;
}
