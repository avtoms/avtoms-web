"use client";
// One contragent's account: what the shop received from them, what it paid, and what is
// still owed. A balance runs both ways — positive means the shop owes them, negative means
// they owe the shop — so the screen says which it is in words rather than leaving a minus
// sign to be interpreted.
//
// Nothing here reaches profit and loss, and the screen says so out loud: a part's cost is
// counted against profit when it is fitted to a car or sold, not when it is bought or paid
// for. Recording a payment here must never look like it made the shop poorer.
//
// AccountPanel is the account itself. On a wide screen it sits beside the supplier list, as
// the redesign draws it; everywhere else ContragentAccount opens it in a sheet.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Package, Trash2, Phone, Pencil, Banknote, PackagePlus } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui-kit/sheet";
import { Button } from "@/components/ui-kit/button";
import { Badge } from "@/components/ui-kit/badge";
import { Input } from "@/components/ui-kit/input";
import { Field } from "@/components/ui-kit/label";
import { Spinner } from "@/components/ui-kit/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { FxStamp } from "@/components/fx-stamp";
import { FxMoneyInput } from "@/components/fx-money";
import { emptyFx, findCurrency, fxPayload, fxSoum, useCurrencies, type FxValue } from "@/lib/currency";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { compactMln, money, num, shortDate } from "@/lib/format";
import { paymentFromProto, paymentLabelKey } from "@/lib/enums";
import {
  PaymentPicker, PaidBadge, PaidParts, toParts, usePayment, useShopCards, useShopAccounts, useContragentAccounts,
} from "@/components/payment-picker";
import { useStaffNames } from "@/lib/use-staff";
import { useAuth } from "@/components/providers";
import { cn } from "@/lib/utils";
import type { Contragent, ContragentBalance, ContragentEntryKind, ContragentLedgerEntry } from "@/lib/types";
import { CompanySummary } from "@/components/company-details";
import { staffColor } from "../_shared";

// How each kind reads on screen. `sign` is its effect on the balance, where positive means
// the shop owes them — the same rule the backend uses.
const KIND: Record<string, { labelKey: string; sign: 1 | -1; icon: React.ReactNode; tone: "warn" | "ok" | "accent" | "danger" }> = {
  CONTRAGENT_ENTRY_KIND_PURCHASE: { labelKey: "cg_purchase", sign: 1, icon: <Package className="size-3.5" />, tone: "warn" },
  CONTRAGENT_ENTRY_KIND_PAYMENT_OUT: { labelKey: "cg_payment_out", sign: -1, icon: <ArrowUpRight className="size-3.5" />, tone: "ok" },
  CONTRAGENT_ENTRY_KIND_CHARGE: { labelKey: "cg_charge", sign: -1, icon: <ArrowUpRight className="size-3.5" />, tone: "accent" },
  CONTRAGENT_ENTRY_KIND_PAYMENT_IN: { labelKey: "cg_payment_in", sign: 1, icon: <ArrowDownLeft className="size-3.5" />, tone: "danger" },
};
const TONE_BG: Record<string, string> = {
  warn: "bg-info-soft text-info", ok: "bg-success-soft text-success", accent: "bg-primary-soft text-primary-emphasis", danger: "bg-warning-soft text-warning",
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

export function AccountPanel({ contragent, onChanged, onEdit }: {
  contragent: Contragent;
  onChanged: () => void;
  onEdit?: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const { session } = useAuth();
  const shopId = session?.staff.shopId;
  const who = useStaffNames();
  const [entries, setEntries] = useState<ContragentLedgerEntry[] | null>(null);
  const [summary, setSummary] = useState<ContragentBalance | null>(null);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [all, setAll] = useState(false);

  // The payment form. Direction defaults to paying them, which is what a supplier account is
  // for nine times in ten.
  const [kind, setKind] = useState<Exclude<ContragentEntryKind, "CONTRAGENT_ENTRY_KIND_PURCHASE">>("CONTRAGENT_ENTRY_KIND_PAYMENT_OUT");
  // Paying a supplier in dollars is how most of these accounts are actually settled here.
  const [amount, setAmount] = useState<FxValue>(() => emptyFx());
  const currencies = useCurrencies();
  const [note, setNote] = useState("");
  const { payment, setPayment, reset } = usePayment();
  const cards = useShopCards(shopId);
  // Both sides of a transfer: which of ours it leaves from, and which of theirs it reaches.
  const shopAccounts = useShopAccounts();
  const theirAccounts = useContragentAccounts(contragent.id);
  // A charge is goods or work handed over, not money — there is nothing to pay it with.
  const moves = kind !== "CONTRAGENT_ENTRY_KIND_CHARGE";
  const sum = fxSoum(amount, findCurrency(currencies, amount.currency));
  const parts = moves ? toParts(payment, sum, shopAccounts.accounts) : null;

  const id = contragent.id;
  const load = useCallback(async () => {
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
    setEntries(null); setSummary(null); setAll(false); setFormOpen(false);
    setAmount(emptyFx()); setNote(""); setKind("CONTRAGENT_ENTRY_KIND_PAYMENT_OUT"); reset();
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, load]);

  const balance = num(summary?.balance);

  // The statement, newest first, each row carrying what the balance stood at once it had
  // happened. Worked forward from the oldest entry, then shifted so the last figure agrees
  // with the balance the server keeps — an opening balance carried in from before this
  // ledger would otherwise put every row out by the same amount.
  const rows = useMemo(() => {
    const ordered = [...(entries ?? [])].sort((a, b) => (a.occurredAt || "").localeCompare(b.occurredAt || ""));
    let run = 0;
    const after: number[] = [];
    for (const e of ordered) {
      const k = KIND[String(e.kind)] ?? KIND.CONTRAGENT_ENTRY_KIND_PURCHASE;
      run += k.sign * num(e.amount);
      after.push(run);
    }
    const shift = summary ? balance - run : 0;
    return ordered.map((e, i) => ({ e, after: after[i] + shift })).reverse();
  }, [entries, summary, balance]);
  const purchases = (entries ?? []).filter((e) => String(e.kind) === "CONTRAGENT_ENTRY_KIND_PURCHASE").length;
  // How the money went out: cash, transfer, card — read from each payment's parts.
  const paidBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries ?? []) {
      if (String(e.kind) !== "CONTRAGENT_ENTRY_KIND_PAYMENT_OUT") continue;
      const ps = e.parts?.length ? e.parts : [{ method: e.method, amount: e.amount }];
      for (const p of ps) { const k = paymentFromProto(p.method); m.set(k, (m.get(k) || 0) + num(p.amount)); }
    }
    return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [entries]);
  const last = rows[0]?.e;

  const record = async () => {
    if (sum <= 0 || busy || (moves && !parts)) return;
    setBusy(true);
    try {
      await api.recordContragentEntry(id, {
        kind, amount: sum, parts: parts ?? undefined, note: note.trim(),
        fxAmount: fxPayload(amount, findCurrency(currencies, amount.currency)),
      });
      setAmount(emptyFx()); setNote(""); reset(); setFormOpen(false);
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

  const initials = contragent.name.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const shown = all ? rows : rows.slice(0, 5);
  const when = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return d.toDateString() === new Date().toDateString() ? `${t("today")}, ${hm}` : `${shortDate(iso)} ${hm}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* who they are */}
      <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid size-12 shrink-0 place-items-center rounded-full text-[16px] font-bold text-white" style={{ background: staffColor(contragent.id) }}>{initials}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[20px] font-bold tracking-[-0.02em] text-foreground">{contragent.name}</h2>
              {!contragent.active && <Badge tone="danger">{t("inactive")}</Badge>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
              {contragent.phone && <span className="font-mono text-ink-2">{contragent.phone}</span>}
              {contragent.address && <><span aria-hidden>·</span><span className="truncate">{contragent.address}</span></>}
            </div>
            {contragent.brand && <div className="mt-1.5"><Badge tone="neutral">{contragent.brand}</Badge></div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {contragent.phone && <Button variant="secondary" size="sm" asChild><a href={`tel:${contragent.phone}`}><Phone /> {t("call")}</a></Button>}
          {onEdit && <Button variant="secondary" size="sm" onClick={onEdit}><Pencil /> {t("edit")}</Button>}
        </div>
      </div>

      {/* the figures */}
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <div className={cn("rounded-[12px] px-3.5 py-3", balance > 0 ? "bg-destructive-soft" : balance < 0 ? "bg-success-soft" : "bg-secondary")}>
          <div className={cn("text-[11px] font-bold uppercase tracking-[0.06em]", balance > 0 ? "text-destructive" : balance < 0 ? "text-success" : "text-muted-foreground")}>
            {balance === 0 ? t("cg_settled") : t(balance > 0 ? "cg_we_owe" : "cg_they_owe")}
          </div>
          <div className={cn("font-mono text-[22px] font-bold", balance > 0 ? "text-destructive" : balance < 0 ? "text-success" : "text-foreground")}>{money(Math.abs(balance))}</div>
        </div>
        <Totals label={t("cg_purchased")} value={num(summary?.purchased)} sub={purchases ? `${purchases} ${t("act_receive").toLowerCase()}` : undefined} />
        <Totals label={t("cg_paid")} value={num(summary?.paid)}
          sub={paidBy.length ? paidBy.slice(0, 2).map(([m, v]) => `${t(paymentLabelKey(m as ReturnType<typeof paymentFromProto>)).toLowerCase()} ${compactMln(v, t("mln"))}`).join(" · ") : undefined} />
        <div className="rounded-[12px] bg-secondary px-3.5 py-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("cg_last_move")}</div>
          <div className="truncate text-[15px] font-bold text-foreground">{last ? when(last.occurredAt) : "—"}</div>
          {last && <div className="truncate text-[12px] text-muted-foreground">{last.description || t((KIND[String(last.kind)] ?? KIND.CONTRAGENT_ENTRY_KIND_PURCHASE).labelKey)}</div>}
        </div>
      </div>
      {(num(summary?.charged) > 0 || num(summary?.received) > 0) && (
        <div className="grid grid-cols-2 gap-2.5">
          {num(summary?.charged) > 0 && <Totals label={t("cg_charged")} value={num(summary?.charged)} />}
          {num(summary?.received) > 0 && <Totals label={t("cg_received")} value={num(summary?.received)} />}
        </div>
      )}

      {/* what can be done with them */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setFormOpen((v) => !v)}><Banknote /> {t("act_pay_supplier")}</Button>
        <Button variant="secondary" asChild><Link href="/inventory"><PackagePlus /> {t("act_restock")}</Link></Button>
        <span className="basis-full text-[12px] leading-snug text-muted-foreground">{t("cg_not_expense")}</span>
      </div>

      {/* Where a transfer to them lands. Directly above the form that sends the money,
          because "which account is this going to" is asked at exactly that moment. */}
      <CompanySummary company={contragent.company} />

      {/* record money, in either direction, without buying anything */}
      {formOpen && (
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
              <PaymentPicker value={payment} onChange={setPayment} total={sum} cards={cards} disabled={busy}
                accounts={shopAccounts.accounts}
                payee={{ contragentId: contragent.id, accounts: theirAccounts.accounts, label: contragent.name }}
                onAccountsChanged={() => { shopAccounts.reload(); theirAccounts.reload(); }} />
            </Field>
          )}
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("note")} className="h-9 text-[13px]" />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>{t("cancel")}</Button>
            <Button className="flex-1" disabled={busy || sum <= 0 || (moves && !parts)} onClick={() => void record()}>
              {busy ? <Spinner /> : null}{t("save")}
            </Button>
          </div>
        </div>
      )}

      {/* the statement, with the balance after each move */}
      <div className="overflow-hidden rounded-[12px] border border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[14.5px] font-bold text-foreground">{t("ledger_title")}</span>
            <span className="text-[12.5px] text-muted-foreground">{rows.length} {t("moves_n")}</span>
          </div>
        </div>
        {entries === null && <div className="flex justify-center py-8"><Spinner /></div>}
        {entries?.length === 0 && <div className="py-8 text-center text-[13px] text-muted-foreground">{t("empty")}</div>}
        {rows.length > 0 && (
          <div className="hidden grid-cols-[88px_minmax(0,1fr)_110px_110px_20px] gap-3 border-b border-border bg-secondary/40 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground sm:grid">
            <span>{t("date")}</span><span>{t("col_action")}</span><span className="text-right">{t("col_sum")}</span><span className="text-right">{t("col_stock")}</span><span />
          </div>
        )}
        {shown.map(({ e, after }) => {
          const k = KIND[String(e.kind)] ?? KIND.CONTRAGENT_ENTRY_KIND_PURCHASE;
          const fromStock = !!e.movementId;
          return (
            <div key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[88px_minmax(0,1fr)_110px_110px_20px]">
              <span className="hidden font-mono text-[12px] leading-tight text-muted-foreground sm:block">{shortDate(e.occurredAt)}<br />{when(e.occurredAt).split(" ").pop()}</span>
              <div className="flex min-w-0 items-start gap-2.5">
                <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px]", TONE_BG[k.tone])}>{k.icon}</span>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-foreground">{t(k.labelKey)}{e.description ? `: ${e.description}` : ""}</div>
                  <div className="truncate text-[12px] text-muted-foreground">
                    <span className="sm:hidden">{shortDate(e.occurredAt)} · </span>{who(e.staffId)}{e.note ? `${who(e.staffId) ? " · " : ""}${e.note}` : ""}
                  </div>
                  {/* Cash or card, and which card. Without it a statement says money moved
                      and leaves the shop to remember how — which nobody does. */}
                  <PaidBadge paid={e} className="mt-1" />
                  {(e.parts?.length ?? 0) > 1 && <div className="mt-1 max-w-[220px]"><PaidParts paid={e} /></div>}
                </div>
              </div>
              <span className={cn("flex flex-col items-end text-right", k.sign > 0 ? "text-destructive" : "text-success")}>
                <span className="font-mono text-[13.5px] font-bold">{k.sign > 0 ? "+" : "−"}{money(e.amount)}</span>
                {/* What it was agreed in, at the rate of the day it happened. */}
                <FxStamp fx={e.fxAmount} />
              </span>
              <span className={cn("hidden text-right font-mono text-[13.5px] font-semibold sm:block", after > 0 ? "text-destructive" : after < 0 ? "text-success" : "text-foreground")}>
                {after > 0 ? "−" : ""}{money(Math.abs(after))}
              </span>
              {/* An entry written by a stock receipt cannot be removed: the goods are on the
                  shelf, so deleting the debt would leave the two disagreeing. */}
              {!fromStock ? (
                <button onClick={() => void remove(e)} aria-label={t("delete")} className="mt-0.5 hidden text-muted-foreground hover:text-destructive sm:block">
                  <Trash2 className="size-3.5" />
                </button>
              ) : <span className="hidden sm:block" />}
            </div>
          );
        })}
        {!all && rows.length > 5 && (
          <button onClick={() => setAll(true)} className="w-full py-3 text-center text-[13.5px] font-semibold text-primary-emphasis hover:bg-secondary/50">
            {t("more_prefix")} {rows.length - 5} {t("moves_n")}
          </button>
        )}
      </div>
    </div>
  );
}

export function ContragentAccount({ contragent, onClose, onChanged, onEdit }: {
  contragent: Contragent | null;
  onClose: () => void;
  onChanged: () => void;
  onEdit?: () => void;
}) {
  return (
    <Sheet open={!!contragent} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-[600px] overflow-y-auto p-5">
        {contragent && <AccountPanel contragent={contragent} onChanged={onChanged} onEdit={onEdit} />}
      </SheetContent>
    </Sheet>
  );
}

function Totals({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[12px] bg-secondary px-3.5 py-3">
      <span className="truncate text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <span className="font-mono text-[18px] font-bold text-foreground">{money(value)}</span>
      {sub && <span className="truncate text-[12px] text-muted-foreground">{sub}</span>}
    </div>
  );
}
