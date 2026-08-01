"use client";
// Self-contained dashboard chart cards. Each owns its ChartCard + formatter + palette, so the
// server overview page passes only serializable data (no functions across the boundary).
import { Target, PieChart, TrendingUp, Radio } from "lucide-react";
import { ChartCard, DonutChart, HBarChart, type Slice, type BarDatum } from "./charts";
import { money } from "@/lib/format";
import { useLang } from "@/components/providers";

export function RolesDonut({ owner, mechanic, admin }: { owner: number; mechanic: number; admin: number }) {
  const { t } = useLang();
  const total = owner + mechanic + admin;
  const slices: Slice[] = [
    { key: "owner", label: t("a_owners"), value: owner, color: "var(--chart-1)" },
    { key: "mechanic", label: t("a_mechanics"), value: mechanic, color: "var(--chart-2)" },
    { key: "admin", label: t("a_admins"), value: admin, color: "var(--chart-3)" },
  ].filter((s) => s.value > 0);
  return (
    <ChartCard title={t("a_staff_mix")} subtitle={t("a_staff_mix_sub")} icon={<PieChart className="size-[18px] text-muted-foreground" />}>
      <DonutChart data={slices} centerValue={total} centerLabel={t("a_staff_one")} />
    </ChartCard>
  );
}

export function PipelineBars({ data }: { data: BarDatum[] }) {
  const { t } = useLang();
  // The bars arrive labelled with i18n keys — the page that builds them runs on the server
  // and has no language.
  const rows = data.map((d) => ({ ...d, label: t(d.label) }));
  return (
    <ChartCard title={t("a_funnel")} subtitle={t("a_funnel_sub")} icon={<Target className="size-[18px] text-muted-foreground" />}>
      <HBarChart data={rows} color="var(--accent)" />
    </ChartCard>
  );
}

export function SourcesBars({ data }: { data: BarDatum[] }) {
  const { t } = useLang();
  const rows = data.map((d) => ({ ...d, label: t(d.label) }));
  return (
    <ChartCard title={t("a_lead_sources")} subtitle={t("a_lead_sources_sub")} icon={<Radio className="size-[18px] text-muted-foreground" />}>
      <HBarChart data={rows} color="var(--info)" />
    </ChartCard>
  );
}

export function RevenueBars({ data }: { data: BarDatum[] }) {
  const { t } = useLang();
  return (
    <ChartCard title={t("a_top_services")} subtitle={t("a_top_services_sub")} icon={<TrendingUp className="size-[18px] text-muted-foreground" />}>
      <HBarChart data={data} color="var(--chart-1)" unit={t("soum")} formatter={(v) => money(v)} height={Math.max(160, data.length * 44 + 8)} />
    </ChartCard>
  );
}
