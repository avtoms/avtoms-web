"use client";
// What an amount was agreed in, shown beside the so'm it became.
//
// The so'm is the number the ledger sums and it never moves: it was worked out when the
// operation was recorded, at that day's rate, and no later rate change reaches back to
// re-price it. What this adds is the sentence behind it — "$250 × 12 750" — so that opening
// a July delivery in September answers the question rather than showing a bare 3 187 500
// nobody can account for.
//
// Renders nothing for an amount typed in so'm, which is every amount until a shop starts
// pricing in something else.
import { useCurrencies, fxLabel } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { FxAmount } from "@/lib/types";

export function FxStamp({ fx, className }: { fx?: FxAmount; className?: string }) {
  const currencies = useCurrencies();
  if (!fx?.currency) return null;
  return (
    <span className={cn("font-mono text-[11px] font-semibold text-muted-foreground", className)}>
      {fxLabel(fx, currencies)}
    </span>
  );
}
