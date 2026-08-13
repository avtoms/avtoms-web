"use client";
// One contragent's account: what the shop received from them, what it paid, and what is
// still owed. A balance runs both ways — positive means the shop owes them, negative means
// they owe the shop — so the sheet says which it is in words rather than leaving a minus
// sign to be interpreted.
//
// Nothing here reaches profit and loss, and the sheet says so out loud: a part's cost is
// counted against profit when it is fitted to a car or sold, not when it is bought or paid
// for. Recording a payment here must never look like it made the shop poorer.
import React, { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Package, Trash2 } from "lucide-react";
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
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num, shortDateTime } from "@/lib/format";
import { PaymentPicker, PaidBadge, PaidParts, toParts, usePayment, useShopCards } from "@/components/payment-picker";
import { useStaffNames } from "@/lib/use-staff";
import { useAuth } from "@/components/providers";
import { cn } from "@/lib/utils";
import type { Contragent, ContragentBalance, ContragentEntryKind, ContragentLedgerEntry } from "@/lib/types";
import { CompanySummary } from "@/components/company-details";

// How each kind reads on screen. `sign` is its effect on the balance, where positive means
// the shop owes them — the same rule the backend uses.
const KIND: Record<string, { labelKey: string; sign: 1 | -1; icon: React.ReactNode; tone: "warn" | "ok" | "accent" | "danger" }> = {
  CONTRAGENT_ENTRY_KIND_PURCHASE: { labelKey: "cg_purchase", sign: 1, icon: <Package className="size-3.5" />, tone: "warn" },
  CONTRAGENT_ENTRY_KIND_PAYMENT_OUT: { labelKey: "cg_payment_out", sign: -1, icon: <ArrowUpRight className="size-3.5" />, tone: "ok" },
  CONTRAGENT_ENTRY_KIND_CHARGE: { labelKey: "cg_charge", sign: -1, icon: <ArrowUpRight className="size-3.5" />, tone: "accent" },
  CONTRAGENT_ENTRY_KIND_PAYMENT_IN: { labelKey: "cg_payment_in", sign: 1, icon: <ArrowDownLeft className="size-3.5" />, tone: "danger" },
};

// BalanceLine states the balance as a sentence. A bare signed number invites the reader to
// guess which way it points, and guessing wrong about a debt is expensive.
export function BalanceLine({ balance, className }: { balance: number; className?: string }) {
  const { t } = useLang();
  if (balance === 0) return <span className={cn("text-[13px] font-semibold text-muted-foreground", className)}>{t("cg_settled")}</span>;
  const weOwe = balance > 0;
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className={cn("font-mono text-[14px] font-extrabold", weOwe ? "text-destructive" : "text-success")}>
        {money(Math.abs(balance))}
      </span>
      <span className="text-[11.5px] font-semibold text-muted-foreground">{t(weOwe ? "cg_we_owe" : "cg_they_owe")}</span>
    </span>
  );
}

export function ContragentAccount({ contragent, onClose, onChanged }: {
  contragent: Contragent | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const { session } = useAuth();
  const shopId = session?.staff.shopId;
  const who = useStaffNames();
  const [entries, setEntries] = useState<ContragentLedgerEntry[] | null>(null);
  const [summary, setSummary] = useState<ContragentBalance | null>(null);
  const [busy, setBusy] = useState(false);

  // The payment form. Direction defaults to paying them, which is what a supplier account is
  // for nine times in ten.
  const [kind, setKind] = useState<Exclude<ContragentEntryKind, "CONTRAGENT_ENTRY_KIND_PURCHASE">>("CONTRAGENT_ENTRY_KIND_PAYMENT_OUT");
  // Paying a supplier in dollars is how most of these accounts are actually settled here.
  const [amount, setAmount] = useState<FxValue>(() => emptyFx());
  const currencies = useCurrencies();
  const [note, setNote] = useState("");
  const { payment, setPayment, reset } = usePayment();
  const cards = useShopCards(shopId);
  // A charge is goods or work handed over, not money — there is nothing to pay it with.
  const moves = kind !== "CONTRAGENT_ENTRY_KIND_CHARGE";
  const sum = fxSoum(amount, findCurrency(currencies, amount.currency));
  const parts = moves ? toParts(payment, sum) : null;

  const id = contragent?.id;
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await api.contragentLedger(id);
      setEntries(r.entries ?? []);
      setSummary(r.summary ?? null);
    } catch (e) {
      setEntries([]);
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    }
  }, [id, t, toast]);

  useEffect(() => {
    if (!id) { setEntries(null); setSummary(null); return; }
    setAmount(emptyFx()); setNote(""); setKind("CONTRAGENT_ENTRY_KIND_PAYMENT_OUT"); reset();
    void load();
  }, [id, load]);

  const balance = num(summary?.balance);

  const record = async () => {
    if (!id || sum <= 0 || busy || (moves && !parts)) return;
    setBusy(true);
    try {
      await api.recordContragentEntry(id, {
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

  const remove = async (e: ContragentLedgerEntry) => {
    if (!confirm(t("cg_delete_confirm"))) return;
    try {
      await api.deleteContragentEntry(e.id);
      toast(t("save"), { icon: "check" });
      await load();
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t("error"), { icon: "alert", tone: "danger" });
    }
  };

  return (
    <Sheet open={!!contragent} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-[520px] overflow-y-auto p-0">
        {contragent && (
          <div className="flex flex-col gap-4 p-5">
            <div>
              <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-foreground">{contragent.name}</h2>
              <div className="text-[12.5px] text-muted-foreground">{t("cg_account")}</div>
            </div>

            {/* the balance, said as a sentence */}
            <div className="flex items-center justify-between rounded-[12px] bg-secondary/60 px-4 py-3">
              <span className="text-[13px] font-semibold text-muted-foreground">{t("cg_balance")}</span>
              <BalanceLine balance={balance} />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Totals label={t("cg_purchased")} value={num(summary?.purchased)} />
              <Totals label={t("cg_paid")} value={num(summary?.paid)} />
              {num(summary?.charged) > 0 && <Totals label={t("cg_charged")} value={num(summary?.charged)} />}
              {num(summary?.received) > 0 && <Totals label={t("cg_received")} value={num(summary?.received)} />}
            </div>

            {/* Where a transfer to them lands. Directly above the form that sends the money,
                because "which account is this going to" is asked at exactly that moment and
                the answer used to live only on the edit dialog. */}
            <CompanySummary company={contragent.company} />

            {/* record money, in either direction, without buying anything */}
            <div className="flex flex-col gap-2.5 rounded-[12px] border border-border p-3.5">
              <div className="text-[12.5px] font-bold text-foreground">{t("cg_record")}</div>
              <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <TabsList className="w-full">
                  <TabsTrigger value="CONTRAGENT_ENTRY_KIND_PAYMENT_OUT" className="flex-1">{t("cg_payment_out")}</TabsTrigger>
                  <TabsTrigger value="CONTRAGENT_ENTRY_KIND_PAYMENT_IN" className="flex-1">{t("cg_payment_in")}</TabsTrigger>
                  <TabsTrigger value="CONTRAGENT_ENTRY_KIND_CHARGE" className="flex-1">{t("cg_charge")}</TabsTrigger>
                </TabsList>
              </Tabs>
              <Field label={t("amount")}>
                <FxMoneyInput value={amount} currencies={currencies} onChange={setAmount} />
              </Field>
              {moves && (
                <Field label={t("payment_method")}>
                  <PaymentPicker value={payment} onChange={setPayment} total={sum} cards={cards} disabled={busy} />
                </Field>
              )}
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("note")} className="h-9 text-[13px]" />
              <Button disabled={busy || sum <= 0 || (moves && !parts)} onClick={() => void record()}>
                {busy ? <Spinner /> : null}{t("save")}
              </Button>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">{t("cg_not_expense")}</p>
            </div>

            {/* the statement */}
            <div className="flex flex-col">
              {entries === null && <div className="flex justify-center py-8"><Spinner /></div>}
              {entries?.length === 0 && <div className="py-8 text-center text-[13px] text-muted-foreground">{t("empty")}</div>}
              {entries?.map((e) => {
                const k = KIND[String(e.kind)] ?? KIND.CONTRAGENT_ENTRY_KIND_PURCHASE;
                const fromStock = !!e.movementId;
                return (
                  <div key={e.id} className="flex items-start gap-3 border-b border-border py-2.5 last:border-b-0">
                    <Badge tone={k.tone} className="mt-0.5 shrink-0">{k.icon}{t(k.labelKey)}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-foreground">{e.description || t(k.labelKey)}</div>
                      <div className="font-mono text-[11.5px] text-muted-foreground">
                        {shortDateTime(e.occurredAt)}{who(e.staffId) ? " · " + who(e.staffId) : ""}{e.note ? " · " + e.note : ""}
                      </div>
                      {/* Cash or card, and which card. Without it a statement says money moved
                          and leaves the shop to remember how — which nobody does. */}
                      <PaidBadge paid={e} className="mt-1" />
                      {(e.parts?.length ?? 0) > 1 && <div className="mt-1 max-w-[220px]"><PaidParts paid={e} /></div>}
                    </div>
                    <span className={cn("flex shrink-0 flex-col items-end", k.sign > 0 ? "text-destructive" : "text-success")}>
                      <span className="font-mono text-[13.5px] font-bold">
                        {k.sign > 0 ? "+" : "−"}{money(e.amount)}
                      </span>
                      {/* What it was agreed in, at the rate of the day it happened. */}
                      <FxStamp fx={e.fxAmount} />
                    </span>
                    {/* An entry written by a stock receipt cannot be removed: the goods are on
                        the shelf, so deleting the debt would leave the two disagreeing. */}
                    {!fromStock && (
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
