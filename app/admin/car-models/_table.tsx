"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Badge } from "@/components/ui-kit/badge";
import { useLang } from "@/components/providers";

export type ModelRow = { id: string; makeName: string; name: string; bodyType: string };

export function ModelsTable({ rows }: { rows: ModelRow[] }) {
  const { t } = useLang();
  // Built inside the component rather than at module scope: the headers are words, and the
  // words change when the operator switches language.
  const columns = React.useMemo<ColumnDef<ModelRow>[]>(() => [
    {
      accessorKey: "makeName",
      header: ({ column }) => <SortHeader column={column}>{t("make")}</SortHeader>,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.makeName}</span>,
    },
    {
      accessorKey: "name",
      header: ({ column }) => <SortHeader column={column}>{t("model")}</SortHeader>,
      cell: ({ row }) => <span className="font-semibold text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: "bodyType",
      header: ({ column }) => <SortHeader column={column}>{t("a_body")}</SortHeader>,
      cell: ({ row }) => (row.original.bodyType ? <Badge tone="neutral">{row.original.bodyType}</Badge> : <span className="text-muted-foreground">—</span>),
    },
  ], [t]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder={t("a_search_make_model")}
      columnLabels={{ makeName: t("make"), name: t("model"), bodyType: t("a_body") }}
      pageSize={15}
    />
  );
}
