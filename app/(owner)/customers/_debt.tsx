"use client";
// One client's debt book: what they took on nasiya and what they have paid back.
//
// The sign here is the opposite of a supplier account — positive means the CLIENT owes the
// shop — so both screens read the same way round and a big red number always means money
// you are waiting on. The sheet says which it is in words rather than leaving a minus sign
// to be interpreted.
//
// Taking a repayment is not income, and the sheet says so out loud: the revenue was counted
// when the goods went out. Recording money here must never look like the shop just earned it.
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, HandCoins, Trash2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui-kit/sheet";
import { Button } from "@/components/ui-kit/button";
import { Badge } from "@/components/ui-kit/badge";
import { Input } from "@/components/ui-kit/input";
import { Field } from "@/components/ui-kit/label";
import { Spinner } from "@/components/ui-kit/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { MoneyInput } from "@/components/catalog-fields";
import { FxStamp } from "@/components/fx-stamp";
import { FxMoneyInput } from "@/components/fx-money";
import { emptyFx, findCurrency, fxPayload, fxSoum, useCurrencies, type FxValue } from "@/lib/currency";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num, shortDateTime } from "@/lib/format";
import { PaymentPicker, PaidBadge, PaidParts, toParts, usePayment, useShopCards, useShopAccounts } from "@/components/payment-picker";
import { useStaffNames } from "@/lib/use-staff";
import { cn } from "@/lib/utils";
import type { CustomerBalance, CustomerEntryKind, CustomerLedgerEntry } from "@/lib/types";

// `sign` is the entry's effect on the balance, where positive means the client owes the shop
// — the same rule the backend uses.
const KIND: Record<string, { labelKey: string; sign: 1 | -1; icon: React.ReactNode; tone: "warn" | "ok" }> = {
  CUSTOMER_ENTRY_KIND_CHARGE: { labelKey: "cl_charge", sign: 1, icon: <HandCoins className="size-3.5" />, tone: "warn" },
  CUSTOMER_ENTRY_KIND_PAYMENT_IN: { labelKey: "cl_payment_in", sign: -1, icon: <ArrowDownLeft className="size-3.5" />, tone: "ok" },
};

// DebtLine states a client's balance as a sentence. Nought is the common case and deserves
// to read as "nothing owed" rather than as a bare 0.
export function DebtLine({ balance, className }: { balance: number; className?: string }) {
  const { t } = useLang();
  if (balance === 0) return <span className={cn("text-[13px] text-muted-foreground", className)}>—</span>;
  const owes = balance > 0;
  // A client in credit is shown, but quietly. It is money the shop is holding for someone,
  // and nine times in ten it is a repayment typed larger than the debt — so it must read as
  // something to look at, not as a success. Green here would say "settled, well done".
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className={cn("font-mono text-[14px] font-extrabold", owes ? "text-destructive" : "text-ink-2")}>
        {owes ? "" : "−"}{money(Math.abs(balance))}
      </span>
      {!owes && <span className="text-[11.5px] font-semibold text-muted-foreground">{t("cl_in_credit")}</span>}
    </span>
  );
}

export function CustomerAccount({ customer, onClose, onChanged }: {
  customer: { id: string; name?: string; phone?: string } | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const { session } = useAuth();
  const who = useStaffNames();
  const cards = useShopCards(session?.staff.shopId);
  // Money that moves by bank names the account it moved through, here as everywhere else.
  const shopAccounts = useShopAccounts();
  const [entries, setEntries] = useState<CustomerLedgerEntry[] | null>(null);
  const [summary, setSummary] = useState<CustomerBalance | null>(null);
  const [busy, setBusy] = useState(false);

  // Defaults to taking money, because collecting is what this screen is opened for. Adding a
  // charge by hand exists only for an opening balance carried over from a paper book.
  const [kind, setKind] = useState<CustomerEntryKind>("CUSTOMER_ENTRY_KIND_PAYMENT_IN");
  const [amount, setAmount] = useState<FxValue>(() => emptyFx());
  const currencies = useCurrencies();
  const [note, setNote] = useState("");
  const { payment, setPayment, reset } = usePayment();

  const id = customer?.id;
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await api.customerLedger(id);
      setEntries(r.entries ?? []);
      setSummary(r.summary ?? null);
    } catch (e) {
      setEntries([]);
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    }
  }, [id, t, toast]);

  useEffect(() => {
    if (!id) { setEntries(null); setSummary(null); return; }
    setAmount(emptyFx()); setNote(""); setKind("CUSTOMER_ENTRY_KIND_PAYMENT_IN"); reset();
    void load();
  }, [id, load]);

  const balance = num(summary?.balance);
  const taking = kind === "CUSTOMER_ENTRY_KIND_PAYMENT_IN";
  // How much of the typed amount is more than the client actually owes.
  const over = taking ? Math.max(0, fxSoum(amount, findCurrency(currencies, amount.currency)) - Math.max(0, balance)) : 0;

  // A charge added by hand is a debt taken on, not money changing hands, so it is the one
  // entry here with nothing to pay it with.
  const sum = fxSoum(amount, findCurrency(currencies, amount.currency));
  const parts = taking ? toParts(payment, sum, shopAccounts.accounts) : null;

  const record = async () => {
    if (!id || sum <= 0 || busy || (taking && !parts)) return;
    setBusy(true);
    try {
      await api.recordCustomerEntry(id, {
        kind, amount: sum, parts: parts ?? undefined, note: note.trim(),
        fxAmount: fxPayload(amount, findCurrency(currencies, amount.currency)),
      });
      setAmount(emptyFx()); setNote(""); reset();
      toast(t("save"), { icon: "money" });
      await load();
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally { setBusy(false); }
  };

  const remove = async (e: CustomerLedgerEntry) => {
    if (!confirm(t("cg_delete_confirm"))) return;
    try {
      await api.deleteCustomerEntry(e.id);
      toast(t("save"), { icon: "check" });
      await load();
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t("error"), { icon: "alert", tone: "danger" });
    }
  };

  return (
    <Sheet open={!!customer} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-[520px] overflow-y-auto p-0">
        {customer && (
          <div className="flex flex-col gap-4 p-5">
            <div>
              <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-foreground">{customer.name || t("walk_in")}</h2>
              <div className="font-mono text-[12.5px] text-muted-foreground">{customer.phone}</div>
              <div className="text-[12.5px] text-muted-foreground">{t("cl_account")}</div>
            </div>

            <div className="flex items-center justify-between rounded-[12px] bg-secondary/60 px-4 py-3">
              <span className="text-[13px] font-semibold text-muted-foreground">{t("cl_debt")}</span>
              {balance === 0
                ? <span className="text-[13px] font-semibold text-muted-foreground">{t("cl_no_debt")}</span>
                : <DebtLine balance={balance} />}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Totals label={t("cl_charged_total")} value={num(summary?.charged)} />
              <Totals label={t("cl_paid_total")} value={num(summary?.paid)} />
            </div>

            {/* taking money off the debt */}
            <div className="flex flex-col gap-2.5 rounded-[12px] border border-border p-3.5">
              <div className="text-[12.5px] font-bold text-foreground">{t("cl_take_payment")}</div>
              <Tabs value={kind} onValueChange={(v) => setKind(v as CustomerEntryKind)}>
                <TabsList className="w-full">
                  <TabsTrigger value="CUSTOMER_ENTRY_KIND_PAYMENT_IN" className="flex-1">{t("cl_payment_in")}</TabsTrigger>
                  <TabsTrigger value="CUSTOMER_ENTRY_KIND_CHARGE" className="flex-1">{t("cl_add_charge")}</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-col gap-2.5">
                <Field label={t("amount")}>
                  <FxMoneyInput value={amount} currencies={currencies} onChange={setAmount} />
                  {/* One tap to settle up, which is the usual case and the easiest to mistype. */}
                  {taking && balance > 0 && (
                    <button type="button" onClick={() => setAmount({ currency: "UZS", typed: String(balance), rate: "" })}
                      className="mt-1 text-[11.5px] font-semibold text-primary-emphasis hover:underline">
                      {t("cl_pay_full")} · {money(balance)}
                    </button>
                  )}
                  {/* Taking more than is owed is allowed — a deposit is a real thing — but it
                      must never be silent. Before this, the extra simply turned the client's
                      balance negative and the list showed it in green. */}
                  {taking && over > 0 && (
                    <p className="mt-1.5 text-[11.5px] font-semibold leading-snug text-warning">
                      {balance > 0 ? t("cl_over_debt") : t("cl_no_debt_yet")} · {t("cl_will_be_credit")} {money(over)}
                    </p>
                  )}
                </Field>
                {taking && (
                  <Field label={t("payment_method")}>
                    <PaymentPicker value={payment} onChange={setPayment} total={sum} cards={cards} disabled={busy}
                    accounts={shopAccounts.accounts} onAccountsChanged={shopAccounts.reload} />
                  </Field>
                )}
              </div>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("note")} className="h-9 text-[13px]" />
              <Button disabled={busy || sum <= 0 || (taking && !parts)} onClick={() => void record()}>
                {busy ? <Spinner /> : null}{t("save")}
              </Button>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">{t("cl_not_income")}</p>
            </div>

            {/* the statement */}
            <div className="flex flex-col">
              {entries === null && <div className="flex justify-center py-8"><Spinner /></div>}
              {entries?.length === 0 && <div className="py-8 text-center text-[13px] text-muted-foreground">{t("cl_no_debt")}</div>}
              {entries?.map((e) => {
                const k = KIND[String(e.kind)] ?? KIND.CUSTOMER_ENTRY_KIND_CHARGE;
                // A charge that came from a sale or an order is not deletable: the goods left
                // the shop, so the debt goes away by voiding the sale, not by tidying the row.
                const fromTrade = !!e.saleId || !!e.workOrderId;
                // Name the document, not just its kind: "from an order" tells a client who is
                // owed money nothing they can check, and "Z-0013" is the thing they can be
                // shown. Falls back to naming the kind for a row written before the number was
                // resolved on read.
                const doc = e.sourceNo || (e.saleId ? t("cl_from_sale") : e.workOrderId ? t("cl_from_order") : "");
                // The charge's own description is usually the document number already, since
                // that is what the server snapshotted — and the badge to its left already names
                // the kind. So the description is shown only when it says something neither of
                // them does, rather than printing the same words three times across one row.
                const title = e.description && e.description !== e.sourceNo ? e.description : "";
                return (
                  <div key={e.id} className="flex items-start gap-3 border-b border-border py-2.5 last:border-b-0">
                    <Badge tone={k.tone} className="mt-0.5 shrink-0">{k.icon}{t(k.labelKey)}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {title && <span className="truncate text-[13px] font-semibold text-foreground">{title}</span>}
                        {/* The order behind a charge opens from here. A counter sale has no
                            page of its own, so its number is named but not linked. */}
                        {doc && (e.workOrderId
                          ? <Link href={`/work-orders/${e.workOrderId}`} onClick={(ev) => ev.stopPropagation()}
                              className="shrink-0 font-mono text-[11.5px] font-bold text-primary-emphasis hover:underline">{doc}</Link>
                          : <span className="shrink-0 font-mono text-[11.5px] font-bold text-ink-2">{doc}</span>)}
                      </div>
                      <div className="font-mono text-[11.5px] text-muted-foreground">
                        {shortDateTime(e.occurredAt)}{who(e.staffId) ? " · " + who(e.staffId) : ""}{e.note ? " · " + e.note : ""}
                      </div>
                      {/* How the repayment arrived. A charge has no payment and shows none. */}
                      <PaidBadge paid={e} className="mt-1" />
                      {(e.parts?.length ?? 0) > 1 && <div className="mt-1 max-w-[220px]"><PaidParts paid={e} /></div>}
                    </div>
                    <span className={cn("flex shrink-0 flex-col items-end", k.sign > 0 ? "text-destructive" : "text-success")}>
                      <span className="font-mono text-[13.5px] font-bold">
                        {k.sign > 0 ? "+" : "−"}{money(e.amount)}
                      </span>
                      {/* What the client actually handed over, at that day's rate. */}
                      <FxStamp fx={e.fxAmount} />
                    </span>
                    {fromTrade ? (
                      <span className="mt-0.5 w-3.5 shrink-0" title={t("cl_locked_entry")} />
                    ) : (
                      <button onClick={() => void remove(e)} aria-label={t("delete")} className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Totals({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] bg-secondary/50 px-3 py-2">
      <span className="text-[11.5px] font-semibold text-muted-foreground">{label}</span>
      <span className="font-mono text-[14px] font-bold text-foreground">{money(value)}</span>
    </div>
  );
}
