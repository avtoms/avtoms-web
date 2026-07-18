"use client";
// Cars (owner): a shop-wide directory of every vehicle with its owner's name & phone.
// Cars are only otherwise visible inside a customer's detail; this surfaces them as their
// own searchable tab. Loads api.listShopVehicles + api.listCustomers and joins owner names
// by customerId. A row deep-links to the owner (customers?focus=<id>).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Users } from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Card } from "@/components/ui-kit/card";
import { Button } from "@/components/ui-kit/button";
import { Skeleton } from "@/components/ui-kit/misc";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import type { Customer, Vehicle } from "@/lib/types";
import { PlatePreview } from "@/components/plate";
import { CarImage } from "@/components/car-image";
import { VehicleHistoryModal } from "@/components/vehicle-history";
import { EditVehicleModal } from "@/components/vehicle-edit";

export default function VehiclesPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();
  const router = useRouter();

  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [owners, setOwners] = useState<Record<string, Customer>>({});
  const [hist, setHist] = useState<Vehicle | null>(null);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  const load = useCallback(async () => {
    setVehicles(null);
    try {
      const [vs, cs] = await Promise.all([api.listShopVehicles(shopId), api.listCustomers(shopId)]);
      const map: Record<string, Customer> = {};
      for (const c of cs) map[c.id] = c;
      setOwners(map);
      setVehicles(vs);
    } catch (e) {
      setVehicles([]);
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    }
  }, [shopId, t, toast]);

  useEffect(() => { void load(); }, [load]);

  const columns = useMemo<ColumnDef<Vehicle>[]>(() => [
    {
      id: "vehicle",
      // Include a space-squashed plate so "01A123BC" still matches "01 A 123 BC".
      accessorFn: (v) => {
        const o = owners[v.customerId];
        const squashed = (v.plate || "").toLowerCase().replace(/\s+/g, "");
        return `${v.make ?? ""} ${v.model ?? ""} ${o?.name ?? ""} ${o?.phone ?? ""} ${v.plate ?? ""} ${squashed} ${v.year ?? ""}`;
      },
      header: ({ column }) => <SortHeader column={column}>{t("vehicle")}</SortHeader>,
      cell: ({ row }) => {
        const v = row.original;
        const car = [v.make, v.model].filter(Boolean).join(" ") || t("vehicle");
        return (
          <div className="flex items-center gap-3">
            <CarImage src={v.imageUrl} make={v.make} size={44} radius={11} />
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="truncate text-[14px] font-bold text-foreground">{car}{v.year ? ` (${v.year})` : ""}</span>
              {v.plate && <PlatePreview plate={v.plate} size="sm" />}
            </div>
          </div>
        );
      },
    },
    {
      id: "owner",
      accessorFn: (v) => { const o = owners[v.customerId]; return o ? (o.walkIn ? t("walk_in") : o.name) : ""; },
      header: ({ column }) => <SortHeader column={column}>{t("nav_customers")}</SortHeader>,
      cell: ({ row }) => {
        const o = owners[row.original.customerId];
        return (
          <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <Users className="size-4 shrink-0" />
            <span className="truncate text-[13px]">{o ? (o.walkIn ? t("walk_in") : o.name) : "—"}{o?.phone ? " · " + o.phone : ""}</span>
          </div>
        );
      },
    },
    {
      id: "actions",
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => {
        const v = row.original;
        const o = owners[v.customerId];
        return (
          <div className="flex items-center justify-end gap-1">
            {/* edit this car */}
            <Button variant="ghost" size="icon-sm" aria-label={t("edit")} onClick={(e) => { e.stopPropagation(); setEditing(v); }}><Pencil /></Button>
            {/* jump to the owner's card */}
            {o && <Button variant="ghost" size="icon-sm" aria-label={t("nav_customers")} onClick={(e) => { e.stopPropagation(); router.push(`/customers?focus=${o.id}`); }}><Users /></Button>}
          </div>
        );
      },
    },
  ], [t, owners, router]);

  return (
    <div className="flex flex-col gap-4">
      {vehicles === null ? (
        <Card className="gap-3 p-5">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={vehicles}
          searchPlaceholder={t("search") + "…"}
          emptyText={t("empty")}
          columnLabels={{ vehicle: t("vehicle"), owner: t("nav_customers") }}
          pageSize={12}
          onRowClick={(v) => setHist(v)}
        />
      )}
      <VehicleHistoryModal vehicle={hist} shopId={shopId} onClose={() => setHist(null)} />
      <EditVehicleModal vehicle={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />
    </div>
  );
}
