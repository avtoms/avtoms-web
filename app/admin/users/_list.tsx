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
import { RowActions } from "./_row-actions";

const ROLE_BADGE: Record<Role, { label: string; tone: "accent" | "info" | "warn" }> = {
  owner: { label: "Egasi", tone: "accent" },
  mechanic: { label: "Usta", tone: "info" },
  admin: { label: "Admin", tone: "warn" },
};

// The registered name where there is one. The id fallback is for a staff record whose shop
// predates the registry and has not been named yet — it used to be all this column ever had.
function shopLabel(s: Staff): string {
  if (s.shopName) return s.shopName;
  if (!s.shopId) return "—";
  return s.shopId.length > 10 ? s.shopId.slice(0, 8) : s.shopId;
}

const columns: ColumnDef<Staff>[] = [
  {
    id: "name",
    accessorFn: (s) => `${s.name || ""} ${s.phone || ""}`,
    header: ({ column }) => <SortHeader column={column}>Foydalanuvchi</SortHeader>,
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
    header: ({ column }) => <SortHeader column={column}>Avtoservis</SortHeader>,
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
    header: ({ column }) => <SortHeader column={column}>Rol</SortHeader>,
    cell: ({ row }) => {
      const rb = ROLE_BADGE[roleFromProto(row.original.role)];
      return <Badge tone={rb.tone}>{rb.label}</Badge>;
    },
  },
  {
    id: "status",
    accessorFn: (s) => (s.active ? "faol" : "faolsiz"),
    header: ({ column }) => <SortHeader column={column}>Holat</SortHeader>,
    cell: ({ row }) => (
      <Badge tone={row.original.active ? "ok" : "neutral"} dot>{row.original.active ? "Faol" : "Faolsiz"}</Badge>
    ),
  },
  {
    id: "actions",
    enableHiding: false,
    header: () => <span className="sr-only">Amallar</span>,
    cell: ({ row }) => <RowActions staff={row.original} />,
  },
];

const COLUMN_LABELS = { name: "Foydalanuvchi", shop: "Avtoservis", role: "Rol", status: "Holat" };

export function UsersList({ staff }: { staff: Staff[] }) {
  return (
    <DataTable
      columns={columns}
      data={staff}
      searchPlaceholder="Ism yoki telefon bo'yicha qidirish…"
      columnLabels={COLUMN_LABELS}
      emptyText={staff.length === 0 ? "Foydalanuvchilar yo'q" : "Hech narsa topilmadi"}
      pageSize={12}
    />
  );
}
