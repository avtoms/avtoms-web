"use client";
// Finances: an income-statement view (ACCA-style P&L with margins) plus statistics —
// KPI cards, a 12-month revenue/expenses/profit trend, expense breakdown by category, and
// the overhead-expense ledger. The period can be a month, quarter, year, or custom range.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Btn, IconBtn, Modal, Field, TextInput, SelectInput, Segmented, Spinner, Empty } from "@/components/ui";
import { MoneyInput } from "@/components/catalog-fields";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";
import type { ShopExpense, ProfitAndLoss, Staff } from "@/lib/types";
import { Row, StatCard } from "../_shared";

const CATS = ["rent", "salary", "utilities", "supplies", "tax", "other"] as const;
const PREDEFINED = new Set<string>(CATS);

// A predefined category shows its translated label; a shop's custom one shows as typed.
function catLabel(c: string, t: (k: string) => string): string {
  return PREDEFINED.has(c) ? t("cat_" + c) : c;
}

const isoFrom = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 0, 0, 0)).toISOString();
const isoTo = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 23, 59, 59)).toISOString();

// First/last instant of a YYYY-MM string, as RFC3339.
function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  return { from: isoFrom(y, m - 1, 1), to: isoTo(y, m, 0) };
}
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// The trailing N months (oldest→newest), each as {ym, label}.
function lastNMonths(n: number): { ym: string; label: string }[] {
  const out: { ym: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    out.push({ ym: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString(undefined, { month: "short" }) });
  }
  return out;
}
const dateStr = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

type Gran = "month" | "quarter" | "year" | "custom";

export default function FinancesPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [gran, setGran] = useState<Gran>("month");
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [cFrom, setCFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [cTo, setCTo] = useState(currentMonth() + "-28");

  const [pl, setPl] = useState<ProfitAndLoss | null>(null);
  const [expenses, setExpenses] = useState<ShopExpense[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [trend, setTrend] = useState<{ label: string; revenue: number; expenses: number; net: number }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<ShopExpense | null>(null);
  const [tab, setTab] = useState<"stats" | "expenses">("stats");

  const range = useMemo(() => {
    if (gran === "month") return monthRange(month);
    if (gran === "quarter") return { from: isoFrom(year, (quarter - 1) * 3, 1), to: isoTo(year, quarter * 3, 0) };
    if (gran === "year") return { from: isoFrom(year, 0, 1), to: isoTo(year, 11, 31) };
    return { from: new Date(cFrom + "T00:00:00Z").toISOString(), to: new Date(cTo + "T23:59:59Z").toISOString() };
  }, [gran, month, year, quarter, cFrom, cTo]);

  const staffName = useCallback((id?: string) => (id ? staff.find((s) => s.id === id)?.name ?? "" : ""), [staff]);
  const knownCats = useMemo(() => {
    const set = new Set<string>(CATS);
    for (const e of expenses) if (e.category) set.add(e.category);
    return Array.from(set);
  }, [expenses]);

  useEffect(() => {
    api.listStaff(shopId).then((s) => setStaff(s.filter((x) => x.active))).catch(() => {});
  }, [shopId]);

  // 12-month trend — independent of the selected period; refetched after mutations.
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
  useEffect(() => { loadTrend(); }, [loadTrend]);
  const reload = () => { load(); loadTrend(); };

  const revenue = num(pl?.revenue), cogs = num(pl?.costOfGoods), gross = num(pl?.grossMargin);
  const overhead = num(pl?.overhead), net = num(pl?.netProfit), orders = pl?.workOrderCount ?? 0;
  const avgTicket = orders > 0 ? Math.round(revenue / orders) : 0;
  const yearOpts = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* tabs + add */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Segmented options={[{ value: "stats", label: t("statistics") }, { value: "expenses", label: t("expenses") }]} value={tab} onChange={(v) => setTab(v as "stats" | "expenses")} />
        {tab === "expenses" && <Btn variant="primary" icon="plus" onClick={() => setAdding(true)}>{t("add_expense")}</Btn>}
      </div>

      {/* period controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Segmented size="sm" options={[{ value: "month", label: t("per_month") }, { value: "quarter", label: t("per_quarter") }, { value: "year", label: t("per_year") }, { value: "custom", label: t("per_custom") }]} value={gran} onChange={(v) => setGran(v as Gran)} />
          {gran === "month" && <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ maxWidth: 160, fontFamily: "var(--font-mono)" }} />}
          {gran === "quarter" && <>
            <Segmented size="sm" options={[1, 2, 3, 4].map((q) => ({ value: String(q), label: "Q" + q }))} value={String(quarter)} onChange={(v) => setQuarter(parseInt(v, 10))} />
            <SelectInput value={String(year)} onChange={(e) => setYear(parseInt(e.target.value, 10))} style={{ maxWidth: 110 }}>{yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}</SelectInput>
          </>}
          {gran === "year" && <SelectInput value={String(year)} onChange={(e) => setYear(parseInt(e.target.value, 10))} style={{ maxWidth: 110 }}>{yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}</SelectInput>}
          {gran === "custom" && <>
            <TextInput type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} style={{ maxWidth: 150 }} />
            <span style={{ color: "var(--ink-3)" }}>—</span>
            <TextInput type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} style={{ maxWidth: 150 }} />
          </>}
        </div>
      </div>

      {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={24} /></div>
        : tab === "stats" ? <>
          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <StatCard label={t("revenue")} value={money(revenue)} sub={t("soum")} icon="money" tone="accent" big />
            <StatCard label={t("gross_margin")} value={money(gross)} sub={pct(gross, revenue) + "% " + t("margin")} icon="chart" tone="info" />
            <StatCard label={t("overhead")} value={money(overhead)} sub={pct(overhead, revenue) + "% " + t("of_revenue")} icon="receipt" tone="warn" />
            <StatCard label={t("net_profit")} value={money(net)} sub={pct(net, revenue) + "% " + t("margin")} icon="money" tone={net >= 0 ? "ok" : "danger"} />
            <StatCard label={t("orders")} value={orders} icon="clipboard" tone="neutral" />
            <StatCard label={t("avg_ticket")} value={money(avgTicket)} sub={t("soum")} icon="chart" tone="neutral" />
          </div>

          {/* income statement (ACCA-style P&L with % of revenue) */}
          <Card pad={0}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", fontWeight: 700, color: "var(--ink)" }}>{t("income_statement")}</div>
            <div style={{ padding: "8px 18px" }}>
              <PLRow label={t("revenue")} value={revenue} pct={100} />
              <PLRow label={t("cost_of_goods")} value={-cogs} pct={-pct(cogs, revenue)} />
              <div style={{ height: 1, background: "var(--line-2)", margin: "6px 0" }} />
              <PLRow label={t("gross_margin")} value={gross} pct={pct(gross, revenue)} strong />
              {(pl?.byCategory ?? []).map((b) => (
                <PLRow key={b.category} label={catLabel(b.category, t)} value={-num(b.amount)} pct={-pct(num(b.amount), revenue)} muted />
              ))}
              <PLRow label={t("overhead")} value={-overhead} pct={-pct(overhead, revenue)} />
              <div style={{ height: 1, background: "var(--line-2)", margin: "6px 0" }} />
              <PLRow label={t("net_profit")} value={net} pct={pct(net, revenue)} strong tone={net >= 0 ? "ok" : "danger"} />
            </div>
          </Card>

          {/* 12-month trend */}
          <Card>
            <div style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>{t("trend_12m")}</div>
            {trend ? <TrendChart data={trend} t={t} /> : <div style={{ display: "flex", justifyContent: "center", padding: 30 }}><Spinner size={20} /></div>}
          </Card>

          {/* expense breakdown */}
          {!!pl?.byCategory?.length && (
            <Card>
              <div style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>{t("expenses_by_category")}</div>
              <CategoryBars data={pl.byCategory.map((b) => ({ label: catLabel(b.category, t), amount: num(b.amount) }))} />
            </Card>
          )}
        </> : <>
          {/* expense ledger */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 4px" }}>{t("expenses")}</div>
            {expenses.length === 0 ? <Card pad={24}><Empty icon="money" text={t("no_expenses")} /></Card>
              : <Card pad={0}>
                {expenses.map((e) => {
                  const worker = staffName(e.staffId);
                  return (
                  <div key={e.id} className="an-row-btn" onClick={() => setDetail(e)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14px * var(--scale))" }}>{catLabel(e.category, t)}{worker ? <span style={{ fontWeight: 400, color: "var(--ink-3)" }}> · {worker}</span> : null}{e.note ? <span style={{ fontWeight: 400, color: "var(--ink-3)" }}> · {e.note}</span> : null}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{dateStr(e.incurredOn)}</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: "calc(14px * var(--scale))" }}>{money(num(e.amount))}</div>
                    <IconBtn icon="chevR" onClick={(ev) => { ev.stopPropagation(); setDetail(e); }} />
                  </div>
                  );
                })}
              </Card>}
          </div>
        </>}
      <AddModal open={adding} onClose={() => setAdding(false)} shopId={shopId} staff={staff} knownCats={knownCats} onCreated={reload} />
      <ExpenseDetailModal expense={detail} workerName={staffName(detail?.staffId)} onClose={() => setDetail(null)} onDeleted={() => { setDetail(null); reload(); }} />
    </div>
  );
}

// TrendChart: grouped monthly bars (revenue vs expenses) with the net-profit number below.
function TrendChart({ data, t }: { data: { label: string; revenue: number; expenses: number; net: number }[]; t: (k: string) => string }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.expenses)));
  const H = 130;
  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 10, fontSize: 12, color: "var(--ink-2)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--accent)" }} />{t("revenue")}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--warn)" }} />{t("expenses")}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: H, overflowX: "auto" }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, minWidth: 24, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", gap: 4 }} title={`${d.label}: ${money(d.revenue)} / ${money(d.expenses)}`}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: H, width: "100%", justifyContent: "center" }}>
              <div style={{ width: "42%", maxWidth: 14, height: Math.max(2, (d.revenue / max) * H), background: "var(--accent)", borderRadius: "3px 3px 0 0" }} />
              <div style={{ width: "42%", maxWidth: 14, height: Math.max(2, (d.expenses / max) * H), background: "var(--warn)", borderRadius: "3px 3px 0 0" }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, minWidth: 24, textAlign: "center", fontSize: 10.5, color: "var(--ink-3)" }}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}

// CategoryBars: horizontal proportional bars of overhead by category.
function CategoryBars({ data }: { data: { label: string; amount: number }[] }) {
  const sorted = [...data].sort((a, b) => b.amount - a.amount);
  const max = Math.max(1, ...sorted.map((d) => d.amount));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {sorted.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 96, fontSize: 12.5, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{d.label}</div>
          <div style={{ flex: 1, height: 14, background: "var(--surface-2)", borderRadius: 99, overflow: "hidden", minWidth: 0 }}>
            <div style={{ width: `${(d.amount / max) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 99 }} />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12.5, color: "var(--ink)", minWidth: 80, textAlign: "right" }}>{money(d.amount)}</div>
        </div>
      ))}
    </div>
  );
}

function ExpenseDetailModal({ expense, workerName, onClose, onDeleted }: { expense: ShopExpense | null; workerName: string; onClose: () => void; onDeleted: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (expense) setConfirm(false); }, [expense]);
  if (!expense) return null;
  const e = expense;
  const fullDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" }) : "—");
  const recorded = e.createdAt ? new Date(e.createdAt).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const remove = async () => {
    if (busy) return; setBusy(true);
    try { await api.deleteExpense(e.id); onDeleted(); }
    catch (err) { toast(err instanceof ApiError ? err.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={!!expense} onClose={onClose} title={catLabel(e.category, t)} maxWidth={420}
      footer={confirm
        ? <><span style={{ marginRight: "auto", color: "var(--ink-2)", fontSize: 13 }}>{t("delete") + "?"}</span><Btn variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>{t("no")}</Btn><Btn variant="primary" disabled={busy} style={{ background: "var(--danger)" }} onClick={remove}>{busy ? <Spinner /> : t("delete")}</Btn></>
        : <><Btn variant="ghost" disabled={busy} onClick={() => setConfirm(true)} style={{ color: "var(--danger)", marginRight: "auto" }} icon="trash">{t("delete")}</Btn><Btn variant="primary" onClick={onClose}>{t("close") || "OK"}</Btn></>}>
      <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 16 }}>
        <Row label={t("amount")} value={money(num(e.amount)) + " " + t("soum")} strong mono />
        <div style={{ height: 1, background: "var(--line)", margin: "8px 0" }} />
        <Row label={t("category")} value={catLabel(e.category, t)} />
        <Row label={t("date")} value={fullDate(e.incurredOn)} />
        {workerName && <Row label={t("worker")} value={workerName} />}
        {e.note && <Row label={t("notes")} value={e.note} />}
        <Row label={t("created")} value={recorded} mono />
      </div>
    </Modal>
  );
}

function PLRow({ label, value, pct, strong, tone, muted }: { label: string; value: number; pct?: number; strong?: boolean; tone?: "ok" | "danger"; muted?: boolean }) {
  const color = tone === "ok" ? "var(--ok, var(--accent-2))" : tone === "danger" ? "var(--danger)" : "var(--ink)";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: muted ? "3px 0 3px 14px" : "5px 0" }}>
      <span style={{ fontSize: muted ? "calc(12.5px * var(--scale))" : "calc(13.5px * var(--scale))", color: muted ? "var(--ink-3)" : strong ? "var(--ink)" : "var(--ink-2)", fontWeight: strong ? 700 : 500 }}>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
        {pct !== undefined && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-3)", minWidth: 44, textAlign: "right" }}>{pct.toFixed(1)}%</span>}
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: strong ? 800 : 600, color: muted ? "var(--ink-2)" : color, fontSize: muted ? "calc(13px * var(--scale))" : "calc(14px * var(--scale))", minWidth: 90, textAlign: "right" }}>{money(value)}</span>
      </span>
    </div>
  );
}

const CUSTOM = "__custom__";

function AddModal({ open, onClose, shopId, staff, knownCats, onCreated }: { open: boolean; onClose: () => void; shopId: string; staff: Staff[]; knownCats: string[]; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  // `category` is the selected option; when it's CUSTOM the owner types `customCat`.
  const [f, setF] = useState({ category: "rent", customCat: "", amount: "", date: today(), note: "", staffId: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ category: "rent", customCat: "", amount: "", date: today(), note: "", staffId: "" }); }, [open]);

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
      });
      toast(t("save"), { icon: "check" }); onClose(); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("add_expense")} maxWidth={440}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("category")}>
            <SelectInput value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {knownCats.map((c) => <option key={c} value={c}>{catLabel(c, t)}</option>)}
              <option value={CUSTOM}>+ {t("custom_category")}</option>
            </SelectInput>
          </Field>
          <Field label={t("date")}><TextInput type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        {f.category === CUSTOM && (
          <Field label={t("custom_category")}>
            <TextInput value={f.customCat} onChange={(e) => setF({ ...f, customCat: e.target.value })} placeholder={t("category")} autoFocus />
          </Field>
        )}
        {isSalary && (
          <Field label={t("worker")}>
            <SelectInput value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })}>
              <option value="">—</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectInput>
          </Field>
        )}
        <Field label={t("amount")}><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label={t("notes")}><TextInput value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
