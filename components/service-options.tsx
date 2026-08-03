"use client";
// A price-list service can be performed several ways, at several prices — an oil change is the
// same job on a hatchback and on a jeep and a different amount of money.
//
// Two things live here rather than in either screen that needs them: what a service costs when
// its options carry the prices, and the picker that turns "add this service" into "add this
// service, this way". Both are used by the price list and by the order it is sold on, and a
// pricing rule with two implementations is a pricing rule that will eventually disagree.
import React from "react";
import { money, num } from "@/lib/format";
import { useLang } from "@/components/providers";
import { cn } from "@/lib/utils";
import type { MenuItem, MenuItemOption } from "@/lib/types";

// Retired options are filtered out everywhere: they exist so past orders still name what they
// sold, not so they can be sold again.
export const activeOptions = (m: MenuItem): MenuItemOption[] =>
  (m.options ?? []).filter((o) => o.active !== false);

// What a service costs. With options that is a range — and the honest way to write one price
// that is really several is "from 250 000", not a single number that is true for one car.
export function priceLabel(m: MenuItem, t: (k: string) => string): string {
  const opts = activeOptions(m);
  if (opts.length === 0) return money(m.defaultPrice);
  const prices = opts.map((o) => num(o.price));
  const lo = Math.min(...prices), hi = Math.max(...prices);
  return lo === hi ? money(lo) : `${money(lo)} — ${money(hi)}`;
}

export const optionName = (m: MenuItem, o: MenuItemOption, serviceName: string) =>
  `${serviceName} · ${o.name}`;

// ServicePicker lists the shop's services to add one to an order. A service with no options is
// one row and one tap, exactly as before. A service with options shows them underneath: the
// service itself is not tappable, because with options there is no single price to add — the
// option IS the price, and offering the service alone would sell at a number nobody set.
export function ServicePicker({
  items, nameOf, disabled, onPick,
}: {
  items: MenuItem[];
  nameOf: (m: MenuItem) => string;
  disabled?: boolean;
  onPick: (m: MenuItem, option?: MenuItemOption) => void;
}) {
  const { t } = useLang();
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((m) => {
        const opts = activeOptions(m);
        if (opts.length === 0) {
          return (
            <button
              key={m.id}
              disabled={disabled}
              onClick={() => onPick(m)}
              className="flex min-h-11 items-center justify-between gap-2 rounded-[9px] border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-secondary"
            >
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-foreground">{nameOf(m)}</span>
              <span className="shrink-0 font-mono text-[14px] font-bold text-ink-2">{money(m.defaultPrice)}</span>
            </button>
          );
        }
        return (
          <div key={m.id} className="overflow-hidden rounded-[9px] border border-border bg-card">
            <div className="flex items-center justify-between gap-2 bg-secondary/40 px-3.5 py-2">
              <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-foreground">{nameOf(m)}</span>
              <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground">{priceLabel(m, t)}</span>
            </div>
            {opts.map((o) => (
              <button
                key={o.id ?? o.name}
                disabled={disabled}
                onClick={() => onPick(m, o)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-2 border-t border-border/70 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">{o.name}</span>
                <span className="shrink-0 font-mono text-[13.5px] font-bold text-ink-2">{money(o.price)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
