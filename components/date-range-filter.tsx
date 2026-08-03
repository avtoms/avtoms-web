"use client";
// "Which orders am I looking at?" — a window over a list, by the day each one came in.
//
// A board is a live queue, so the default is deliberately everything. A car that has been in
// the shop since last Tuesday must not vanish because somebody once looked at today, and the
// choice is not remembered between visits for the same reason: a board that silently hides
// live work is worse than one that shows too much.
//
// The resolved dates are printed beside the chips. "Hafta" could reasonably mean this calendar
// week or the last seven days, and a shop should not have to guess which — it can read it.
import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { useLang } from "@/components/providers";
import {
  dayRange, spanRange, todayYMD, shiftDay, firstOfMonth, rangeLabel, type Range,
} from "@/lib/range";
import { cn } from "@/lib/utils";

export type RangePreset = "all" | "today" | "yesterday" | "week" | "month" | "custom";

const PRESETS: { key: RangePreset; labelKey: string }[] = [
  { key: "all", labelKey: "flt_all" },
  { key: "today", labelKey: "flt_today" },
  { key: "yesterday", labelKey: "flt_yesterday" },
  { key: "week", labelKey: "flt_week" },
  { key: "month", labelKey: "flt_month" },
  { key: "custom", labelKey: "flt_custom" },
];

export function useDateFilter(initial: RangePreset = "all") {
  const [preset, setPreset] = useState<RangePreset>(initial);
  const [from, setFrom] = useState(shiftDay(todayYMD(), -6));
  const [to, setTo] = useState(todayYMD());

  const range = useMemo<Range | null>(() => {
    const today = todayYMD();
    switch (preset) {
      case "today": return dayRange(today);
      case "yesterday": return dayRange(shiftDay(today, -1));
      // Seven days ending today, not the calendar week: a shop asking "what came in this week"
      // on a Monday means the last few days, not the four hours since midnight.
      case "week": return spanRange(shiftDay(today, -6), today);
      case "month": return spanRange(firstOfMonth(today), today);
      case "custom": return spanRange(from, to);
      default: return null;
    }
  }, [preset, from, to]);

  return { preset, setPreset, from, setFrom, to, setTo, range };
}

export type DateFilter = ReturnType<typeof useDateFilter>;

export function DateRangeFilter({ f, total, shown }: {
  f: DateFilter;
  // What the window did to the list. Shown only when it did something, because "42 of 42" is
  // noise — and when it hides everything, saying so beats an empty board with no explanation.
  total?: number;
  shown?: number;
}) {
  const { t } = useLang();
  const filtering = f.preset !== "all";
  const label = rangeLabel(f.range);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => f.setPreset(p.key)}
            aria-pressed={f.preset === p.key}
            className={cn(
              "inline-flex min-h-11 items-center rounded-[9px] border px-3.5 text-[13px] font-semibold transition-colors sm:min-h-9",
              f.preset === p.key
                ? "border-primary bg-primary-soft text-primary-emphasis"
                : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {t(p.labelKey)}
          </button>
        ))}
        {f.preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <Input type="date" value={f.from} onChange={(e) => e.target.value && f.setFrom(e.target.value)} className="max-w-[160px] font-mono" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={f.to} onChange={(e) => e.target.value && f.setTo(e.target.value)} className="max-w-[160px] font-mono" />
          </div>
        )}
        {filtering && (
          <Button variant="ghost" size="sm" onClick={() => f.setPreset("all")}>
            <X /> {t("flt_clear")}
          </Button>
        )}
      </div>
      {filtering && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12px] text-muted-foreground">
          {label && <span className="font-mono">{label}</span>}
          {typeof total === "number" && typeof shown === "number" && (
            <span>
              {shown === 0
                ? t("flt_none")
                : `${shown} / ${total}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
