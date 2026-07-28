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
import { useAuth, useLang, useToast } from "@/components/providers";
import { PeriodPicker, usePeriod, monthRange, lastNMonths } from "../_period";
import { api, ApiError } from "@/lib/api";
import { useAutoRefresh } from "@/lib/use-refresh";
import { money, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ShopExpense, ProfitAndLoss, Staff } from "@/lib/types";
import { IncomeBreakdownModal, IncomeBreakdownPanel } from "@/components/income-breakdown";
import { Row, StatCard } from "../_shared";

const CATS = ["rent", "salary", "utilities", "supplies", "tax", "other"] as const;
const PREDEFINED = new Set<string>(CATS);

function catLabel(c: string, t: (k: string) => string): string {
  return PREDEFINED.has(c) ? t("cat_" + c) : c;
}

const dateStr = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export default function FinancesPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
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

  useEffect(() => {
    api.listStaff(shopId).then((s) => setStaff(s.filter((x) => x.active))).catch(() => {});
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
                <PLRow key={b.category} label={catLabel(b.category, t)} value={-num(b.amount)} pct={-pct(num(b.amount), revenue)} muted />
              ))}
              <PLRow label={t("overhead")} value={-overhead} pct={-pct(overhead, revenue)} />
              <Separator className="my-1.5" />
              <PLRow label={t("net_profit")} value={net} pct={pct(net, revenue)} strong tone={net >= 0 ? "ok" : "danger"} />
            </div>
          </Card>

          {/* income by payment method (cash / card — which card / other) */}
          <Card className="p-5">
            <div className="mb-3 text-[15px] font-bold text-foreground">{t("income_by_method")}</div>
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
              <CategoryBars data={pl.byCategory.map((b) => ({ label: catLabel(b.category, t), amount: num(b.amount) }))} />
            </Card>
          )}
        </> : <>
          {/* expense ledger */}
          <div className="flex flex-col gap-2">
            <div className="px-1 text-[12px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{t("expenses")}</div>
            {expenses.length === 0 ? <Card className="p-6"><Empty icon="money" text={t("no_expenses")} /></Card>
              : <Card className="overflow-hidden">
                {expenses.map((e) => {
                  const receiver = staffName(e.staffId) || e.payee || "";
                  return (
                  <button key={e.id} onClick={() => setDetail(e)} className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-secondary/60 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-foreground">{catLabel(e.category, t)}{receiver ? <span className="font-normal text-muted-foreground"> · {receiver}</span> : null}{e.note ? <span className="font-normal text-muted-foreground"> · {e.note}</span> : null}</div>
                      <div className="font-mono text-[12px] text-muted-foreground">{dateStr(e.incurredOn)}</div>
                    </div>
                    <div className="font-mono text-[14px] font-bold text-foreground">{money(num(e.amount))}</div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                  );
                })}
              </Card>}
          </div>
        </>}
      <AddModal open={adding} onClose={() => setAdding(false)} shopId={shopId} staff={staff} knownCats={knownCats} onCreated={reload} />
      <ExpenseDetailModal expense={detail} receiver={staffName(detail?.staffId) || detail?.payee || ""} paidByName={staffName(detail?.paidBy)} onClose={() => setDetail(null)} onDeleted={() => { setDetail(null); reload(); }} />
      <IncomeBreakdownModal open={showIncome} onClose={() => setShowIncome(false)} shopId={shopId} from={range.from} to={range.to} title={t("income_by_method")} />
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

function ExpenseDetailModal({ expense, receiver, paidByName, onClose, onDeleted }: { expense: ShopExpense | null; receiver: string; paidByName: string; onClose: () => void; onDeleted: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (expense) setConfirm(false); }, [expense]);
  const e = expense;
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
        <DialogHeader><DialogTitle>{e ? catLabel(e.category, t) : ""}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          {e && (
            <div className="rounded-[12px] bg-secondary/60 p-4">
              <Row label={t("amount")} value={money(num(e.amount)) + " " + t("soum")} strong mono />
              <Separator className="my-2" />
              <Row label={t("category")} value={catLabel(e.category, t)} />
              <Row label={t("date")} value={fullDate(e.incurredOn)} />
              {receiver && <Row label={t("receiver")} value={receiver} />}
              {paidByName && <Row label={t("paid_by")} value={paidByName} />}
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

function AddModal({ open, onClose, shopId, staff, knownCats, onCreated }: { open: boolean; onClose: () => void; shopId: string; staff: Staff[]; knownCats: string[]; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const blank = { category: "rent", customCat: "", amount: "", date: today(), note: "", staffId: "", payee: "", paidBy: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(blank); }, [open]);

  const isSalary = f.category === "salary";
  const resolvedCat = f.category === CUSTOM ? f.customCat.trim() : f.category;

  const save = async () => {
    const amount = parseInt(f.amount, 10) || 0;
    if (amount <= 0 || !resolvedCat || busy) return;
    setBusy(true);
    try {
      await api.createExpense(shopId, {
        category: resolvedCat, amount,
        incurredOn: new Date(f.date + "T12:00:00").toISOString(), note: f.note.trim(),
        staffId: isSalary ? f.staffId : "",
        payee: isSalary ? "" : f.payee.trim(),
        paidBy: f.paidBy,
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
                  {knownCats.map((c) => <SelectItem key={c} value={c}>{catLabel(c, t)}</SelectItem>)}
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
              <Input value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} placeholder={t("receiver_ph")} />
            </Field>
          )}
          <Field label={t("amount")}><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
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
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
