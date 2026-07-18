"use client";
// Self-contained dashboard chart cards. Each owns its ChartCard + formatter + palette, so the
// server overview page passes only serializable data (no functions across the boundary).
import { Target, PieChart, TrendingUp, Radio } from "lucide-react";
import { ChartCard, DonutChart, HBarChart, type Slice, type BarDatum } from "./charts";
import { money } from "@/lib/format";

export function RolesDonut({ owner, mechanic, admin }: { owner: number; mechanic: number; admin: number }) {
  const total = owner + mechanic + admin;
  const slices: Slice[] = [
    { key: "owner", label: "Egalari", value: owner, color: "var(--chart-1)" },
    { key: "mechanic", label: "Ustalar", value: mechanic, color: "var(--chart-2)" },
    { key: "admin", label: "Adminlar", value: admin, color: "var(--chart-3)" },
  ].filter((s) => s.value > 0);
  return (
    <ChartCard title="Xodimlar tarkibi" subtitle="Rol bo'yicha taqsimot" icon={<PieChart className="size-[18px] text-muted-foreground" />}>
      <DonutChart data={slices} centerValue={total} centerLabel="Xodim" />
    </ChartCard>
  );
}

export function PipelineBars({ data }: { data: BarDatum[] }) {
  return (
    <ChartCard title="Sotuv quvuri" subtitle="Bosqich bo'yicha lidlar soni" icon={<Target className="size-[18px] text-muted-foreground" />}>
      <HBarChart data={data} color="var(--accent)" />
    </ChartCard>
  );
}

export function SourcesBars({ data }: { data: BarDatum[] }) {
  return (
    <ChartCard title="Lidlar manbasi" subtitle="Lidlar qayerdan kelgani" icon={<Radio className="size-[18px] text-muted-foreground" />}>
      <HBarChart data={data} color="var(--info)" />
    </ChartCard>
  );
}

export function RevenueBars({ data }: { data: BarDatum[] }) {
  return (
    <ChartCard title="Eng ko'p daromadli xizmatlar" subtitle="Platforma bo'yicha, so'm" icon={<TrendingUp className="size-[18px] text-muted-foreground" />}>
      <HBarChart data={data} color="var(--chart-1)" unit="so'm" formatter={(v) => money(v)} height={Math.max(160, data.length * 44 + 8)} />
    </ChartCard>
  );
}
