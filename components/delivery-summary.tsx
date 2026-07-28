"use client";
// What a delivery is about to do to a supplier's account, shown before it is saved.
//
// Stock reaches the warehouse three ways — receiving into a variant, adding a product with
// opening stock, and raising a quantity while editing one — and every one of them creates a
// debt. This block is shared by all of them so they say the same thing in the same words; the
// three screens disagreeing about what a delivery means is exactly the confusion to avoid.
import React from "react";
import Link from "next/link";
import { BalanceLine } from "@/app/(owner)/contragents/_account";
import { useLang } from "@/components/providers";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

// One label/amount row.
function Line({ label, value, tone, strong }: { label: string; value: string; tone?: "ok" | "debt"; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <span className={cn(
        "font-mono tabular-nums",
        strong ? "text-[13px] font-extrabold" : "text-[12.5px] font-semibold",
        tone === "ok" ? "text-success" : tone === "debt" ? "text-destructive" : "text-foreground",
      )}>{value}</span>
    </div>
  );
}

export function DeliverySummary({ supplierId, total, paid, balance, className }: {
  supplierId: string;
  total: number;      // what the arriving stock is worth
  paid: number;       // handed over now, already capped at total by the caller
  balance: number;    // what the supplier is owed before this delivery
  className?: string;
}) {
  const { t } = useLang();
  if (!supplierId || total <= 0) return null;
  const owed = Math.max(0, total - paid);
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-[10px] bg-secondary/60 px-3 py-2.5 text-[12px]", className)}>
      <Line label={t("total")} value={money(total)} />
      {paid > 0 && <Line label={t("paid_now")} value={"−" + money(paid)} tone="ok" />}
      <Line label={t("cg_will_owe")} value={money(owed)} tone={owed > 0 ? "debt" : undefined} strong />
      <div className="mt-0.5 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5">
        <span className="text-[11.5px] text-muted-foreground">{t("cg_balance_after")}</span>
        <div className="flex items-center gap-2">
          <BalanceLine balance={balance + owed} />
          <Link href={`/contragents?open=${supplierId}`} className="shrink-0 text-[11.5px] font-semibold text-primary hover:underline">
            {t("cg_open_account")}
          </Link>
        </div>
      </div>
      {owed > 0 && <p className="text-[11px] leading-relaxed text-muted-foreground">{t("cg_credit_note")}</p>}
    </div>
  );
}

// NoSupplierNote says plainly that a priced receipt with nobody named creates no debt. Without
// it the form looks identical whether or not it recorded a purchase.
export function NoSupplierNote({ show }: { show: boolean }) {
  const { t } = useLang();
  if (!show) return null;
  return <p className="text-[11.5px] leading-relaxed text-muted-foreground">{t("cg_no_supplier_note")}</p>;
}
