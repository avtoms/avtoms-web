"use client";
// Income broken down by how it was received — cash, card (one line per receiving card,
// saved or ad-hoc) and other. Data comes from the reporting payment-methods report
// (api.paymentBreakdown), so it reflects actually-paid invoices.
//
// Exposed two ways: <IncomeBreakdownPanel> renders inline (a standalone statistics card),
// and <IncomeBreakdownModal> wraps the same panel in a dialog (opened by clicking an
// income figure). Both take the same shop + date window.
import React, { useEffect, useState } from "react";
import { CreditCard, Banknote, Wallet, Wrench, ShoppingCart, HandCoins, Landmark } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui-kit/dialog";
import { Spinner } from "@/components/ui-kit/misc";
import { useLang } from "@/components/providers";
import { api } from "@/lib/api";
import { money, num } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = { method: string; cardId: string; cardLabel: string; cardNumber: string; amount: number; count: number };

// IncomeBreakdownPanel renders the breakdown inline (no dialog chrome). Use inside a Card
// for a standalone statistics section, or inside the modal below.
export function IncomeBreakdownPanel({ shopId, from, to, showTotal = true }: { shopId: string; from?: string; to?: string; showTotal?: boolean }) {
  const { t } = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    api.paymentBreakdown(shopId, from, to)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [shopId, from, to]);

  // Two independent answers, from two services. The source split comes from the workorder
  // service and the method split is projected from invoice payments, so neither waiting nor
  // failing may take the other down with it — hence the source panel sits outside these
  // early returns rather than inside the block they guard.
  const loading = rows === null;
  const empty = rows !== null && rows.length === 0;

  const cash = (rows ?? []).filter((r) => r.method === "cash");
  const card = (rows ?? []).filter((r) => r.method === "card");
  const other = (rows ?? []).filter((r) => r.method === "other");
  // Money that arrived by bank transfer. Real income like cash and card, but it is in the
  // account rather than the till, so it gets its own line instead of being folded into
  // "other" — a shop counting the drawer must not be sent looking for it there.
  const transfer = (rows ?? []).filter((r) => r.method === "transfer");
  // Nasiya has its own bucket in the projection. Without a block for it the money would be
  // in the total and in no line, and the percentages would stop adding up.
  const credit = (rows ?? []).filter((r) => r.method === "credit");
  const sum = (rs: Row[]) => rs.reduce((s, r) => s + r.amount, 0);
  const cnt = (rs: Row[]) => rs.reduce((s, r) => s + r.count, 0);
  const grand = sum(rows ?? []);

  return (
    <div className="flex flex-col gap-3">
      {/* Where the money came from, before how it arrived. "We took 12m" is one number; "9m
          of it was orders and 3m was the counter" is the one that tells you what the shop is
          actually doing, and it was only ever visible as a footnote on the statistics page. */}
      <IncomeSourcePanel shopId={shopId} from={from} to={to} />

      <div className="mt-1 flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-3 px-0.5">
          <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-muted-foreground">{t("income_by_method")}</span>
          {showTotal && grand > 0 && <span className="font-mono text-[14px] font-extrabold text-foreground">{money(grand)}</span>}
        </div>
        <p className="px-0.5 pb-0.5 text-[11px] leading-snug text-muted-foreground">{t("collected_note")}</p>
      </div>

      {loading && <div className="flex justify-center py-6"><Spinner className="size-6" /></div>}
      {empty && <div className="py-6 text-center text-[13px] text-muted-foreground">{t("no_income")}</div>}

      {cash.length > 0 && (
        <MethodBlock icon={<Banknote className="size-4" />} label={t("pay_cash")} amount={sum(cash)} count={cnt(cash)} share={grand} tCount={t("payments_n")} />
      )}

      {card.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <MethodBlock icon={<CreditCard className="size-4" />} label={t("pay_card")} amount={sum(card)} count={cnt(card)} share={grand} tCount={t("payments_n")} />
          <div className="flex flex-col gap-1 pl-2">
            {card.map((r, i) => (
              <div key={r.cardId || r.cardNumber || i} className="flex items-center gap-2.5 rounded-[9px] border border-border bg-card px-3 py-2">
                <CreditCard className="size-3.5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  {r.cardLabel && <div className="truncate text-[12.5px] font-semibold">{r.cardLabel}</div>}
                  <div className="truncate font-mono text-[12px] text-muted-foreground">{r.cardNumber || t("other_card")}</div>
                </div>
                <span className="font-mono text-[13px] font-bold text-foreground">{money(r.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {transfer.length > 0 && (
        <MethodBlock icon={<Landmark className="size-4" />} label={t("pay_transfer")} amount={sum(transfer)} count={cnt(transfer)} share={grand} tCount={t("payments_n")} />
      )}

      {other.length > 0 && (
        <MethodBlock icon={<Wallet className="size-4" />} label={t("pay_other")} amount={sum(other)} count={cnt(other)} share={grand} tCount={t("payments_n")} />
      )}

      {/* Billed, not banked. Shown in the same list because it is part of what was charged,
          and labelled so nobody reads it as cash in the drawer. */}
      {credit.length > 0 && (
        <MethodBlock icon={<HandCoins className="size-4" />} label={`${t("pay_credit")} · ${t("not_collected_yet")}`}
          amount={sum(credit)} count={cnt(credit)} share={grand} tCount={t("payments_n")} />
      )}
    </div>
  );
}

export function IncomeBreakdownModal({
  open, onClose, shopId, from, to, title,
}: {
  open: boolean; onClose: () => void; shopId: string; from?: string; to?: string; title?: string;
}) {
  const { t } = useLang();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader><DialogTitle>{title || t("income_breakdown")}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          {open && <IncomeBreakdownPanel shopId={shopId} from={from} to={to} />}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// IncomeSourcePanel splits the window's revenue into work orders and counter sales, and
// says how much of it was billed rather than collected.
//
// It reads the statistics endpoint rather than the payment breakdown, because the split by
// source is something only the workorder service can answer — it owns both sides — while the
// breakdown by method is projected from invoice payments and knows nothing about which kind
// of trade produced them.
export function IncomeSourcePanel({ shopId, from, to }: { shopId: string; from?: string; to?: string }) {
  const { t } = useLang();
  const [st, setSt] = useState<{ orders: number; sales: number; orderCount: number; saleCount: number; credit: number; debt: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSt(null);
    api.getStatistics(shopId, from, to)
      .then((r) => {
        if (cancelled) return;
        setSt({
          orders: num(r.orderRevenue), sales: num(r.salesRevenue),
          orderCount: r.orderCount ?? 0, saleCount: r.saleCount ?? 0,
          credit: num(r.creditRevenue), debt: num(r.clientDebt),
        });
      })
      .catch(() => { if (!cancelled) setSt(null); });
    return () => { cancelled = true; };
  }, [shopId, from, to]);

  if (!st) return null;
  const total = st.orders + st.sales;
  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-muted-foreground">{t("income_by_source")}</span>
        {/* Its own total. Without one this section sat under the payment-method total and
            looked like it contradicted it — the two count different things. */}
        <span className="font-mono text-[14px] font-extrabold text-foreground">{money(total)}</span>
      </div>
      <p className="px-0.5 pb-0.5 text-[11px] leading-snug text-muted-foreground">{t("billed_note")}</p>
      <MethodBlock icon={<Wrench className="size-4" />} label={t("from_orders")} amount={st.orders}
        count={st.orderCount} share={total} tCount={t("orders_n")} />
      <MethodBlock icon={<ShoppingCart className="size-4" />} label={t("from_sales")} amount={st.sales}
        count={st.saleCount} share={total} tCount={t("sales_n")} />

      {/* Two different questions, and they must not be confused for one another.
          "Sold on credit" is part of THIS window's trading: it is history and never moves,
          however much the client later pays. "Still owed" is live and drops with every
          repayment. Showing the first under the second's label made a repayment look as
          though it had changed nothing. */}
      {(st.credit > 0 || st.debt > 0) && (
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-warning/40 bg-warning-soft px-3.5 py-2.5">
          {st.credit > 0 && (
            <div className="flex items-center gap-2.5">
              <HandCoins className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-foreground">{t("sold_on_credit")}</div>
                <div className="text-[11.5px] text-muted-foreground">{t("in_this_period")}</div>
              </div>
              <span className="shrink-0 font-mono text-[14px] font-extrabold text-foreground">{money(st.credit)}</span>
            </div>
          )}
          {st.debt > 0 && (
            <div className={cn("flex items-center gap-2.5", st.credit > 0 && "border-t border-warning/30 pt-1.5")}>
              <Wallet className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-foreground">{t("not_collected_yet")}</div>
                <div className="text-[11.5px] text-muted-foreground">{t("cl_debts")} · {t("cg_all_time")}</div>
              </div>
              <span className="shrink-0 font-mono text-[14px] font-extrabold text-destructive">{money(st.debt)}</span>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function MethodBlock({ icon, label, amount, count, share, tCount }: { icon: React.ReactNode; label: string; amount: number; count: number; share: number; tCount: string }) {
  const pct = share > 0 ? Math.round((amount / share) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2.5">
        <div className="grid size-8 place-items-center rounded-[9px] bg-secondary text-muted-foreground">{icon}</div>
        <span className="text-[14px] font-semibold text-foreground">{label}</span>
        <span className="ml-auto font-mono text-[15px] font-extrabold text-foreground">{money(amount)}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className={cn("h-full rounded-full bg-primary")} style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-[11.5px] text-muted-foreground">{pct}% · {count} {tCount}</span>
      </div>
    </div>
  );
}
