// SSR Overview: aggregates staff + car catalog into stat cards and a recent-users list.
import { serverGet } from "@/lib/server-api";
import type { Staff, CarMake, CarModel } from "@/lib/types";
import { roleFromProto, type Role } from "@/lib/enums";
import { Avatar, Badge } from "@/components/ui";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

type StatTone = "accent" | "info" | "warn" | "ok" | "neutral";
const TONE_VARS: Record<StatTone, { soft: string; fg: string }> = {
  accent: { soft: "var(--accent-soft)", fg: "var(--accent-2)" },
  info: { soft: "var(--info-soft)", fg: "var(--info)" },
  warn: { soft: "var(--warn-soft)", fg: "var(--warn)" },
  ok: { soft: "var(--ok-soft)", fg: "var(--ok)" },
  neutral: { soft: "var(--surface-2)", fg: "var(--ink-2)" },
};

const ROLE_BADGE: Record<Role, { label: string; tone: "accent" | "info" | "warn" }> = {
  owner: { label: "Egasi", tone: "accent" },
  mechanic: { label: "Usta", tone: "info" },
  admin: { label: "Admin", tone: "warn" },
};

function StatCard({ icon, tone, value, label }: { icon: string; tone: StatTone; value: number; label: string }) {
  const t = TONE_VARS[tone];
  return (
    <div
      style={{
        background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)", padding: 18, display: "flex", flexDirection: "column", gap: 14, minWidth: 0,
      }}
    >
      <div
        style={{
          width: 42, height: 42, borderRadius: 12, background: t.soft, color: t.fg,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon name={icon} size={22} />
      </div>
      <div>
        <div style={{ fontSize: 30, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.03em", lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "var(--ink-3)" }}>{label}</div>
      </div>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const [staffData, makesData, modelsData] = await Promise.all([
    serverGet<{ staff?: Staff[] }>("/v1/admin/staff"),
    serverGet<{ makes?: CarMake[] }>("/v1/car-makes"),
    serverGet<{ models?: CarModel[] }>("/v1/car-models"),
  ]);
  const staff = staffData?.staff ?? [];
  const makes = makesData?.makes ?? [];
  const models = modelsData?.models ?? [];

  const roles = staff.map((s) => roleFromProto(s.role));
  const shops = new Set(staff.map((s) => s.shopId)).size;
  const owners = roles.filter((r) => r === "owner").length;
  const mechanics = roles.filter((r) => r === "mechanic").length;
  const admins = roles.filter((r) => r === "admin").length;

  const recent = [...staff]
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, 6);

  const stats: { icon: string; tone: StatTone; value: number; label: string }[] = [
    { icon: "settings", tone: "neutral", value: shops, label: "Avtoservislar" },
    { icon: "users", tone: "accent", value: staff.length, label: "Jami foydalanuvchilar" },
    { icon: "team", tone: "accent", value: owners, label: "Egalari" },
    { icon: "wrench", tone: "info", value: mechanics, label: "Ustalar" },
    { icon: "settings", tone: "warn", value: admins, label: "Adminlar" },
    { icon: "car", tone: "ok", value: makes.length, label: "Markalar" },
    { icon: "list", tone: "ok", value: models.length, label: "Modellar" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        }}
      >
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <div
        style={{
          background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)",
          boxShadow: "var(--shadow)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>So'nggi foydalanuvchilar</h2>
          <span style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 600 }}>{staff.length} ta jami</span>
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: 28, color: "var(--ink-3)", textAlign: "center", fontSize: 14 }}>Ma'lumot yo'q</div>
        ) : (
          recent.map((s) => {
            const rb = ROLE_BADGE[roleFromProto(s.role)];
            return (
              <div
                key={s.id}
                className="an-row-btn"
                style={{
                  display: "flex", alignItems: "center", gap: 13, padding: "12px 18px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <Avatar name={s.name || "?"} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 650, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name || "—"}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{s.phone}</div>
                </div>
                <Badge tone={rb.tone}>{rb.label}</Badge>
                <Badge tone={s.active ? "ok" : "neutral"} dot>{s.active ? "Faol" : "Faolsiz"}</Badge>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
