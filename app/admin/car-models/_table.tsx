"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Badge } from "@/components/ui-kit/badge";

export type ModelRow = { id: string; makeName: string; name: string; bodyType: string };

const columns: ColumnDef<ModelRow>[] = [
  {
    accessorKey: "makeName",
    header: ({ column }) => <SortHeader column={column}>Marka</SortHeader>,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.makeName}</span>,
  },
  {
    accessorKey: "name",
    header: ({ column }) => <SortHeader column={column}>Model</SortHeader>,
    cell: ({ row }) => <span className="font-semibold text-foreground">{row.original.name}</span>,
  },
  {
    accessorKey: "bodyType",
    header: ({ column }) => <SortHeader column={column}>Kuzov</SortHeader>,
    cell: ({ row }) => (row.original.bodyType ? <Badge tone="neutral">{row.original.bodyType}</Badge> : <span className="text-muted-foreground">—</span>),
  },
];

const COLUMN_LABELS = { makeName: "Marka", name: "Model", bodyType: "Kuzov" };

export function ModelsTable({ rows }: { rows: ModelRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Marka yoki model bo'yicha qidirish…"
      columnLabels={COLUMN_LABELS}
      pageSize={15}
    />
  );
}
