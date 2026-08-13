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
import { Banknote, CreditCard, Wallet, Split, Plus, X, Check, Landmark } from "lucide-react";
import { Input } from "@/components/ui-kit/input";
import { Badge } from "@/components/ui-kit/badge";
import { MoneyInput } from "@/components/catalog-fields";
import { useLang } from "@/components/providers";
import { money } from "@/lib/format";
import { paymentLabelKey, type PaymentMethod } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { api, ApiError, type PaymentPart } from "@/lib/api";
import type { BankAccount, ShopCard } from "@/lib/types";

// What the picker holds. `mode` is a single method, or "split" for several.
// What one leg of a payment holds. A card leg names a card; a transfer leg names two accounts
// and the order number that moved the money between them.
export type PaymentLeg = {
  method: PaymentMethod;
  amount: string;
  cardId: string;
  cardNumber: string;
  transferRef: string;
  accountId: string;      // which of OUR accounts it moved through
  payeeAccount: string;   // which of THEIRS it reached
};

export type Payment = {
  mode: PaymentMethod | "split";
  cardId: string;
  cardNumber: string;
  // The payment order a transfer went out on. Kept beside the card fields because it answers
  // the same question for the other rail: which movement in the bank was this one.
  transferRef: string;
  accountId: string;
  payeeAccount: string;
  rows: PaymentLeg[];
};

// The four ways money moves out of, or into, a shop. Transfer is how one company settles with
// another — an MCHJ paying an MCHJ sends a payment order between two accounts rather than
// handing anything over. Credit is deliberately absent: it means nobody paid, which is a debt
// on an account rather than a movement of money, and both ledgers already have a direction
// for that.
const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "other"];

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  cash: Banknote, card: CreditCard, transfer: Landmark, other: Wallet, split: Split,
};

const blankLeg = (method: PaymentMethod): PaymentLeg =>
  ({ method, amount: "", cardId: "", cardNumber: "", transferRef: "", accountId: "", payeeAccount: "" });

export const blankPayment = (): Payment => ({
  mode: "cash", cardId: "", cardNumber: "", transferRef: "", accountId: "", payeeAccount: "",
  rows: [blankLeg("cash"), blankLeg("card")],
});

export function usePayment() {
  const [payment, setPayment] = useState<Payment>(blankPayment);
  return { payment, setPayment, reset: () => setPayment(blankPayment()) };
}

// toParts turns the picker's state into what the API takes, given the amount being paid.
// Returns null when the split does not describe a whole payment yet — the caller keeps its
// save button disabled rather than sending something the server will refuse.
// toParts turns the picker's state into what the API takes. `accounts` is the shop's own list,
// used only to snapshot the number of the account a transfer moved through: the id says which
// row it was, the number is what will still be readable when that row is edited or deleted.
export function toParts(p: Payment, total: number, accounts: BankAccount[] = []): PaymentPart[] | null {
  const numberOf = (id: string) => accounts.find((a) => a.id === id)?.accountNumber;
  const legOf = (leg: { method: PaymentMethod; cardId: string; cardNumber: string; transferRef: string; accountId: string; payeeAccount: string }) => ({
    method: leg.method,
    cardId: leg.method === "card" ? leg.cardId || undefined : undefined,
    cardNumber: leg.method === "card" ? leg.cardNumber.trim() || undefined : undefined,
    transferRef: leg.method === "transfer" ? leg.transferRef.trim() || undefined : undefined,
    bankAccountId: leg.method === "transfer" ? leg.accountId || undefined : undefined,
    bankAccountNumber: leg.method === "transfer" ? numberOf(leg.accountId) : undefined,
    counterpartyAccount: leg.method === "transfer" ? leg.payeeAccount.trim() || undefined : undefined,
  });

  if (total <= 0) return null;
  if (p.mode !== "split") {
    if (p.mode === "card" && !p.cardId && !p.cardNumber.trim()) return null;
    return [{ amount: total, ...legOf({ ...p, method: p.mode }) }];
  }
  const allocated = p.rows.slice(0, -1).reduce((s, r) => s + (parseInt(r.amount, 10) || 0), 0);
  const rest = total - allocated;
  if (rest <= 0) return null;
  if (p.rows.some((r, i) => i < p.rows.length - 1 && (parseInt(r.amount, 10) || 0) <= 0)) return null;
  if (p.rows.some((r) => r.method === "card" && !r.cardId && !r.cardNumber.trim())) return null;
  return p.rows.map((r, i) => ({
    amount: i === p.rows.length - 1 ? rest : parseInt(r.amount, 10) || 0,
    ...legOf(r),
  }));
}

export function PaymentPicker({ value, onChange, total, cards, disabled, accounts, payee, onAccountsChanged }: {
  value: Payment;
  onChange: (p: Payment) => void;
  total: number;
  cards: ShopCard[];
  disabled?: boolean;
  // The shop's own accounts, for "which of ours did it leave from". Omitted on a screen that
  // has not loaded them, and then the transfer simply records no account — which is what it
  // did before this list existed.
  accounts?: BankAccount[];
  // The party on the other side, when there is one: their accounts to choose from, and the id
  // an account created here should belong to.
  payee?: { contragentId?: string; accounts: BankAccount[]; label?: string };
  onAccountsChanged?: () => void;
}) {
  const { t } = useLang();
  const set = (patch: Partial<Payment>) => onChange({ ...value, ...patch });
  const setRow = (i: number, patch: Partial<Payment["rows"][number]>) =>
    onChange({ ...value, rows: value.rows.map((r, n) => (n === i ? { ...r, ...patch } : r)) });

  // Preselect the account a payment would sensibly use, so the common case is one tap and the
  // dropdown is there for the day it is not. Runs whenever the transfer rail becomes visible.
  const primaryAccount = (accounts ?? []).find((a) => a.isPrimary)?.id ?? (accounts ?? [])[0]?.id ?? "";
  const primaryPayee = (payee?.accounts ?? []).find((a) => a.isPrimary)?.accountNumber
    ?? (payee?.accounts ?? [])[0]?.accountNumber ?? "";
  useEffect(() => {
    if (value.mode !== "transfer") return;
    if (!value.accountId && primaryAccount) set({ accountId: primaryAccount });
    else if (!value.payeeAccount && primaryPayee) set({ payeeAccount: primaryPayee });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.mode, primaryAccount, primaryPayee]);

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
            <button key={m} type="button" disabled={disabled} onClick={() => set({ mode: m, cardId: "", cardNumber: "", transferRef: "" })}
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

      {value.mode === "transfer" && (
        <div className="flex flex-col gap-2">
          <AccountChoice label={t("acct_from")} accounts={accounts ?? []} value={value.accountId} disabled={disabled}
            onPick={(accountId) => set({ accountId })}
            onCreated={onAccountsChanged} />
          {payee && (
            <AccountChoice label={t("acct_to") + (payee.label ? ` · ${payee.label}` : "")}
              accounts={payee.accounts} value={payee.accounts.find((a) => a.accountNumber === value.payeeAccount)?.id ?? ""}
              disabled={disabled} contragentId={payee.contragentId}
              onPick={(id) => set({ payeeAccount: payee.accounts.find((a) => a.id === id)?.accountNumber ?? "" })}
              onCreated={onAccountsChanged} />
          )}
          <TransferRef value={value.transferRef} disabled={disabled} onChange={(transferRef) => set({ transferRef })} />
        </div>
      )}

      {value.mode === "split" && (
        <div className="flex flex-col gap-2 rounded-[11px] border border-border bg-secondary/30 p-2.5">
          {value.rows.map((row, i) => {
            const last = i === value.rows.length - 1;
            return (
              <div key={i} className="flex flex-col gap-1.5 rounded-[9px] border border-border bg-card p-2">
                <div className="flex items-center gap-1.5">
                  <div className="grid flex-1 grid-cols-2 gap-1 min-[380px]:grid-cols-4">
                    {METHODS.map((m) => (
                      <button key={m} type="button" disabled={disabled}
                        onClick={() => setRow(i, { method: m, cardId: "", cardNumber: "", transferRef: "" })}
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
                {row.method === "transfer" && (
                  <div className="flex flex-col gap-1.5">
                    <AccountChoice label={t("acct_from")} accounts={accounts ?? []} value={row.accountId} disabled={disabled}
                      onPick={(accountId) => setRow(i, { accountId })} onCreated={onAccountsChanged} />
                    {payee && (
                      <AccountChoice label={t("acct_to")} accounts={payee.accounts}
                        value={payee.accounts.find((a) => a.accountNumber === row.payeeAccount)?.id ?? ""}
                        disabled={disabled} contragentId={payee.contragentId}
                        onPick={(id) => setRow(i, { payeeAccount: payee.accounts.find((a) => a.id === id)?.accountNumber ?? "" })}
                        onCreated={onAccountsChanged} />
                    )}
                    <TransferRef value={row.transferRef} disabled={disabled} onChange={(transferRef) => setRow(i, { transferRef })} />
                  </div>
                )}
              </div>
            );
          })}
          {value.rows.length < 4 && (
            <button type="button" disabled={disabled}
              onClick={() => onChange({ ...value, rows: [...value.rows, blankLeg("other")] })}
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

// Which account the money moved through, chosen from a list — with the way to add one right
// here, because the moment a shop discovers an account is missing is the moment it is trying
// to pay with it, and sending them to Settings to come back and start again is how a payment
// ends up recorded as "cash" instead.
//
// contragentId names whose list this is: absent, it is the shop's own.
function AccountChoice({ label, accounts, value, disabled, contragentId, onPick, onCreated }: {
  label: string;
  accounts: BankAccount[];
  value: string;
  disabled?: boolean;
  contragentId?: string;
  onPick: (id: string) => void;
  onCreated?: () => void;
}) {
  const { t } = useLang();
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState("");
  const [bank, setBank] = useState("");
  const [mfo, setMfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");

  const create = async () => {
    if (number.trim().length !== 20 || busy) return;
    setBusy(true); setFailed("");
    try {
      const a = await api.createBankAccount({
        contragentId, accountNumber: number, bankName: bank, bankMfo: mfo,
      });
      onPick(a.id);
      setAdding(false); setNumber(""); setBank(""); setMfo("");
      onCreated?.();
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : t("error"));
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">{label}</span>
      {accounts.map((a) => (
        <button key={a.id} type="button" disabled={disabled} onClick={() => onPick(a.id)}
          className={cn("flex min-h-11 items-center gap-2.5 rounded-[9px] border px-2.5 py-1.5 text-left transition-colors sm:min-h-9",
            value === a.id ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary")}>
          <Landmark className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[12.5px] font-semibold">{a.accountNumber}</div>
            {(a.label || a.bankName) && (
              <div className="truncate text-[11.5px] text-muted-foreground">{[a.label, a.bankName].filter(Boolean).join(" · ")}</div>
            )}
          </div>
          {value === a.id && <Check className="size-4 shrink-0 text-primary-emphasis" />}
        </button>
      ))}

      {adding ? (
        <div className="flex flex-col gap-1.5 rounded-[9px] border border-border bg-secondary/30 p-2">
          <Input value={number} inputMode="numeric" className="font-mono" autoFocus disabled={busy}
            placeholder={t("co_bank_account")}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 20))} />
          <div className="grid grid-cols-[2fr_1fr] gap-1.5">
            <Input value={bank} disabled={busy} placeholder={t("co_bank_name")} onChange={(e) => setBank(e.target.value)} />
            <Input value={mfo} inputMode="numeric" className="font-mono" disabled={busy} placeholder={t("co_bank_mfo")}
              onChange={(e) => setMfo(e.target.value.replace(/\D/g, "").slice(0, 5))} />
          </div>
          {failed && <p className="px-0.5 text-[11.5px] text-destructive">{failed}</p>}
          <div className="flex justify-end gap-1.5">
            <button type="button" disabled={busy} onClick={() => { setAdding(false); setFailed(""); }}
              className="rounded-[7px] px-2 py-1 text-[12px] font-semibold text-muted-foreground hover:bg-secondary">
              {t("cancel")}
            </button>
            <button type="button" disabled={busy || number.trim().length !== 20} onClick={() => void create()}
              className="rounded-[7px] bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground disabled:opacity-40">
              {t("save")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={disabled} onClick={() => setAdding(true)}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[9px] border border-dashed border-border text-[12.5px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Plus className="size-3.5" /> {t("acct_add")}
        </button>
      )}
    </div>
  );
}

// The payment order a transfer went out on. Optional on purpose: a shop recording this
// afternoon's transfer often does not have the number to hand until the bank confirms it, and
// refusing the payment until then would send the record somewhere no one keeps it. Left empty
// the payment still says it went by bank, which is the half that cannot be reconstructed.
function TransferRef({ value, disabled, onChange }: {
  value: string; disabled?: boolean; onChange: (v: string) => void;
}) {
  const { t } = useLang();
  return (
    <Input value={value} disabled={disabled} placeholder={t("transfer_ref_hint")}
      className="font-mono text-[13px]" onChange={(e) => onChange(e.target.value)} />
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
  transferRef?: string;
  bankAccountNumber?: string;
  counterpartyAccount?: string;
  parts?: {
    amount?: string | number; method?: string; cardNumber?: string; transferRef?: string;
    bankAccountNumber?: string; counterpartyAccount?: string;
  }[];
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
  // A transfer's payment order number, shown on the chip exactly where a card number is. It is
  // the thing a shop looks for when it holds this row against a bank statement.
  const ref = parts.find((p) => methodKey(p.method) === "transfer")?.transferRef || paid?.transferRef || "";
  return (
    <Badge tone="neutral" className={className}>
      {React.createElement(ICON[parts.length > 1 ? "split" : methodKey(paid?.method) || "cash"] ?? Wallet, { className: "mr-1 size-3" })}
      {label}
      {card ? <span className="ml-1 font-mono opacity-70">{card}</span> : null}
      {ref ? <span className="ml-1 font-mono opacity-70">№{ref}</span> : null}
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
            {p.transferRef ? <span className="ml-1 font-mono opacity-70">№{p.transferRef}</span> : null}
            {p.counterpartyAccount ? <span className="ml-1 font-mono opacity-70">→{tail(p.counterpartyAccount)}</span> : null}
          </span>
          <span className="font-mono font-semibold text-foreground">{money(Number(p.amount ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

// The last four digits of an account, which is how a person says which one they mean. The
// whole twenty would push everything else off the line and tell them nothing they did not
// already know from the first sixteen being identical across their accounts.
function tail(account: string): string {
  return account.length > 4 ? "…" + account.slice(-4) : account;
}

// The proto enum name reduced to the app's short key. Unspecified stays empty, which is what
// tells the badge to show nothing rather than to guess.
function methodKey(s?: string): PaymentMethod | "" {
  if (!s || s === "PAYMENT_METHOD_UNSPECIFIED") return "";
  if (s === "PAYMENT_METHOD_CARD") return "card";
  if (s === "PAYMENT_METHOD_OTHER") return "other";
  if (s === "PAYMENT_METHOD_CREDIT") return "credit";
  if (s === "PAYMENT_METHOD_TRANSFER") return "transfer";
  return "cash";
}

// useShopAccounts loads the shop's own bank accounts once per screen that offers a transfer,
// and hands back a reload for when one is added from inside the picker.
export function useShopAccounts(): { accounts: BankAccount[]; reload: () => void } {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    api.listBankAccounts()
      .then((a) => { if (live) setAccounts(a); })
      .catch(() => {});
    return () => { live = false; };
  }, [tick]);
  return { accounts, reload: () => setTick((n) => n + 1) };
}

// useContragentAccounts loads one counterparty's accounts — where money sent to them lands.
// An empty id loads nothing, which is the state of every form before a supplier is chosen.
export function useContragentAccounts(contragentId?: string): { accounts: BankAccount[]; reload: () => void } {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!contragentId) { setAccounts([]); return; }
    let live = true;
    api.listBankAccounts({ contragentId })
      .then((a) => { if (live) setAccounts(a); })
      .catch(() => {});
    return () => { live = false; };
  }, [contragentId, tick]);
  return { accounts, reload: () => setTick((n) => n + 1) };
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
