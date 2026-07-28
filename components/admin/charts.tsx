"use client";
// Themed, accessible chart primitives built on Recharts. Colours come from the validated
// categorical palette (CSS vars --chart-1..3) or a single brand hue; every multi-series chart
// ships a legend + direct labels so identity is never colour-alone (dataviz rules). Recessive
// axes/grid, thin marks, 4px rounded data-ends, per-mark hover tooltip.
import * as React from "react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui-kit/card";

export function ChartCard({
  title, subtitle, icon, action, children, className,
}: { title: string; subtitle?: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{icon}{title}</CardTitle>
          {subtitle && <div className="mt-0.5 text-[12.5px] font-medium text-muted-foreground">{subtitle}</div>}
        </div>
        {action}
      </CardHeader>
      <div className="p-5">{children}</div>
    </Card>
  );
}

function EmptyChart({ text = "Ma'lumot yo'q" }: { text?: string }) {
  return <div className="grid h-[180px] place-items-center text-[13px] text-muted-foreground">{text}</div>;
}

// ── Custom tooltip ──
function TipBox({ active, payload, unit, formatter }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const name = p.payload?.label ?? p.name;
  const val = formatter ? formatter(p.value) : p.value.toLocaleString("ru-RU");
  return (
    <div className="admin-portal rounded-[9px] border border-border bg-card px-3 py-2 shadow-[var(--shadow-lg)]">
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-[3px]" style={{ background: p.payload?.color || p.color || "var(--accent)" }} />
        <span className="text-[12.5px] font-semibold text-foreground">{name}</span>
      </div>
      <div className="mt-0.5 pl-4 font-mono text-[13px] font-bold text-foreground">
        {val}{unit ? <span className="ml-1 text-[11px] font-medium text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  );
}

export type Slice = { key: string; label: string; value: number; color: string };

// ── Donut: categorical identity, ≤ 4 slices. Legend + centre total = secondary encoding. ──
export function DonutChart({
  data, centerValue, centerLabel, unit, formatter,
}: { data: Slice[]; centerValue: React.ReactNode; centerLabel: string; unit?: string; formatter?: (v: number) => string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <EmptyChart />;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div className="relative h-[168px] w-[168px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={54} outerRadius={80} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
              {data.map((d) => <Cell key={d.key} fill={d.color} />)}
            </Pie>
            <Tooltip content={<TipBox unit={unit} formatter={formatter} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[26px] font-extrabold leading-none tracking-[-0.03em] text-foreground">{centerValue}</div>
          <div className="mt-1 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{centerLabel}</div>
        </div>
      </div>
      <div className="flex w-full flex-col gap-2">
        {data.map((d) => (
          <div key={d.key} className="flex items-center gap-2.5">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />
            <span className="flex-1 truncate text-[13px] font-medium text-foreground">{d.label}</span>
            <span className="font-mono text-[13px] font-bold text-foreground">{formatter ? formatter(d.value) : d.value}</span>
            <span className="w-10 text-right font-mono text-[12px] text-muted-foreground">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type BarDatum = { label: string; value: number; color?: string };

// ── Horizontal bars: magnitude across categories, single hue, direct value labels. ──
export function HBarChart({
  data, color = "var(--accent)", unit, formatter, height,
}: { data: BarDatum[]; color?: string; unit?: string; formatter?: (v: number) => string; height?: number }) {
  if (!data.length || data.every((d) => d.value === 0)) return <EmptyChart />;
  const h = height ?? Math.max(140, data.length * 44 + 8);
  const fmt = formatter ?? ((v: number) => v.toLocaleString("ru-RU"));
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 56, bottom: 2, left: 4 }} barCategoryGap={10}>
        <XAxis type="number" hide />
        <YAxis
          type="category" dataKey="label" width={116} tickLine={false} axisLine={false}
          tick={{ fill: "var(--ink-2)", fontSize: 12.5, fontWeight: 600 }}
        />
        <Tooltip cursor={{ fill: "var(--chart-track)" }} content={<TipBox unit={unit} formatter={fmt} />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} background={{ fill: "var(--chart-track)", radius: 4 } as any}>
          {data.map((d, i) => <Cell key={i} fill={d.color || color} />)}
          <LabelList dataKey="value" position="right" formatter={fmt} style={{ fill: "var(--ink-2)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export type TrendSeries = { key: string; label: string; color: string };
export type TrendPoint = { label: string } & Record<string, number | string>;

// TrendTip is the crosshair tooltip: every series at the hovered point, so two lines can be
// compared where the reader is looking rather than by eye across the plot.
function TrendTip({ active, payload, label, series, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="admin-portal min-w-[150px] rounded-[9px] border border-border bg-card px-3 py-2 shadow-[var(--shadow-lg)]">
      <div className="mb-1 text-[12px] font-semibold text-muted-foreground">{label}</div>
      {series.map((sr: TrendSeries) => {
        const p = payload.find((x: any) => x.dataKey === sr.key);
        if (!p) return null;
        return (
          <div key={sr.key} className="flex items-center gap-2 py-[1px]">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: sr.color }} />
            <span className="flex-1 text-[12.5px] text-ink-2">{sr.label}</span>
            <span className="font-mono text-[12.5px] font-bold text-foreground">{formatter ? formatter(p.value) : p.value}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Trend over time: one or two series on ONE axis. Two are only ever plotted together when
// they share a unit (money against money) — a second scale would invent a relationship the
// data does not have. A single series gets a soft area fill; two are drawn as lines, which
// stay readable across a month of days where sixty grouped bars would not. The legend above
// carries identity, so colour is never the only cue, and the crosshair reads every series at
// the hovered day rather than making the eye travel. ──
export function TrendChart({
  data, series, formatter, height = 220,
}: { data: TrendPoint[]; series: TrendSeries[]; formatter?: (v: number) => string; height?: number }) {
  if (!data.length) return <EmptyChart />;
  const single = series.length === 1;
  return (
    <div className="flex flex-col gap-3">
      {!single && (
        <div className="flex flex-wrap items-center gap-4">
          {series.map((sr) => (
            <span key={sr.key} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
              <span className="size-2.5 rounded-[3px]" style={{ background: sr.color }} />{sr.label}
            </span>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series[0].color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={series[0].color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-track)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18}
            tick={{ fill: "var(--ink-3)", fontSize: 11.5 }} />
          <YAxis tickLine={false} axisLine={false} width={54} tick={{ fill: "var(--ink-3)", fontSize: 11 }}
            tickFormatter={(v: number) => (v >= 1000000 ? `${Math.round(v / 100000) / 10}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <Tooltip cursor={{ stroke: "var(--ink-3)", strokeWidth: 1, strokeDasharray: "3 3" }}
            content={<TrendTip series={series} formatter={formatter} />} />
          {single ? (
            <Area type="monotone" dataKey={series[0].key} stroke={series[0].color} strokeWidth={2}
              fill="url(#trendFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
          ) : series.map((sr) => (
            <Line key={sr.key} type="monotone" dataKey={sr.key} stroke={sr.color} strokeWidth={2}
              dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── RankRow: a table row that is also its own bar. For "top N" lists, where the reader wants
// the name and the number first and the shape second — a chart beside a table would say the
// same thing twice. ──
export function RankRow({
  name, sub, value, share, right, color = "var(--chart-1)",
}: { name: string; sub?: string; value: string; share: number; right?: React.ReactNode; color?: string }) {
  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">{name}</span>
        {sub && <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">{sub}</span>}
        <span className="shrink-0 font-mono text-[13.5px] font-bold text-foreground">{value}</span>
        {right}
      </div>
      <div className="h-[5px] overflow-hidden rounded-full" style={{ background: "var(--chart-track)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.round(share * 100))}%`, background: color }} />
      </div>
    </div>
  );
}
