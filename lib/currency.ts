"use client";
// The currencies a shop may price in, and the arithmetic for typing an amount in one.
//
// Shops here buy in dollars. A delivery is agreed at "250 dollar", the shop hands over so'm
// at whatever the dollar was that morning, and until now the only way to record it was to
// do the multiplication in your head and type the result. What that loses is not the number
// — it is the sentence: nobody can look at a six-month-old receipt and say what was agreed,
// or at what rate.
//
// So nothing here is stored in another currency. Every amount the backend keeps is still
// so'm; a currency is a way of TYPING one. What travels with it is the stamp — what was
// typed, in which currency, at which rate — and the server does the conversion from that.
//
// Which means the so'm figures computed here are for the screen ONLY: a preview of what the
// server is about to work out. The server never trusts them, and neither should any caller
// that is about to post. See fxPayload.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Currency, FxAmount } from "@/lib/types";

/** The currency the ledger is kept in. Its rate is 1 by definition. */
export const BASE_CURRENCY = "UZS";

const MICROS = 1_000_000;

/** isForeign reports whether an amount typed in this currency needs converting at all. */
export function isForeign(code: string | undefined): boolean {
  const c = (code ?? "").trim().toUpperCase();
  return c !== "" && c !== BASE_CURRENCY;
}

/**
 * toMinor turns what somebody typed into the currency's minor unit.
 *
 *   toMinor("250.50", 2) -> 25050      toMinor("250", 2) -> 25000
 *   toMinor("3175000", 0) -> 3175000   (so'm has no minor unit)
 *
 * Parsed digit by digit rather than through parseFloat: 250.50 * 100 is 25049.999999999996
 * in binary floating point, and this number becomes a cost basis.
 */
export function toMinor(typed: string, minorUnits: number): number {
  const s = (typed ?? "").replace(",", ".").replace(/[^\d.]/g, "");
  if (s === "") return 0;
  const [whole, frac = ""] = s.split(".");
  const scale = Math.max(0, Math.min(6, minorUnits));
  const padded = (frac + "0".repeat(scale)).slice(0, scale);
  // Rounds rather than truncates on the digit past the minor unit, so 250.999 at 2 places
  // is 25100 and not 25099.
  const round = scale < frac.length && Number(frac[scale]) >= 5 ? 1 : 0;
  return Number(whole || "0") * 10 ** scale + Number(padded || "0") + round;
}

/** fromMinor is toMinor's inverse, for putting a stored amount back in the box. */
export function fromMinor(minor: number, minorUnits: number): string {
  const scale = Math.max(0, Math.min(6, minorUnits));
  if (scale === 0) return String(Math.round(minor));
  const s = String(Math.abs(Math.round(minor))).padStart(scale + 1, "0");
  const out = s.slice(0, -scale) + "." + s.slice(-scale);
  return (minor < 0 ? "-" : "") + out.replace(/\.?0+$/, "");
}

/** rateToInput renders a stored micro-rate for a rate box: 12700000000 -> "12700". */
export function rateToInput(rateMicros: number | string): string {
  const n = Number(rateMicros) || 0;
  return n <= 0 ? "" : String(Math.round((n / MICROS) * 1e6) / 1e6);
}

/** inputToRate is rateToInput's inverse: "12700" -> 12700000000. */
export function inputToRate(typed: string): number {
  const n = parseFloat((typed ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * MICROS) : 0;
}

/**
 * previewSoum is what the server will store, worked out here so the form can show it.
 *
 * Deliberately NOT the number that gets posted — see the note at the top of this file. It
 * exists so a shop typing "$250" can see "3 175 000 so'm" before it commits, and so a
 * running total on the same form (quantity × cost) has something to add up.
 */
export function previewSoum(amountMinor: number, rateMicros: number, minorUnits: number): number {
  if (!amountMinor || rateMicros <= 0) return 0;
  const scale = Math.max(0, Math.min(6, minorUnits));
  return Math.round((amountMinor * rateMicros) / (10 ** scale * MICROS));
}

/**
 * FxValue is a money field's whole state: which currency it is being typed in, what has
 * been typed, and at what rate.
 *
 * `typed` is the amount as entered — "250.50" in dollars, "3175000" in so'm — because the
 * box has to show back exactly what somebody put in it. Everything else is derived.
 */
export interface FxValue {
  currency: string;
  typed: string;
  rate: string; // so'm per whole unit, as typed; empty means "use the published rate"
}

export const emptyFx = (currency = BASE_CURRENCY): FxValue => ({ currency, typed: "", rate: "" });

/**
 * fxSoum is the so'm preview for a field's current state.
 *
 * A so'm field is not a conversion: what was typed IS the number, and it is returned
 * untouched rather than round-tripped through a rate of 1.
 */
export function fxSoum(v: FxValue, cur: Currency | undefined): number {
  if (!isForeign(v.currency)) return Number((v.typed ?? "").replace(/\D/g, "")) || 0;
  if (!cur) return 0;
  const rate = inputToRate(v.rate) || Number(cur.rateMicros) || 0;
  return previewSoum(toMinor(v.typed, cur.minorUnits), rate, cur.minorUnits);
}

/**
 * fxPayload is the stamp to send, or undefined when the amount was typed in so'm.
 *
 * Undefined is the important half: it is what every so'm amount sends, and it leaves the
 * request looking exactly as it always did. Only a foreign amount carries a stamp, and the
 * server converts from that rather than from anything computed on this side.
 */
export function fxPayload(v: FxValue, cur: Currency | undefined): FxAmount | undefined {
  if (!isForeign(v.currency)) return undefined;
  // Deliberately does NOT require the currency list to have loaded. A form reopened on a
  // product priced in dollars can be saved before the list arrives, and bailing out here
  // would drop the stamp and post the so'm preview instead — which is zero without a rate
  // to work it out from. The server holds the real list; sending it the stamp is always
  // the right answer.
  const amountMinor = toMinor(v.typed, cur?.minorUnits ?? 2);
  if (amountMinor <= 0) return undefined;
  return {
    currency: (cur?.code ?? v.currency).trim().toUpperCase(),
    amountMinor: String(amountMinor),
    // The rate the shop actually dealt at, falling back to the published one when the box
    // was left alone. Dollars are bought at the bazaar, not at the official rate. Zero is a
    // valid answer and means "use whatever is published at the moment I save".
    rateMicros: String(inputToRate(v.rate) || Number(cur?.rateMicros) || 0),
  };
}

// Shared briefly between components: several money fields can be on screen at once — the
// product form has one per variant — and each fetching the list separately would be a
// request per field. Short, because a rate the super admin has just moved should reach an
// open form without a reload.
const TTL_MS = 60_000;
let cache: { at: number; items: Currency[] } | null = null;
let inflight: Promise<Currency[]> | null = null;

function load(): Promise<Currency[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.items);
  if (!inflight) {
    inflight = api
      .listCurrencies()
      .then((items) => {
        cache = { at: Date.now(), items };
        return items;
      })
      // A failed fetch must never empty a picker that is already on screen and must never
      // break the form it sits in: so'm still works with no list at all.
      .catch(() => cache?.items ?? [])
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/**
 * useCurrencies returns the currencies this shop may price in, base first.
 *
 * Only ever the ones the super admin has switched on: a currency with no rate behind it
 * would convert everything typed in it to zero, so it is not offered at all.
 */
export function useCurrencies(): Currency[] {
  const [items, setItems] = useState<Currency[]>(() => cache?.items ?? []);
  useEffect(() => {
    let alive = true;
    void load().then((x) => { if (alive) setItems(x); });
    return () => { alive = false; };
  }, []);
  return items;
}

/**
 * minorUnitsOf is how many decimal places a currency has, for a code that may no longer be
 * on the list. Two is the safe guess: it is what every currency a shop here deals in uses,
 * and it keeps an old row readable after a currency has been retired.
 */
export function minorUnitsOf(list: Currency[], code: string | undefined): number {
  return findCurrency(list, code)?.minorUnits ?? 2;
}

/** findCurrency resolves a code against a list, tolerating case and stray whitespace. */
export function findCurrency(list: Currency[], code: string | undefined): Currency | undefined {
  const c = (code ?? "").trim().toUpperCase();
  return list.find((x) => x.code === c);
}

/**
 * fxLabel renders a stored stamp the way it was agreed: "$250 × 12 700".
 *
 * The symbol and the decimal places come from the currency list rather than from the row,
 * so a currency the super admin later renames reads correctly on old receipts too. A code
 * that has since been removed from the list still renders — with its code instead of a
 * symbol — because a receipt must not stop explaining itself when a currency is retired.
 */
export function fxLabel(fx: FxAmount | undefined, list: Currency[]): string {
  if (!fx?.currency) return "";
  const cur = findCurrency(list, fx.currency);
  const amount = fromMinor(Number(fx.amountMinor) || 0, cur?.minorUnits ?? 2);
  const unit = cur?.symbol || fx.currency;
  const rate = rateToInput(fx.rateMicros);
  const pretty = Number(amount).toLocaleString("ru-RU").replace(/,/g, " ");
  const prettyRate = (Number(rate) || 0).toLocaleString("ru-RU").replace(/,/g, " ");
  return rate ? `${unit}${pretty} × ${prettyRate}` : `${unit}${pretty}`;
}
