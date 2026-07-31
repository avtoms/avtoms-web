"use client";

// Taking one bill two ways at once — part cash, part card, part on account.
//
// Shared by the counter till and the order-close dialog, because a shop should not have to
// learn two ways of doing the same thing depending on which screen it is standing on.
//
// The last row is always the remainder. Amounts are typed into every row above it and what
// is left lands there by itself, so there is no state in which the parts do not add up and
// nothing to reconcile before the button can be pressed. It also means the number the
// cashier cares about — "how much is still to go on the card" — is on screen at all times
// rather than being something they work out.

import { useEffect, useState } from "react";
import { Banknote, CreditCard, HandCoins, Wallet, Plus, X, Check } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { MoneyInput } from "@/components/catalog-fields";
import { useLang } from "@/components/providers";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PaymentPart } from "@/lib/api";
import type { PaymentMethod } from "@/lib/enums";
import type { ShopCard } from "@/lib/types";

type Row = {
  method: PaymentMethod;
  amount: string;   // digits only, tiyin; ignored on the last row, which is the remainder
  cardId: string;
  cardNumber: string;
};

const ICONS: Record<PaymentMethod, React.ComponentType<{ className?: string }>> = {
  cash: Banknote, card: CreditCard, other: Wallet, credit: HandCoins,
};

const LABEL: Record<PaymentMethod, string> = {
  cash: "pay_cash", card: "pay_card", other: "pay_other", credit: "pay_credit",
};

export function SplitPayment({
  total, cards, busy, allowCredit, onBack, onPay,
}: {
  total: number;
  cards: ShopCard[];
  busy: boolean;
  // Nasiya needs somebody to owe it. The till only allows it once a buyer is named; the
  // order-close dialog always has one, because a car has an owner.
  allowCredit: boolean;
  onBack: () => void;
  onPay: (parts: PaymentPart[]) => void;
}) {
  const { t } = useLang();
  const [rows, setRows] = useState<Row[]>([
    { method: "cash", amount: "", cardId: "", cardNumber: "" },
    { method: "card", amount: "", cardId: "", cardNumber: "" },
  ]);
  // A method that stops being allowed must not stay selected — the button would send a part
  // the server refuses.
  useEffect(() => {
    if (allowCredit) return;
    setRows((rs) => rs.map((r) => (r.method === "credit" ? { ...r, method: "cash" } : r)));
  }, [allowCredit]);

  const allocated = rows.slice(0, -1).reduce((s, r) => s + (parseInt(r.amount, 10) || 0), 0);
  const rest = total - allocated;
  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  // A card row has to say which card. Picked from the saved list or typed once, the same
  // choice the single-method flow offers.
  const cardIncomplete = rows.some((r) => r.method === "card" && !r.cardId && !r.cardNumber.trim());
  const ready = rest > 0 && !cardIncomplete && rows.every((r, i) => i === rows.length - 1 || (parseInt(r.amount, 10) || 0) > 0);

  const submit = () => {
    if (!ready || busy) return;
    onPay(rows.map((r, i) => ({
      amount: i === rows.length - 1 ? rest : parseInt(r.amount, 10) || 0,
      method: r.method,
      cardId: r.method === "card" ? r.cardId || undefined : undefined,
      cardNumber: r.method === "card" ? (r.cardNumber.trim() || undefined) : undefined,
    })));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] font-semibold text-muted-foreground">{t("split_payment")}</div>
        <button className="text-[12.5px] font-semibold text-muted-foreground hover:text-foreground" onClick={onBack}>
          ← {t("back")}
        </button>
      </div>
      <p className="-mt-1 text-[11.5px] leading-snug text-muted-foreground">{t("split_hint")}</p>

      <div className="flex flex-col gap-2.5">
        {rows.map((row, i) => {
          const last = i === rows.length - 1;
          return (
            <div key={i} className="rounded-[11px] border border-border bg-card p-2.5">
              <div className="flex items-center gap-1.5">
                <div className="grid flex-1 grid-cols-4 gap-1">
                  {(["cash", "card", "other", "credit"] as PaymentMethod[]).map((m) => {
                    const Icon = ICONS[m];
                    const off = m === "credit" && !allowCredit;
                    return (
                      <button key={m} disabled={off || busy}
                        onClick={() => set(i, { method: m, cardId: "", cardNumber: "" })}
                        className={cn(
                          "flex items-center justify-center gap-1 rounded-[8px] border px-1.5 py-1.5 text-[12px] font-semibold transition-colors",
                          row.method === m ? "border-primary bg-primary-soft text-foreground" : "border-border bg-card text-muted-foreground hover:bg-secondary",
                          off && "cursor-not-allowed opacity-40",
                        )}>
                        <Icon className="size-[15px]" />
                        <span className="truncate">{t(LABEL[m])}</span>
                      </button>
                    );
                  })}
                </div>
                {rows.length > 2 && (
                  <button disabled={busy} onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))}
                    className="shrink-0 rounded-[8px] p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <X className="size-4" />
                  </button>
                )}
              </div>

              <div className="mt-2">
                {last ? (
                  // The remainder. Shown rather than typed, so the split always adds up.
                  <div className="flex items-baseline justify-between rounded-[9px] bg-secondary/60 px-3 py-2">
                    <span className="text-[12.5px] font-semibold text-muted-foreground">{t("split_rest")}</span>
                    <span className={cn("font-mono text-[16px] font-extrabold", rest > 0 ? "text-foreground" : "text-danger")}>
                      {money(rest)} {t("soum")}
                    </span>
                  </div>
                ) : (
                  <MoneyInput value={row.amount} onChange={(d) => set(i, { amount: d })} hideHint placeholder="0" />
                )}
              </div>

              {row.method === "card" && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {cards.map((c) => (
                    <button key={c.id} disabled={busy} onClick={() => set(i, { cardId: c.id, cardNumber: "" })}
                      className={cn("flex items-center gap-2.5 rounded-[9px] border px-2.5 py-2 text-left transition-colors",
                        row.cardId === c.id ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary")}>
                      <CreditCard className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        {c.label && <div className="truncate text-[13px] font-semibold">{c.label}</div>}
                        <div className="truncate font-mono text-[12.5px] text-muted-foreground">{c.cardNumber}</div>
                      </div>
                      {row.cardId === c.id && <Check className="size-4 shrink-0 text-primary-emphasis" />}
                    </button>
                  ))}
                  <Input value={row.cardNumber} inputMode="numeric" className="font-mono"
                    placeholder={cards.length > 0 ? t("new_card") : t("card_number")}
                    onChange={(e) => set(i, { cardNumber: e.target.value, cardId: e.target.value ? "" : row.cardId })} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {rows.length < 4 && (
        <Button variant="soft" disabled={busy} onClick={() => setRows((rs) => [...rs, { method: "other", amount: "", cardId: "", cardNumber: "" }])}>
          <Plus /> {t("split_add_part")}
        </Button>
      )}

      <div className="flex items-baseline justify-between rounded-[11px] bg-secondary/60 px-3.5 py-2.5">
        <span className="text-[13px] font-semibold text-muted-foreground">{t("total")}</span>
        <span className="font-mono text-[17px] font-extrabold text-foreground">{money(total)} {t("soum")}</span>
      </div>

      {rest <= 0 && (
        <p className="text-[11.5px] leading-snug text-danger">{t("split_over")}</p>
      )}
      <Button disabled={!ready || busy} onClick={submit}>{t("confirm")}</Button>
    </div>
  );
}
