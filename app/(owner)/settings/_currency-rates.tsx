"use client";
// The shop's own exchange rates, and the history of what they have been.
//
// The super admin publishes a rate for the country; this shop deals at whatever it actually
// bought dollars at that week. Those are not the same number, and before this the only
// place to say so was the individual receipt — retyping the same correction onto every
// delivery, expense and repayment, and getting it wrong on the one somebody was rushing.
//
// So the rate is a setting here. Leave a row empty and the shop simply uses the published
// rate, which is what every shop does until it says otherwise.
//
// The history below each row is deliberately BOTH this shop's changes and the platform's:
// the question it exists to answer is "what rate was in force when this was costed", and a
// shop that has never overridden anything would otherwise be shown an empty list while its
// receipts were priced at rates it could not see.
import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { Card } from "@/components/ui-kit/card";
import { Input } from "@/components/ui-kit/input";
import { Button } from "@/components/ui-kit/button";
import { Badge } from "@/components/ui-kit/badge";
import { Spinner } from "@/components/ui-kit/misc";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { BASE_CURRENCY, inputToRate, rateToInput } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { Currency, CurrencyRateChange } from "@/lib/types";
import { SecTitle } from "../_shared";

function RateRow({ currency, onSaved }: { currency: Currency; onSaved: () => void }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  // Seeded from the shop's OWN rate, not the effective one: an empty box has to mean "I use
  // the published rate", and pre-filling it with the platform's number would turn every
  // shop into an overriding shop the first time somebody hit save.
  const [rate, setRate] = useState(rateToInput(currency.shopRateMicros ?? 0));
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<CurrencyRateChange[] | null>(null);

  const platform = rateToInput(currency.rateMicros);
  const own = inputToRate(rate);
  const dirty = own !== (Number(currency.shopRateMicros) || 0);

  const save = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    try {
      await api.setShopCurrencyRate(currency.code, own);
      toast(t("save"), { icon: "check" });
      setHistory(null); // a moved rate is a new history row
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && history === null) {
      try { setHistory(await api.listCurrencyRateHistory(currency.code)); }
      catch { setHistory([]); }
    }
  };

  const when = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ");
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border/60 pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={own > 0 ? "accent" : "neutral"} className="w-14 justify-center font-mono">
          {currency.code}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{currency.name}</span>
        <Input
          value={rate}
          inputMode="decimal"
          // The published rate as the placeholder, so an empty box reads as "using the
          // platform's 12 700" rather than as a rate of nothing.
          placeholder={platform || "0"}
          onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, ""))}
          className="w-28 text-right font-mono tabular-nums"
        />
        <Button variant={dirty ? "default" : "soft"} size="sm" disabled={!dirty || busy} onClick={save}>
          {busy ? <Spinner /> : t("save")}
        </Button>
        <Button variant="ghost" size="sm" onClick={toggle} title={t("cur_history")}>
          <History />
        </Button>
      </div>

      <div className="text-[11.5px] text-muted-foreground">
        {own > 0
          ? `${t("cur_using_own")} · ${t("cur_platform_is")} ${platform || "—"}`
          : t("cur_using_platform")}
      </div>

      {open && (
        <div className="rounded-[9px] bg-secondary/40 p-2.5">
          {history === null ? <Spinner /> : history.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">{t("cur_no_history")}</div>
          ) : (
            <ul className="flex flex-col gap-1">
              {history.map((h) => (
                <li key={h.id} className="flex items-baseline gap-2 font-mono text-[12px]">
                  <span className="text-muted-foreground">{when(h.changedAt)}</span>
                  {/* Whose change this was. Without the label the two histories read as one
                      list of contradictory numbers. */}
                  <span className={cn("shrink-0 rounded px-1 text-[10.5px] font-bold not-italic",
                    h.shopId ? "bg-primary-soft text-primary-emphasis" : "bg-border text-muted-foreground")}>
                    {h.shopId ? t("cur_scope_shop") : t("cur_scope_platform")}
                  </span>
                  <span className="text-muted-foreground">{rateToInput(h.oldRateMicros) || "—"}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-bold">{rateToInput(h.newRateMicros) || t("cur_cleared")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * CurrencyRates is the settings card.
 *
 * Renders nothing at all when the super admin has published only so'm: there is no rate to
 * hold an opinion about, and an empty card is a question the shop cannot answer.
 */
export function CurrencyRates({ span }: { span?: boolean }) {
  const { t } = useLang();
  const [items, setItems] = useState<Currency[] | null>(null);

  const load = useCallback(() => {
    api.listCurrencies()
      .then((cs) => setItems(cs.filter((c) => c.code !== BASE_CURRENCY)))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (items !== null && items.length === 0) return null;

  return (
    <Card className="p-5" style={span ? { gridColumn: "span 2" } : undefined}>
      <SecTitle>{t("cur_rates")}</SecTitle>
      <div className="mb-3 text-[12px] text-muted-foreground">{t("cur_rates_hint")}</div>
      {items === null ? (
        <div className="flex justify-center py-6 text-muted-foreground"><Spinner className="size-5" /></div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((c) => <RateRow key={c.code} currency={c} onSaved={load} />)}
        </div>
      )}
    </Card>
  );
}
