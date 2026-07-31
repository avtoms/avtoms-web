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
import { ArrowDownLeft, Banknote, CreditCard, HandCoins, Trash2, Wallet } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui-kit/sheet";
import { Button } from "@/components/ui-kit/button";
import { Badge } from "@/components/ui-kit/badge";
import { Input } from "@/components/ui-kit/input";
import { Field } from "@/components/ui-kit/label";
import { Spinner } from "@/components/ui-kit/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { MoneyInput } from "@/components/catalog-fields";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num, shortDateTime } from "@/lib/format";
import { paymentLabelKey, type PaymentMethod } from "@/lib/enums";
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
  const [entries, setEntries] = useState<CustomerLedgerEntry[] | null>(null);
  const [summary, setSummary] = useState<CustomerBalance | null>(null);
  const [busy, setBusy] = useState(false);

  // Defaults to taking money, because collecting is what this screen is opened for. Adding a
  // charge by hand exists only for an opening balance carried over from a paper book.
  const [kind, setKind] = useState<CustomerEntryKind>("CUSTOMER_ENTRY_KIND_PAYMENT_IN");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");

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
    setAmount(""); setNote(""); setKind("CUSTOMER_ENTRY_KIND_PAYMENT_IN");
    void load();
  }, [id, load]);

  const balance = num(summary?.balance);
  const taking = kind === "CUSTOMER_ENTRY_KIND_PAYMENT_IN";
  // How much of the typed amount is more than the client actually owes.
  const over = taking ? Math.max(0, (parseInt(amount, 10) || 0) - Math.max(0, balance)) : 0;

  const record = async () => {
    const a = parseInt(amount, 10) || 0;
    if (!id || a <= 0 || busy) return;
    setBusy(true);
    try {
      await api.recordCustomerEntry(id, { kind, amount: a, method, note: note.trim() });
      setAmount(""); setNote("");
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
              <div className="grid grid-cols-2 gap-2.5">
                <Field label={t("amount")}>
                  <MoneyInput value={amount} onChange={setAmount} />
                  {/* One tap to settle up, which is the usual case and the easiest to mistype. */}
                  {taking && balance > 0 && (
                    <button type="button" onClick={() => setAmount(String(balance))}
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
                <Field label={t("payment_method")}>
                  <div className="flex gap-1">
                    {(["cash", "card", "other"] as PaymentMethod[]).map((m) => (
                      <Button key={m} type="button" variant={method === m ? "soft" : "secondary"} size="sm" className="flex-1 px-0"
                        onClick={() => setMethod(m)} aria-label={t(paymentLabelKey(m))}>
                        {m === "cash" ? <Banknote /> : m === "card" ? <CreditCard /> : <Wallet />}
                      </Button>
                    ))}
                  </div>
                </Field>
              </div>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("note")} className="h-9 text-[13px]" />
              <Button disabled={busy || !(parseInt(amount, 10) > 0)} onClick={() => void record()}>
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
                const source = e.saleId ? t("cl_from_sale") : e.workOrderId ? t("cl_from_order") : "";
                return (
                  <div key={e.id} className="flex items-start gap-3 border-b border-border py-2.5 last:border-b-0">
                    <Badge tone={k.tone} className="mt-0.5 shrink-0">{k.icon}{t(k.labelKey)}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-foreground">{e.description || t(k.labelKey)}</div>
                      <div className="font-mono text-[11.5px] text-muted-foreground">
                        {shortDateTime(e.occurredAt)}{source ? " · " + source : ""}{e.note ? " · " + e.note : ""}
                      </div>
                    </div>
                    <span className={cn("shrink-0 font-mono text-[13.5px] font-bold", k.sign > 0 ? "text-destructive" : "text-success")}>
                      {k.sign > 0 ? "+" : "−"}{money(e.amount)}
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
