"use client";
// IncomeBreakdownModal: shows income for a date window split by how it was received —
// cash, card (one line per receiving card, saved or ad-hoc) and other. Opened by clicking
// any income figure (dashboard, finances). Data comes from the reporting payment-methods
// report (api.paymentBreakdown), so it reflects actually-paid invoices.
import React, { useEffect, useState } from "react";
import { CreditCard, Banknote, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui-kit/dialog";
import { Spinner } from "@/components/ui-kit/misc";
import { useLang } from "@/components/providers";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = { method: string; cardId: string; cardLabel: string; cardNumber: string; amount: number; count: number };

export function IncomeBreakdownModal({
  open, onClose, shopId, from, to, title,
}: {
  open: boolean; onClose: () => void; shopId: string; from?: string; to?: string; title?: string;
}) {
  const { t } = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!open) { setRows(null); return; }
    let cancelled = false;
    api.paymentBreakdown(shopId, from, to)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [open, shopId, from, to]);

  const cash = (rows || []).filter((r) => r.method === "cash");
  const card = (rows || []).filter((r) => r.method === "card");
  const other = (rows || []).filter((r) => r.method === "other");
  const sum = (rs: Row[]) => rs.reduce((s, r) => s + r.amount, 0);
  const cnt = (rs: Row[]) => rs.reduce((s, r) => s + r.count, 0);
  const grand = sum(rows || []);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader><DialogTitle>{title || t("income_breakdown")}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          {rows === null ? (
            <div className="flex justify-center py-8"><Spinner className="size-6" /></div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-muted-foreground">{t("no_income")}</div>
          ) : (
            <div className="flex flex-col gap-3 pb-1">
              <div className="flex items-baseline justify-between rounded-[12px] bg-secondary/60 px-4 py-3">
                <span className="text-[13px] font-semibold text-muted-foreground">{t("total_income")}</span>
                <span className="font-mono text-[18px] font-extrabold text-foreground">{money(grand)}</span>
              </div>

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

              {other.length > 0 && (
                <MethodBlock icon={<Wallet className="size-4" />} label={t("pay_other")} amount={sum(other)} count={cnt(other)} share={grand} tCount={t("payments_n")} />
              )}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
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
