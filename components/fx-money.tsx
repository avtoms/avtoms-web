"use client";
// A money field that can be typed in another currency.
//
// The shape of the problem: a shop agrees a delivery at "250 dollar", hands over so'm at
// whatever the dollar was that morning, and has to record both. Before this, only the
// multiplication survived — a bare 3 175 000 that nobody could account for six months on.
//
// So the field keeps the sentence. Pick a currency, type what was agreed, and it shows the
// so'm it becomes before anything is saved. What goes to the server is what was TYPED, and
// the server does the conversion; the so'm on screen here is a preview of that and never
// the thing posted. See lib/currency.ts.
//
// When the currency is so'm — which it is by default, and stays for every shop that never
// touches this — it renders as the plain MoneyInput it has always been, with no rate box
// and no preview. Nothing about the ordinary case gets slower or noisier, and when the
// super admin has published nothing but so'm the currency row is not there at all.
//
// The currency is picked with chips rather than a dropdown, matching the payment-method
// control this sits next to on nearly every form it appears on. Two or three currencies is
// the whole realistic range, and a select for that is both a tap slower and — because the
// app's SelectInput lays out at full width — a control that fights the amount box for the
// row it is in.
import React from "react";
import { Input } from "@/components/ui-kit/input";
import { MoneyInput } from "./catalog-fields";
import { useLang } from "./providers";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BASE_CURRENCY, findCurrency, fxSoum, isForeign, rateToInput, useCurrencies, type FxValue,
} from "@/lib/currency";
import type { Currency } from "@/lib/types";

/**
 * CurrencyPicker is the row of currency chips under an amount.
 *
 * Renders nothing when the super admin has published only so'm: a picker offering one
 * option is a control that asks a question with a single answer.
 */
export function CurrencyPicker({
  value, onChange, currencies, disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  currencies: Currency[];
  disabled?: boolean;
}) {
  if (currencies.length < 2) return null;
  const current = (value || BASE_CURRENCY).toUpperCase();
  return (
    <div className="flex flex-wrap gap-1.5">
      {currencies.map((c) => {
        const on = c.code === current;
        return (
          <button
            key={c.code}
            type="button"
            disabled={disabled}
            onClick={() => onChange(c.code)}
            title={c.name}
            className={cn(
              "inline-flex min-h-9 items-center justify-center gap-1 rounded-[7px] border px-2.5 font-mono text-[12px] font-bold transition-colors",
              on ? "border-primary bg-primary-soft text-primary-emphasis"
                 : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            {c.code}
          </button>
        );
      })}
    </div>
  );
}

/**
 * FxMoneyInput is one amount, in whichever currency it was agreed in.
 *
 * `value` holds the whole state of the field, because the three parts are one fact: an
 * amount without the currency it was typed in is not an amount, and neither is one without
 * the rate it was agreed at.
 *
 * Renders the control only, with no label: the pages that use it are split across two UI
 * kits, so the caller wraps it in whichever Field its own page uses.
 */
export function FxMoneyInput({
  value, onChange, placeholder, disabled, hideHint, currencies: given,
}: {
  value: FxValue;
  onChange: (v: FxValue) => void;
  placeholder?: string;
  disabled?: boolean;
  hideHint?: boolean;
  // Passed in when a form has many of these on it (the product form has two per variant),
  // so the list is fetched once for the form rather than once per field.
  currencies?: Currency[];
}) {
  const { t } = useLang();
  const fetched = useCurrencies();
  const currencies = given ?? fetched;
  const cur = findCurrency(currencies, value.currency);
  const foreign = isForeign(value.currency);

  // The rate box shows the published rate as a placeholder rather than as a value: leaving
  // it alone must mean "whatever the rate is when I save", not "this number, frozen when I
  // opened the form". A shop that dealt at a different rate types over it.
  const published = cur ? rateToInput(cur.rateMicros) : "";
  const soum = fxSoum(value, cur);

  const set = (patch: Partial<FxValue>) => onChange({ ...value, ...patch });

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {foreign ? (
        // Decimals allowed here and nowhere else: so'm has no minor unit, but $250.50 is an
        // ordinary price. The symbol sits in the box so the number is never ambiguous.
        <div className="relative">
          <Input
            value={value.typed}
            disabled={disabled}
            inputMode="decimal"
            placeholder={placeholder ?? "0"}
            onChange={(e) => set({ typed: e.target.value.replace(/[^\d.,]/g, "") })}
            className="pr-10 font-mono tabular-nums"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[13px] font-bold text-muted-foreground">
            {cur?.symbol || value.currency.toUpperCase()}
          </span>
        </div>
      ) : (
        <MoneyInput
          value={value.typed}
          disabled={disabled}
          placeholder={placeholder}
          hideHint={hideHint}
          onChange={(digits) => set({ typed: digits })}
        />
      )}

      <CurrencyPicker
        value={value.currency}
        currencies={currencies}
        disabled={disabled}
        onChange={(code) => {
          // The typed amount is dropped on a currency change on purpose: "250" meant dollars
          // a moment ago and would silently mean 250 so'm now. Nothing is worth carrying over
          // between two different questions.
          set({ currency: code, typed: "", rate: "" });
        }}
      />

      {foreign && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[12px] text-muted-foreground">{t("fx_rate")}</span>
          <Input
            value={value.rate}
            disabled={disabled}
            inputMode="decimal"
            placeholder={published || "0"}
            onChange={(e) => set({ rate: e.target.value.replace(/[^\d.,]/g, "") })}
            className="h-8 w-24 px-2 text-right font-mono text-[12.5px] tabular-nums touch:h-9"
          />
          {/* The whole point of the row: what this is about to become in the ledger. */}
          <span
            className={cn(
              "ml-auto truncate font-mono text-[12.5px] font-bold tabular-nums",
              soum > 0 ? "text-foreground" : "text-muted-foreground",
            )}
          >
            = {money(soum)} {t("soum")}
          </span>
        </div>
      )}
    </div>
  );
}
