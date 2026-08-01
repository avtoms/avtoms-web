"use client";
// Client wrapper for the users page: a robust DataTable (global search, sortable columns,
// pagination) over all staff across shops, with per-row role/active mutations.
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Store } from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { UserAvatar } from "@/components/ui-kit/avatar";
import { Badge } from "@/components/ui-kit/badge";
import { roleFromProto, type Role } from "@/lib/enums";
import type { Staff } from "@/lib/types";
import { useLang } from "@/components/providers";
import { RowActions } from "./_row-actions";

// label is an i18n key: the console has a language switcher and a badge is a word.
const ROLE_BADGE: Record<Role, { label: string; tone: "accent" | "info" | "warn" }> = {
  owner: { label: "a_role_owner", tone: "accent" },
  mechanic: { label: "a_role_mechanic", tone: "info" },
  admin: { label: "a_role_admin", tone: "warn" },
};

// The registered name where there is one. The id fallback is for a staff record whose shop
// predates the registry and has not been named yet — it used to be all this column ever had.
function shopLabel(s: Staff): string {
  if (s.shopName) return s.shopName;
  if (!s.shopId) return "—";
  return s.shopId.length > 10 ? s.shopId.slice(0, 8) : s.shopId;
}

const buildColumns = (t: (k: string) => string): ColumnDef<Staff>[] => [
  {
    id: "name",
    accessorFn: (s) => `${s.name || ""} ${s.phone || ""}`,
    header: ({ column }) => <SortHeader column={column}>{t("a_user")}</SortHeader>,
    cell: ({ row }) => {
      const s = row.original;
      return (
        <div className="flex items-center gap-3">
          <UserAvatar name={s.name || "?"} className="size-9" />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-foreground">{s.name || "—"}</div>
            <div className="truncate font-mono text-[12px] text-muted-foreground">{s.phone}</div>
          </div>
        </div>
      );
    },
  },
  {
    id: "shop",
    accessorFn: (s) => shopLabel(s),
    header: ({ column }) => <SortHeader column={column}>{t("a_shop")}</SortHeader>,
    cell: ({ row }) => (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Store className="size-4" />
        <span className={row.original.shopName ? "text-[13px] font-semibold text-foreground" : "font-mono text-[12.5px]"}>{shopLabel(row.original)}</span>
      </div>
    ),
  },
  {
    id: "role",
    accessorFn: (s) => roleFromProto(s.role),
    header: ({ column }) => <SortHeader column={column}>{t("role")}</SortHeader>,
    cell: ({ row }) => {
      const rb = ROLE_BADGE[roleFromProto(row.original.role)];
      return <Badge tone={rb.tone}>{t(rb.label)}</Badge>;
    },
  },
  {
    id: "status",
    accessorFn: (s) => (s.active ? "faol" : "faolsiz"),
    header: ({ column }) => <SortHeader column={column}>{t("status")}</SortHeader>,
    cell: ({ row }) => (
      <Badge tone={row.original.active ? "ok" : "neutral"} dot>{row.original.active ? t("active") : t("inactive")}</Badge>
    ),
  },
  {
    id: "actions",
    enableHiding: false,
    header: () => <span className="sr-only">{t("actions")}</span>,
    cell: ({ row }) => <RowActions staff={row.original} />,
  },
];

export function UsersList({ staff }: { staff: Staff[] }) {
  const { t } = useLang();
  const columns = React.useMemo(() => buildColumns(t), [t]);
  return (
    <DataTable
      columns={columns}
      data={staff}
      searchPlaceholder={t("a_search_user")}
      columnLabels={{ name: t("a_user"), shop: t("a_shop"), role: t("role"), status: t("status") }}
      emptyText={staff.length === 0 ? t("a_no_users") : t("a_nothing_found")}
      pageSize={12}
    />
  );
}
