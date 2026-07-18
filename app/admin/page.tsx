// SSR Overview: aggregates staff + car catalog into stat cards and a recent-users list.
import { serverGet } from "@/lib/server-api";
import type { Staff, CarMake, CarModel } from "@/lib/types";
import { roleFromProto, type Role } from "@/lib/enums";
import { Store, Users, Crown, Wrench, ShieldCheck, Car, LayoutList, type LucideIcon } from "lucide-react";
import { StatCard, type StatTone } from "@/components/admin/stat-card";
import { Card, CardHeader, CardTitle } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { UserAvatar } from "@/components/ui-kit/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui-kit/table";

export const dynamic = "force-dynamic";

const ROLE_BADGE: Record<Role, { label: string; tone: "accent" | "info" | "warn" }> = {
  owner: { label: "Egasi", tone: "accent" },
  mechanic: { label: "Usta", tone: "info" },
  admin: { label: "Admin", tone: "warn" },
};

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

  const stats: { icon: LucideIcon; tone: StatTone; value: number; label: string }[] = [
    { icon: Store, tone: "neutral", value: shops, label: "Avtoservislar" },
    { icon: Users, tone: "primary", value: staff.length, label: "Jami foydalanuvchilar" },
    { icon: Crown, tone: "primary", value: owners, label: "Egalari" },
    { icon: Wrench, tone: "info", value: mechanics, label: "Ustalar" },
    { icon: ShieldCheck, tone: "warn", value: admins, label: "Adminlar" },
    { icon: Car, tone: "ok", value: makes.length, label: "Markalar" },
    { icon: LayoutList, tone: "ok", value: models.length, label: "Modellar" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>So'nggi foydalanuvchilar</CardTitle>
          <span className="text-[12.5px] font-semibold text-muted-foreground">{staff.length} ta jami</span>
        </CardHeader>
        {recent.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Ma'lumot yo'q</div>
        ) : (
          <Table>
            <TableHeader className="bg-secondary/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Foydalanuvchi</TableHead>
                <TableHead className="hidden sm:table-cell">Telefon</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Holat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((s) => {
                const rb = ROLE_BADGE[roleFromProto(s.role)];
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar name={s.name || "?"} className="size-9" />
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-semibold text-foreground">{s.name || "—"}</div>
                          <div className="truncate font-mono text-[12px] text-muted-foreground sm:hidden">{s.phone}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-[13px] text-muted-foreground sm:table-cell">{s.phone}</TableCell>
                    <TableCell><Badge tone={rb.tone}>{rb.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Badge tone={s.active ? "ok" : "neutral"} dot>{s.active ? "Faol" : "Faolsiz"}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
