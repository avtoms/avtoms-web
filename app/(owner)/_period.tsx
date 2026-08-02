"use client";
// The period control shared by Finances and Statistics. It lives here rather than in either
// page because the two show overlapping figures: if their windows could be computed
// differently the same month would quietly produce two different revenues, which is exactly
// the kind of disagreement that makes people stop trusting a dashboard.
import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui-kit/select";
import { Input } from "@/components/ui-kit/input";
import { Button } from "@/components/ui-kit/button";
import { useLang } from "@/components/providers";

export type Gran = "day" | "month" | "quarter" | "year" | "custom";
export type Range = { from: string; to: string };

const isoFrom = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 0, 0, 0)).toISOString();
const isoTo = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 23, 59, 59)).toISOString();

export function monthRange(ym: string): Range {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  return { from: isoFrom(y, m - 1, 1), to: isoTo(y, m, 0) };
}

// One day, on the same UTC boundaries every other window here uses. That matters more than it
// looks: it is what makes thirty-one single days add up to exactly the month above them, so a
// shop checking Tuesday against August never finds a som that belongs to neither.
export function dayRange(ymd: string): Range {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return { from: isoFrom(y, m - 1, d), to: isoTo(y, m - 1, d) };
}
export function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Step a yyyy-mm-dd by whole days, across month and year ends.
export function shiftDay(ymd: string, by: number): string {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const t = new Date(Date.UTC(y, m - 1, d + by));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function lastNMonths(n: number): { ym: string; label: string }[] {
  const out: { ym: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    out.push({
      ym: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: String(d.getUTCMonth() + 1).padStart(2, "0"),
    });
  }
  return out;
}

// usePeriod owns the selection and derives the window from it. Callers render <PeriodPicker>
// with the returned state and pass `range` to the API.
export function usePeriod() {
  const [gran, setGran] = useState<Gran>("month");
  const [day, setDay] = useState(todayYMD());
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [cFrom, setCFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [cTo, setCTo] = useState(currentMonth() + "-28");

  const range = useMemo<Range>(() => {
    if (gran === "day") return dayRange(day);
    if (gran === "month") return monthRange(month);
    if (gran === "quarter") return { from: isoFrom(year, (quarter - 1) * 3, 1), to: isoTo(year, quarter * 3, 0) };
    if (gran === "year") return { from: isoFrom(year, 0, 1), to: isoTo(year, 11, 31) };
    return { from: new Date(cFrom + "T00:00:00Z").toISOString(), to: new Date(cTo + "T23:59:59Z").toISOString() };
  }, [gran, day, month, year, quarter, cFrom, cTo]);

  return { gran, setGran, day, setDay, month, setMonth, year, setYear, quarter, setQuarter, cFrom, setCFrom, cTo, setCTo, range };
}

export type Period = ReturnType<typeof usePeriod>;

function YearSelect({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  const opts = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  return (
    <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
      <SelectTrigger className="max-w-[120px]"><SelectValue /></SelectTrigger>
      <SelectContent>{opts.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
    </Select>
  );
}

// DayNav is the day control: a date field with a step either side and a way back to today.
// The arrows are the point — reading a shop day by day means walking backwards through the
// week, and doing that through a date picker is four taps per day instead of one.
function DayNav({ p }: { p: Period }) {
  const { t } = useLang();
  const isToday = p.day === todayYMD();
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="secondary" size="icon" aria-label={t("per_prev_day")} onClick={() => p.setDay(shiftDay(p.day, -1))}>
        <ChevronLeft />
      </Button>
      <Input type="date" value={p.day} onChange={(e) => e.target.value && p.setDay(e.target.value)} className="max-w-[170px] font-mono" />
      <Button
        variant="secondary"
        size="icon"
        aria-label={t("per_next_day")}
        // There is nothing to show for tomorrow, so the step forward stops at today.
        disabled={isToday}
        onClick={() => p.setDay(shiftDay(p.day, 1))}
      >
        <ChevronRight />
      </Button>
      {!isToday && <Button variant="ghost" size="sm" onClick={() => p.setDay(todayYMD())}>{t("per_today")}</Button>}
    </div>
  );
}

export function PeriodPicker({ p }: { p: Period }) {
  const { t } = useLang();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={p.gran} onValueChange={(v) => p.setGran(v as Gran)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="day">{t("per_gran_day")}</TabsTrigger>
          <TabsTrigger value="month">{t("per_month")}</TabsTrigger>
          <TabsTrigger value="quarter">{t("per_quarter")}</TabsTrigger>
          <TabsTrigger value="year">{t("per_year")}</TabsTrigger>
          <TabsTrigger value="custom">{t("per_custom")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {p.gran === "day" && <DayNav p={p} />}
      {p.gran === "month" && <Input type="month" value={p.month} onChange={(e) => p.setMonth(e.target.value)} className="max-w-[160px] font-mono" />}
      {p.gran === "quarter" && (
        <>
          <Tabs value={String(p.quarter)} onValueChange={(v) => p.setQuarter(parseInt(v, 10))}>
            <TabsList>{[1, 2, 3, 4].map((q) => <TabsTrigger key={q} value={String(q)}>Q{q}</TabsTrigger>)}</TabsList>
          </Tabs>
          <YearSelect year={p.year} setYear={p.setYear} />
        </>
      )}
      {p.gran === "year" && <YearSelect year={p.year} setYear={p.setYear} />}
      {p.gran === "custom" && (
        <>
          <Input type="date" value={p.cFrom} onChange={(e) => p.setCFrom(e.target.value)} className="max-w-[150px]" />
          <span className="text-muted-foreground">—</span>
          <Input type="date" value={p.cTo} onChange={(e) => p.setCTo(e.target.value)} className="max-w-[150px]" />
        </>
      )}
    </div>
  );
}
