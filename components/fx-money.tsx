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
// and no preview. Nothing about the ordinary case gets slower or noisier.
import React from "react";
import { SelectInput, TextInput } from "./ui";
import { MoneyInput } from "./catalog-fields";
import { useLang } from "./providers";
import { money } from "@/lib/format";
import {
  BASE_CURRENCY, findCurrency, fxSoum, isForeign, rateToInput, useCurrencies, type FxValue,
} from "@/lib/currency";
import type { Currency } from "@/lib/types";

/**
 * CurrencyPicker is the small code dropdown that sits beside an amount.
 *
 * Hidden entirely when the super admin has published nothing but so'm: a picker with one
 * option in it is a control that asks a question with only one answer.
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
  return (
    <SelectInput
      value={value || BASE_CURRENCY}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: 84, padding: "11px 4px 11px 9px", fontFamily: "var(--font-mono)", fontSize: 13 }}
    >
      {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
    </SelectInput>
  );
}

/**
 * FxMoneyInput is one amount, in whichever currency it was agreed in.
 *
 * `value` holds the whole state of the field, because the three parts are one fact: an
 * amount without the currency it was typed in is not an amount, and neither is one without
 * the rate it was agreed at.
 */
// Renders the control only, with no label: the pages that use it are split across two UI
// kits, so the caller wraps it in whichever Field its own page uses.
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

  const picker = (
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
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {foreign ? (
            // Decimals allowed here and nowhere else: so'm has no minor unit, but $250.50
            // is an ordinary price.
            <TextInput
              value={value.typed}
              disabled={disabled}
              inputMode="decimal"
              placeholder={placeholder ?? "0"}
              onChange={(e) => set({ typed: e.target.value.replace(/[^\d.,]/g, "") })}
              style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}
            />
          ) : (
            <MoneyInput
              value={value.typed}
              disabled={disabled}
              placeholder={placeholder}
              hideHint={hideHint}
              onChange={(digits) => set({ typed: digits })}
            />
          )}
        </div>
        {picker}
      </div>

      {foreign && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{t("fx_rate")}</span>
          <TextInput
            value={value.rate}
            disabled={disabled}
            inputMode="decimal"
            placeholder={published || "0"}
            onChange={(e) => set({ rate: e.target.value.replace(/[^\d.,]/g, "") })}
            style={{ width: 110, padding: "7px 9px", fontSize: 13, fontFamily: "var(--font-mono)", textAlign: "right" }}
          />
          {/* The whole point of the row: what this is about to become in the ledger. */}
          <span
            style={{
              flex: 1, textAlign: "right", fontSize: 12.5, fontWeight: 700, color: soum > 0 ? "var(--ink-2)" : "var(--ink-3)",
              fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            = {money(soum)} {t("soum")}
          </span>
        </div>
      )}
    </div>
  );
}
