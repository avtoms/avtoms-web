// SSR analytics dashboard for the super-admin: aggregates staff, leads, demo requests and the
// platform service report into KPI tiles, charts, a shops leaderboard and an activity feed.
import { serverGet } from "@/lib/server-api";
import { T } from "@/components/t";
import type { Staff, CarMake, CarModel, Lead, DemoRequest, Report } from "@/lib/types";
import { roleFromProto } from "@/lib/enums";
import { money, num } from "@/lib/format";
import {
  Store, Users, Wallet, Trophy, Inbox, Car, UserPlus, Target, type LucideIcon,
} from "lucide-react";
import { StatCard, type StatTone } from "@/components/admin/stat-card";
import { RolesDonut, PipelineBars, SourcesBars, RevenueBars } from "@/components/admin/dashboard-charts";
import type { BarDatum } from "@/components/admin/charts";
import { Card, CardHeader, CardTitle } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { UserAvatar } from "@/components/ui-kit/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui-kit/table";

export const dynamic = "force-dynamic";

// i18n keys, not words: this page renders on the server, where nobody has a language. The
// client cards below translate them.
const STATUS_UZ: Record<string, string> = {
  new: "lead_new", contacted: "lead_contacted", qualified: "lead_qualified", negotiating: "lead_negotiating", won: "lead_won", lost: "lead_lost",
};
const SOURCE_UZ: Record<string, string> = {
  landing: "src_landing", referral: "src_referral", cold: "src_cold", telegram: "src_telegram", instagram: "src_instagram", walk_in: "src_walk_in", other: "src_other",
};
const PIPELINE_ORDER = ["new", "contacted", "qualified", "negotiating", "won", "lost"];
const OPEN_STAGES = new Set(["new", "contacted", "qualified", "negotiating"]);

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

function shopLabel(id: string) { return id ? (id.length > 10 ? id.slice(0, 8) : id) : "—"; }

export default async function AdminOverviewPage() {
  const [staffData, makesData, modelsData, leadsData, demoData, report] = await Promise.all([
    serverGet<{ staff?: Staff[] }>("/v1/admin/staff"),
    serverGet<{ makes?: CarMake[] }>("/v1/car-makes"),
    serverGet<{ models?: CarModel[] }>("/v1/car-models"),
    serverGet<{ leads?: Lead[] }>("/v1/admin/leads"),
    serverGet<{ requests?: DemoRequest[] }>("/v1/admin/demo-requests"),
    serverGet<Report>("/v1/admin/reports/services"),
  ]);
  const staff = staffData?.staff ?? [];
  const makes = makesData?.makes ?? [];
  const models = modelsData?.models ?? [];
  const leads = leadsData?.leads ?? [];
  const requests = demoData?.requests ?? [];

  // ── staff metrics ──
  const roles = staff.map((s) => roleFromProto(s.role));
  const shops = new Set(staff.map((s) => s.shopId));
  const activeCount = staff.filter((s) => s.active).length;
  const activePct = staff.length ? Math.round((activeCount / staff.length) * 100) : 0;
  const owners = roles.filter((r) => r === "owner").length;
  const mechanics = roles.filter((r) => r === "mechanic").length;
  const admins = roles.filter((r) => r === "admin").length;

  // ── leads / pipeline metrics ──
  const byStatus = (st: string) => leads.filter((l) => (l.status || "new") === st);
  const pipelineValue = leads.filter((l) => OPEN_STAGES.has(l.status || "new")).reduce((s, l) => s + num(l.dealPrice), 0);
  const wonLeads = byStatus("won");
  const wonValue = wonLeads.reduce((s, l) => s + num(l.dealPrice), 0);
  const decided = wonLeads.length + byStatus("lost").length;
  const winRate = decided ? Math.round((wonLeads.length / decided) * 100) : 0;
  const openDemos = requests.filter((r) => r.status !== "closed").length;

  const pipelineBars: BarDatum[] = PIPELINE_ORDER.map((st) => ({ label: STATUS_UZ[st], value: byStatus(st).length })).filter((b) => b.value > 0);
  const sourceCounts = new Map<string, number>();
  for (const l of leads) { const k = l.source || "other"; sourceCounts.set(k, (sourceCounts.get(k) || 0) + 1); }
  const sourceBars: BarDatum[] = [...sourceCounts.entries()]
    .map(([k, v]) => ({ label: SOURCE_UZ[k] || k, value: v }))
    .sort((a, b) => b.value - a.value);

  // ── top services by revenue ──
  const revenueBars: BarDatum[] = (report?.rows ?? [])
    .map((r) => ({ label: r.cells.service ?? "—", value: num(r.cells.revenue) }))
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // ── shops leaderboard ──
  const shopGroups = [...shops].map((id) => {
    const members = staff.filter((s) => s.shopId === id);
    return {
      id,
      total: members.length,
      owners: members.filter((s) => roleFromProto(s.role) === "owner").length,
      mechanics: members.filter((s) => roleFromProto(s.role) === "mechanic").length,
      active: members.filter((s) => s.active).length,
    };
  }).sort((a, b) => b.total - a.total).slice(0, 6);

  // ── activity feed (merged) ──
  type Act = { kind: "user" | "lead" | "demo"; name: string; detail: React.ReactNode; when?: string };
  const acts: Act[] = [
    ...staff.map((s): Act => ({ kind: "user", name: s.name || "—", detail: <T k="a_new_staff" />, when: s.createdAt })),
    ...leads.map((l): Act => ({ kind: "lead", name: l.name || l.company || "—", detail: <><T k="a_lead" /> · <T k={STATUS_UZ[l.status || "new"]} /></>, when: l.updatedAt || l.createdAt })),
    ...requests.map((r): Act => ({ kind: "demo", name: r.name || "—", detail: <><T k="a_demo_one" /> · {r.city || "—"}</>, when: r.createdAt })),
  ].filter((a) => a.when).sort((a, b) => (b.when || "").localeCompare(a.when || "")).slice(0, 8);

  const ACT_META: Record<Act["kind"], { icon: LucideIcon; tone: string }> = {
    user: { icon: UserPlus, tone: "bg-primary-soft text-primary-emphasis" },
    lead: { icon: Target, tone: "bg-info-soft text-info" },
    demo: { icon: Inbox, tone: "bg-warning-soft text-warning" },
  };

  const kpis: { icon: LucideIcon; tone: StatTone; value: React.ReactNode; label: React.ReactNode; sub?: React.ReactNode }[] = [
    { icon: Users, tone: "primary", value: staff.length, label: <T k="a_users" />, sub: <><span className="text-success">{activePct}%</span> <T k="a_active_low" /></> },
    { icon: Store, tone: "neutral", value: shops.size, label: <T k="a_shops_all" />, sub: <>{makes.length} <T k="a_makes_low" /> · {models.length} <T k="a_models_low" /></> },
    { icon: Wallet, tone: "info", value: money(pipelineValue), label: <T k="a_pipeline_value" />, sub: <>{leads.filter((l) => OPEN_STAGES.has(l.status || "new")).length} <T k="a_open_leads" /></> },
    { icon: Trophy, tone: "ok", value: money(wonValue), label: <T k="a_won_deals" />, sub: <><span className="text-success">{winRate}%</span> <T k="a_conversion" /></> },
    { icon: Inbox, tone: "warn", value: openDemos, label: <T k="a_open_demo" />, sub: <>{requests.length} <T k="a_total_low" /></> },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* KPI hero row */}
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
        {kpis.map((k, i) => <StatCard key={i} {...k} />)}
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <PipelineBars data={pipelineBars} />
        <RolesDonut owner={owners} mechanic={mechanics} admin={admins} />
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueBars data={revenueBars} />
        <SourcesBars data={sourceBars} />
      </div>

      {/* Leaderboard + activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle><Car className="size-[18px] text-muted-foreground" /> <T k="a_shop_ranking" /></CardTitle>
            <span className="text-[12.5px] font-semibold text-muted-foreground">{shops.size} <T k="a_count" /></span>
          </CardHeader>
          {shopGroups.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground"><T k="empty" /></div>
          ) : (
            <Table>
              <TableHeader className="bg-secondary/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead><T k="a_shop" /></TableHead>
                  <TableHead className="text-right"><T k="a_staff" /></TableHead>
                  <TableHead className="text-right"><T k="a_mechanics" /></TableHead>
                  <TableHead className="text-right"><T k="active" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shopGroups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono text-[12.5px] text-muted-foreground">{shopLabel(g.id)}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-foreground">{g.total}</TableCell>
                    <TableCell className="text-right font-mono text-ink-2">{g.mechanics}</TableCell>
                    <TableCell className="text-right"><Badge tone={g.active === g.total ? "ok" : "neutral"}>{g.active}/{g.total}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle><Target className="size-[18px] text-muted-foreground" /> <T k="a_recent_activity" /></CardTitle>
          </CardHeader>
          {acts.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground"><T k="a_no_activity" /></div>
          ) : (
            <div>
              {acts.map((a, i) => {
                const m = ACT_META[a.kind];
                const Icon = m.icon;
                return (
                  <div key={i} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0">
                    <div className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${m.tone}`}><Icon className="size-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-foreground">{a.name}</div>
                      <div className="truncate text-[12.5px] text-muted-foreground">{a.detail}</div>
                    </div>
                    <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">{fmtDate(a.when)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
