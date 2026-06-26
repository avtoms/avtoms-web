"use client";
// Finances: profit-and-loss for a period (revenue − cost of goods − overhead = net profit)
// plus the overhead-expense ledger with add/delete. Defaults to the current month.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Btn, IconBtn, Modal, Field, TextInput, SelectInput, Spinner, Empty } from "@/components/ui";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";
import type { ShopExpense, ProfitAndLoss } from "@/lib/types";

const CATS = ["rent", "salary", "utilities", "supplies", "tax", "other"] as const;

// First/last instant of a YYYY-MM string, as RFC3339 (UTC noon avoids TZ edge cases).
function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return { from: from.toISOString(), to: to.toISOString() };
}
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const dateStr = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });

export default function FinancesPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [month, setMonth] = useState(currentMonth());
  const [pl, setPl] = useState<ProfitAndLoss | null>(null);
  const [expenses, setExpenses] = useState<ShopExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const range = useMemo(() => monthRange(month), [month]);

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

  const del = async (id: string) => {
    if (busy) return; setBusy(true);
    try { await api.deleteExpense(id); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  const net = pl ? num(pl.netProfit) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ maxWidth: 180, fontFamily: "var(--font-mono)" }} />
        <Btn variant="primary" icon="plus" onClick={() => setAdding(true)}>{t("add_expense")}</Btn>
      </div>

      {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={24} /></div>
        : <>
          {/* P&L summary */}
          <Card pad={0}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", fontWeight: 700, color: "var(--ink)" }}>{t("profit_loss")}</div>
            <div style={{ padding: "8px 18px" }}>
              <PLRow label={t("revenue")} value={num(pl?.revenue)} />
              <PLRow label={t("cost_of_goods")} value={-num(pl?.costOfGoods)} />
              <div style={{ height: 1, background: "var(--line-2)", margin: "6px 0" }} />
              <PLRow label={t("gross_margin")} value={num(pl?.grossMargin)} strong />
              <PLRow label={t("overhead")} value={-num(pl?.overhead)} />
              <div style={{ height: 1, background: "var(--line-2)", margin: "6px 0" }} />
              <PLRow label={t("net_profit")} value={net} strong tone={net >= 0 ? "ok" : "danger"} />
            </div>
            {!!pl?.byCategory?.length && (
              <div style={{ padding: "10px 18px 14px", borderTop: "1px solid var(--line)", display: "flex", flexWrap: "wrap", gap: 8 }}>
                {pl.byCategory.map((b) => (
                  <span key={b.category} style={{ fontSize: 12, color: "var(--ink-2)", background: "var(--surface-2)", padding: "4px 9px", borderRadius: 8 }}>
                    {t("cat_" + b.category)}: <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{money(num(b.amount))}</span>
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* expense ledger */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 4px" }}>{t("expenses")}</div>
            {expenses.length === 0 ? <Card pad={24}><Empty icon="money" text={t("no_expenses")} /></Card>
              : <Card pad={0}>
                {expenses.map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14px * var(--scale))" }}>{t("cat_" + e.category)}{e.note ? <span style={{ fontWeight: 400, color: "var(--ink-3)" }}> · {e.note}</span> : null}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{dateStr(e.incurredOn)}</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: "calc(14px * var(--scale))" }}>{money(num(e.amount))}</div>
                    <IconBtn icon="trash" onClick={() => del(e.id)} />
                  </div>
                ))}
              </Card>}
          </div>
        </>}
      <AddModal open={adding} onClose={() => setAdding(false)} shopId={shopId} onCreated={load} />
    </div>
  );
}

function PLRow({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: "ok" | "danger" }) {
  const color = tone === "ok" ? "var(--ok, var(--accent-2))" : tone === "danger" ? "var(--danger)" : "var(--ink)";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
      <span style={{ fontSize: "calc(13.5px * var(--scale))", color: strong ? "var(--ink)" : "var(--ink-2)", fontWeight: strong ? 700 : 500 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: strong ? 800 : 600, color, fontSize: "calc(14px * var(--scale))" }}>{money(value)}</span>
    </div>
  );
}

function AddModal({ open, onClose, shopId, onCreated }: { open: boolean; onClose: () => void; shopId: string; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const [f, setF] = useState({ category: "rent", amount: "", date: today(), note: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ category: "rent", amount: "", date: today(), note: "" }); }, [open]);

  const save = async () => {
    const amount = parseInt(f.amount, 10) || 0;
    if (amount <= 0 || busy) return;
    setBusy(true);
    try {
      await api.createExpense(shopId, {
        category: f.category, amount,
        incurredOn: new Date(f.date + "T12:00:00").toISOString(), note: f.note.trim(),
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
              {CATS.map((c) => <option key={c} value={c}>{t("cat_" + c)}</option>)}
            </SelectInput>
          </Field>
          <Field label={t("date")}><TextInput type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        <Field label={t("amount")}><TextInput value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} placeholder="0" /></Field>
        <Field label={t("notes")}><TextInput value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
