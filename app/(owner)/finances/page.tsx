"use client";
// Finances: an income-statement view (ACCA-style P&L with margins) plus statistics —
// KPI cards, a 12-month revenue/expenses/profit trend, expense breakdown by category, and
// the overhead-expense ledger. The period can be a month, quarter, year, or custom range.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight, Trash2, Wallet } from "lucide-react";
import { Empty } from "@/components/ui";
import { Card, CardContent } from "@/components/ui-kit/card";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Field } from "@/components/ui-kit/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { Spinner, Separator, Skeleton } from "@/components/ui-kit/misc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { MoneyInput } from "@/components/catalog-fields";
import { FxMoneyInput } from "@/components/fx-money";
import { FxStamp } from "@/components/fx-stamp";
import { emptyFx, findCurrency, fxLabel, fxPayload, fxSoum, useCurrencies, type FxValue } from "@/lib/currency";
import { SuggestInput } from "@/components/suggest-input";
import { PaymentPicker, PaidBadge, PaidParts, toParts, usePayment, useShopCards, useShopAccounts } from "@/components/payment-picker";
import { useAuth, useLang, useToast } from "@/components/providers";
import { PeriodPicker, usePeriod, monthRange, lastNMonths } from "../_period";
import { api, ApiError } from "@/lib/api";
import { useAutoRefresh } from "@/lib/use-refresh";
import { money, num } from "@/lib/format";
import { expenseCategory } from "@/lib/system-text";
import { cn } from "@/lib/utils";
import type { ShopExpense, ProfitAndLoss, Staff } from "@/lib/types";
import { formatLongDate } from "@/lib/i18n";
import { IncomeBreakdownModal, IncomeBreakdownPanel } from "@/components/income-breakdown";
import { DaySheet } from "@/components/day-sheet";
import { Row, StatCard } from "../_shared";

const CATS = ["rent", "salary", "utilities", "supplies", "tax", "other"] as const;

const dateStr = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export default function FinancesPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t, lang } = useLang();
  const { toast } = useToast();

  // The period control is shared with Statistics: the two pages show overlapping figures, and
  // two implementations of "this month" would eventually disagree.
  const period = usePeriod();
  const range = period.range;

  const [pl, setPl] = useState<ProfitAndLoss | null>(null);
  const [expenses, setExpenses] = useState<ShopExpense[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [trend, setTrend] = useState<{ label: string; revenue: number; expenses: number; net: number }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<ShopExpense | null>(null);
  const [tab, setTab] = useState<"stats" | "expenses">("stats");
  const [showIncome, setShowIncome] = useState(false);

  const staffName = useCallback((id?: string) => (id ? staff.find((s) => s.id === id)?.name ?? "" : ""), [staff]);
  const knownCats = useMemo(() => {
    const set = new Set<string>(CATS);
    for (const e of expenses) if (e.category) set.add(e.category);
    return Array.from(set);
  }, [expenses]);
  // Who this shop has paid before, most recent first — the expense list already arrives that way.
  const payees = useMemo(() => expenses.flatMap((e) => (e.payee ? [e.payee] : [])), [expenses]);

  useEffect(() => {
    // Everyone, including people who have left: the salary picker below filters to active
    // itself, while the expense list needs to name whoever actually recorded each row.
    api.listStaff(shopId).then(setStaff).catch(() => {});
  }, [shopId]);

  const loadTrend = useCallback(async () => {
    const months = lastNMonths(12);
    const res = await Promise.all(months.map((m) =>
      api.getProfitLoss(shopId, monthRange(m.ym).from, monthRange(m.ym).to)
        .then((p) => ({ label: m.label, revenue: num(p.revenue), expenses: num(p.costOfGoods) + num(p.overhead), net: num(p.netProfit) }))
        .catch(() => ({ label: m.label, revenue: 0, expenses: 0, net: 0 }))));
    setTrend(res);
  }, [shopId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, e] = await Promise.all([
        api.getProfitLoss(shopId, range.from, range.to),
        api.listExpenses(shopId, range.from, range.to),
      ]);
      setPl(p); setExpenses(e);
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, range, t, toast]);

  useEffect(() => { load(); }, [load]);
  // Other staff change these records while this tab sits open; refresh when it regains focus.
  useAutoRefresh(load);
  useEffect(() => { loadTrend(); }, [loadTrend]);
  const reload = () => { load(); loadTrend(); };

  const revenue = num(pl?.revenue), cogs = num(pl?.costOfGoods), gross = num(pl?.grossMargin);
  const overhead = num(pl?.overhead), net = num(pl?.netProfit), orders = pl?.workOrderCount ?? 0;
  const avgTicket = orders > 0 ? Math.round(revenue / orders) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* tabs + add */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "stats" | "expenses")}>
          <TabsList>
            <TabsTrigger value="stats">{t("statistics")}</TabsTrigger>
            <TabsTrigger value="expenses">{t("expenses")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "expenses" && <Button onClick={() => setAdding(true)}><Plus /> {t("add_expense")}</Button>}
      </div>

      <PeriodPicker p={period} />

      {loading ? <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        : tab === "stats" ? <>
          {/* KPI cards */}
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            <StatCard label={t("revenue")} value={money(revenue)} sub={t("soum")} icon="money" tone="accent" big onClick={() => setShowIncome(true)} />
            <StatCard label={t("gross_margin")} value={money(gross)} sub={pct(gross, revenue) + "% " + t("margin")} icon="chart" tone="info" />
            <StatCard label={t("overhead")} value={money(overhead)} sub={pct(overhead, revenue) + "% " + t("of_revenue")} icon="receipt" tone="warn" />
            <StatCard label={t("net_profit")} value={money(net)} sub={pct(net, revenue) + "% " + t("margin")} icon="money" tone={net >= 0 ? "ok" : "danger"} />
            <StatCard label={t("orders")} value={orders} icon="clipboard" tone="neutral" />
            <StatCard label={t("avg_ticket")} value={money(avgTicket)} sub={t("soum")} icon="chart" tone="neutral" />
          </div>

          {/* income statement */}
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3.5 text-[15px] font-bold text-foreground">{t("income_statement")}</div>
            <div className="px-5 py-2">
              <PLRow label={t("revenue")} value={revenue} pct={100} onClick={() => setShowIncome(true)} />
              <PLRow label={t("cost_of_goods")} value={-cogs} pct={-pct(cogs, revenue)} />
              <Separator className="my-1.5" />
              <PLRow label={t("gross_margin")} value={gross} pct={pct(gross, revenue)} strong />
              {(pl?.byCategory ?? []).map((b) => (
                <PLRow key={b.category} label={expenseCategory(lang, b.category)} value={-num(b.amount)} pct={-pct(num(b.amount), revenue)} muted />
              ))}
              <PLRow label={t("overhead")} value={-overhead} pct={-pct(overhead, revenue)} />
              <Separator className="my-1.5" />
              <PLRow label={t("net_profit")} value={net} pct={pct(net, revenue)} strong tone={net >= 0 ? "ok" : "danger"} />
            </div>
          </Card>

          {/* One chosen day, document by document. Only on the day window: over a month this
              would be hundreds of rows and would answer nothing the cards above do not. */}
          {period.gran === "day" && (
            <div className="flex flex-col gap-2">
              <div className="px-1 text-[12px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                {t("day_detail")} · <span className="font-mono normal-case tracking-normal">{formatLongDate(lang, period.day)}</span>
              </div>
              <DaySheet shopId={shopId} from={range.from} to={range.to} />
            </div>
          )}

          {/* income by payment method (cash / card — which card / other) */}
          <Card className="p-5">
            <div className="mb-3 text-[15px] font-bold text-foreground">{t("income_title")}</div>
            <IncomeBreakdownPanel shopId={shopId} from={range.from} to={range.to} />
          </Card>

          {/* 12-month trend */}
          <Card className="p-5">
            <div className="mb-1 text-[15px] font-bold text-foreground">{t("trend_12m")}</div>
            {trend ? <TrendChart data={trend} t={t} /> : <div className="flex justify-center py-8"><Spinner className="size-5" /></div>}
          </Card>

          {/* expense breakdown */}
          {!!pl?.byCategory?.length && (
            <Card className="p-5">
              <div className="mb-3 text-[15px] font-bold text-foreground">{t("expenses_by_category")}</div>
              <CategoryBars data={pl.byCategory.map((b) => ({ label: expenseCategory(lang, b.category), amount: num(b.amount) }))} />
            </Card>
          )}
        </> : <>
          {/* expense ledger */}
          <div className="flex flex-col gap-2">
            <div className="px-1 text-[12px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{t("expenses")}</div>
            {expenses.length > 0 && <OutByMethod expenses={expenses} />}
            {expenses.length === 0 ? <Card className="p-6"><Empty icon="money" text={t("no_expenses")} /></Card>
              : <Card className="overflow-hidden">
                {expenses.map((e) => {
                  const receiver = staffName(e.staffId) || e.payee || "";
                  const payer = staffName(e.paidBy);
                  return (
                  <button key={e.id} onClick={() => setDetail(e)} className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-secondary/60 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-foreground">{expenseCategory(lang, e.category)}{receiver ? <span className="font-normal text-muted-foreground"> · {receiver}</span> : null}{e.note ? <span className="font-normal text-muted-foreground"> · {e.note}</span> : null}</div>
                      {/* Date, then how it was paid and by whom — the three things somebody
                          checking the till against the book needs off one line. */}
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-[12px] text-muted-foreground">{dateStr(e.incurredOn)}</span>
                        <PaidBadge paid={e} />
                        {payer && <span className="text-[12px] text-muted-foreground">{payer}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <div className="font-mono text-[14px] font-bold text-foreground">{money(num(e.amount))}</div>
                        {/* What the cost was agreed in, at the rate of the day it was paid. */}
                        <FxStamp fx={e.fxAmount} />
                      </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                  );
                })}
              </Card>}
          </div>
        </>}
      <AddModal open={adding} onClose={() => setAdding(false)} shopId={shopId} staff={staff} knownCats={knownCats} payees={payees} me={session!.staff.id} onCreated={reload} />
      <ExpenseDetailModal expense={detail} receiver={staffName(detail?.staffId) || detail?.payee || ""} paidByName={staffName(detail?.paidBy)} onClose={() => setDetail(null)} onDeleted={() => { setDetail(null); reload(); }} />
      <IncomeBreakdownModal open={showIncome} onClose={() => setShowIncome(false)} shopId={shopId} from={range.from} to={range.to} title={t("income_title")} />
    </div>
  );
}

// TrendChart: grouped monthly bars (revenue vs expenses).
function TrendChart({ data, t }: { data: { label: string; revenue: number; expenses: number; net: number }[]; t: (k: string) => string }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.expenses)));
  const H = 140;
  return (
    <div>
      <div className="mb-3 flex gap-4 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-[var(--accent)]" />{t("revenue")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-[var(--warn)]" />{t("expenses")}</span>
      </div>
      <div className="flex items-end gap-1 overflow-x-auto" style={{ height: H }}>
        {data.map((d, i) => (
          <div key={i} className="flex min-w-[24px] flex-1 flex-col items-center justify-end gap-1" style={{ height: "100%" }} title={`${d.label}: ${money(d.revenue)} / ${money(d.expenses)}`}>
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: H }}>
              <div className="w-[42%] max-w-[14px] rounded-t-[3px] bg-[var(--accent)]" style={{ height: Math.max(2, (d.revenue / max) * H) }} />
              <div className="w-[42%] max-w-[14px] rounded-t-[3px] bg-[var(--warn)]" style={{ height: Math.max(2, (d.expenses / max) * H) }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        {data.map((d, i) => <div key={i} className="min-w-[24px] flex-1 text-center text-[10.5px] text-muted-foreground">{d.label}</div>)}
      </div>
    </div>
  );
}

function CategoryBars({ data }: { data: { label: string; amount: number }[] }) {
  const sorted = [...data].sort((a, b) => b.amount - a.amount);
  const max = Math.max(1, ...sorted.map((d) => d.amount));
  return (
    <div className="flex flex-col gap-2.5">
      {sorted.map((d, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <div className="w-24 shrink-0 truncate text-[12.5px] text-ink-2">{d.label}</div>
          <div className="h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(d.amount / max) * 100}%` }} />
          </div>
          <div className="w-20 text-right font-mono text-[12.5px] font-bold text-foreground">{money(d.amount)}</div>
        </div>
      ))}
    </div>
  );
}

// What left the shop in this window, by how it left. The mirror of the income breakdown
// above, and the reason recording the method is worth the extra tap: a shop can now check
// the till against the book instead of taking the total on trust.
//
// Expenses only. Paying a supplier is real money leaving too, but it is not an expense —
// a part's cost reaches profit when it is fitted, not when it is bought — so mixing the two
// here would put the same money in two places. The line under the bars says so.
function OutByMethod({ expenses }: { expenses: ShopExpense[] }) {
  const { t } = useLang();
  const rows = useMemo(() => {
    const by = new Map<string, number>();
    for (const e of expenses) {
      const parts = e.parts ?? [];
      if (parts.length === 0) {
        by.set("", (by.get("") ?? 0) + num(e.amount));
        continue;
      }
      for (const p of parts) {
        const k = String(p.method ?? "");
        by.set(k, (by.get(k) ?? 0) + num(p.amount));
      }
    }
    const label = (k: string) =>
      k === "PAYMENT_METHOD_CARD" ? t("pay_card")
        : k === "PAYMENT_METHOD_OTHER" ? t("pay_other")
        : k === "PAYMENT_METHOD_CASH" ? t("pay_cash")
        : t("pay_unstated");
    return Array.from(by, ([k, amount]) => ({ key: k, label: label(k), amount, unstated: !k }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, t]);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total <= 0) return null;
  return (
    <Card className="p-5">
      <div className="mb-3 text-[15px] font-bold text-foreground">{t("out_by_method")}</div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.key || "none"} className="flex items-center gap-2.5">
            <div className={cn("w-28 shrink-0 truncate text-[12.5px]", r.unstated ? "text-muted-foreground italic" : "text-ink-2")}>{r.label}</div>
            <div className="h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
              <div className={cn("h-full rounded-full", r.unstated ? "bg-border" : "bg-[var(--warn)]")} style={{ width: `${(r.amount / total) * 100}%` }} />
            </div>
            <div className="w-24 text-right font-mono text-[12.5px] font-bold text-foreground">{money(r.amount)}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">{t("out_hint")}</p>
    </Card>
  );
}

function ExpenseDetailModal({ expense, receiver, paidByName, onClose, onDeleted }: { expense: ShopExpense | null; receiver: string; paidByName: string; onClose: () => void; onDeleted: () => void }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (expense) setConfirm(false); }, [expense]);
  const e = expense;
  // For rendering the stamp: the symbol and decimal places come from the list, the rate and
  // the amount from the row itself, so the figure shown is the one that was recorded.
  const currencies = useCurrencies();
  const fullDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" }) : "—");
  const recorded = e?.createdAt ? new Date(e.createdAt).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const remove = async () => {
    if (busy || !e) return; setBusy(true);
    try { await api.deleteExpense(e.id); onDeleted(); }
    catch (err) { toast(err instanceof ApiError ? err.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!expense} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader><DialogTitle>{e ? expenseCategory(lang, e.category) : ""}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          {e && (
            <div className="rounded-[12px] bg-secondary/60 p-4">
              <Row label={t("amount")} value={money(num(e.amount)) + " " + t("soum")} strong mono />
              {e.fxAmount?.currency && <Row label={t("fx_in_currency")} value={fxLabel(e.fxAmount, currencies)} mono />}
              <Separator className="my-2" />
              <Row label={t("category")} value={expenseCategory(lang, e.category)} />
              <Row label={t("date")} value={fullDate(e.incurredOn)} />
              {receiver && <Row label={t("receiver")} value={receiver} />}
              {paidByName && <Row label={t("paid_by")} value={paidByName} />}
              {(e.method || e.parts?.length) && (
                <div className="flex items-baseline justify-between gap-3 py-[3px]">
                  <span className="text-[13px] text-ink-2">{t("payment_method")}</span>
                  <PaidBadge paid={e} />
                </div>
              )}
              {/* A split is worth spelling out: "cash + card" says which, not how much of each. */}
              {(e.parts?.length ?? 0) > 1 && <div className="mt-1 rounded-[9px] bg-card px-3 py-2"><PaidParts paid={e} /></div>}
              {e.note && <Row label={t("notes")} value={e.note} />}
              <Row label={t("created")} value={recorded} mono />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {confirm ? (
            <>
              <span className="mr-auto self-center text-[13px] text-ink-2">{t("delete") + "?"}</span>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>{t("no")}</Button>
              <Button variant="destructive" disabled={busy} onClick={remove}>{busy ? <Spinner /> : t("delete")}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="mr-auto text-destructive hover:bg-destructive-soft" onClick={() => setConfirm(true)}><Trash2 /> {t("delete")}</Button>
              <Button onClick={onClose}>{t("close") || "OK"}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PLRow({ label, value, pct, strong, tone, muted, onClick }: { label: string; value: number; pct?: number; strong?: boolean; tone?: "ok" | "danger"; muted?: boolean; onClick?: () => void }) {
  const color = tone === "ok" ? "text-success" : tone === "danger" ? "text-destructive" : muted ? "text-ink-2" : "text-foreground";
  return (
    <div onClick={onClick} className={cn("flex items-center justify-between", muted ? "py-[3px] pl-3.5" : "py-[5px]", onClick && "-mx-2 cursor-pointer rounded-md px-2 transition-colors hover:bg-secondary/60")}>
      <span className={cn(muted ? "text-[12.5px] text-muted-foreground" : strong ? "text-[13.5px] font-bold text-foreground" : "text-[13.5px] font-medium text-ink-2")}>{label}</span>
      <span className="inline-flex items-baseline gap-2">
        {pct !== undefined && <span className="w-11 text-right font-mono text-[11.5px] text-muted-foreground">{pct.toFixed(1)}%</span>}
        <span className={cn("w-[90px] text-right font-mono", strong ? "text-[14px] font-extrabold" : "text-[14px] font-semibold", color)}>{money(value)}</span>
      </span>
    </div>
  );
}

const CUSTOM = "__custom__";

function AddModal({ open, onClose, shopId, staff, knownCats, payees, me, onCreated }: { open: boolean; onClose: () => void; shopId: string; staff: Staff[]; knownCats: string[]; payees: string[]; me: string; onCreated: () => void }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const blank = { category: "rent", customCat: "", amount: emptyFx(), date: today(), note: "", staffId: "", payee: "", paidBy: me };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  // How it was paid. The same control the supplier account and the client account use.
  const { payment, setPayment, reset } = usePayment();
  const cards = useShopCards(shopId);
  // Money that moves by bank names the account it moved through, here as everywhere else.
  const shopAccounts = useShopAccounts();
  useEffect(() => { if (open) { setF(blank); reset(); } }, [open]);

  const isSalary = f.category === "salary";
  const resolvedCat = f.category === CUSTOM ? f.customCat.trim() : f.category;
  const currencies = useCurrencies();
  // The so'm preview, for the payment split and the save button. Rent agreed in dollars is
  // the ordinary case here; what gets POSTed is the typed amount and its rate.
  const amount = fxSoum(f.amount, findCurrency(currencies, f.amount.currency));
  const parts = toParts(payment, amount, shopAccounts.accounts);

  const save = async () => {
    if (amount <= 0 || !resolvedCat || !parts || busy) return;
    setBusy(true);
    try {
      await api.createExpense(shopId, {
        category: resolvedCat, amount,
        fxAmount: fxPayload(f.amount, findCurrency(currencies, f.amount.currency)),
        incurredOn: new Date(f.date + "T12:00:00").toISOString(), note: f.note.trim(),
        staffId: isSalary ? f.staffId : "",
        payee: isSalary ? "" : f.payee.trim(),
        paidBy: f.paidBy,
        parts,
      });
      toast(t("save"), { icon: "check" }); onClose(); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader><DialogTitle>{t("add_expense")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t("category")}>
              <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {knownCats.map((c) => <SelectItem key={c} value={c}>{expenseCategory(lang, c)}</SelectItem>)}
                  <SelectItem value={CUSTOM}>+ {t("custom_category")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("date")}><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          </div>
          {f.category === CUSTOM && (
            <Field label={t("custom_category")}>
              <Input value={f.customCat} onChange={(e) => setF({ ...f, customCat: e.target.value })} placeholder={t("category")} autoFocus />
            </Field>
          )}
          {isSalary ? (
            <Field label={t("receiver") + " (" + t("worker") + ")"}>
              <Select value={f.staffId} onValueChange={(v) => setF({ ...f, staffId: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label={t("receiver")}>
              {/* The same landlord, the same parts supplier, month after month. Typed afresh
                  every time they become several spellings of one payee in the breakdown. */}
              <SuggestInput value={f.payee} options={payees} onChange={(v) => setF({ ...f, payee: v })} placeholder={t("receiver_ph")} />
            </Field>
          )}
          <Field label={t("amount")}>
            <FxMoneyInput value={f.amount} currencies={currencies} onChange={(v) => setF({ ...f, amount: v })} />
          </Field>
          {/* How it left the shop. Asked here rather than nowhere, because "5 000 000 on rent"
              and "5 000 000 in cash on rent" are different facts when the till is counted. */}
          <Field label={t("payment_method")}>
            <PaymentPicker value={payment} onChange={setPayment} total={amount} cards={cards} disabled={busy}
                    accounts={shopAccounts.accounts} onAccountsChanged={shopAccounts.reload} />
          </Field>
          <Field label={t("paid_by")}>
            <Select value={f.paidBy} onValueChange={(v) => setF({ ...f, paidBy: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={t("notes")}><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy || !parts} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
