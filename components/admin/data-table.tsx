"use client";
import * as React from "react";
import { useLang } from "@/components/providers";
import {
  type ColumnDef, type SortingState, type VisibilityState, type ColumnFiltersState,
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, SlidersHorizontal, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui-kit/table";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui-kit/dropdown-menu";

// SortHeader: drop into a column's `header` to get a click-to-sort button with direction arrows.
export function SortHeader<T>({ column, children }: { column: import("@tanstack/react-table").Column<T, unknown>; children: React.ReactNode }) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className="inline-flex items-center gap-1.5 -ml-1 rounded-[6px] px-1 py-0.5 uppercase tracking-[0.04em] text-[11.5px] font-bold text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
      {sorted === "asc" ? <ChevronUp className="size-3.5" /> : sorted === "desc" ? <ChevronDown className="size-3.5" /> : <ArrowUpDown className="size-3 opacity-50" />}
    </button>
  );
}

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  /** Extra controls rendered on the right of the toolbar (e.g. an "Add" button). */
  toolbar?: React.ReactNode;
  /** Optional left-of-search node (e.g. a Tabs view switcher). */
  leading?: React.ReactNode;
  pageSize?: number;
  emptyText?: string;
  onRowClick?: (row: TData) => void;
  /** Column id → readable label for the visibility menu. */
  columnLabels?: Record<string, string>;
  enableColumnToggle?: boolean;
};

export function DataTable<TData, TValue>({
  columns, data, searchPlaceholder, toolbar, leading, pageSize = 10, emptyText,
  onRowClick, columnLabels = {}, enableColumnToggle = true,
}: DataTableProps<TData, TValue>) {
  const { t } = useLang();
  // Defaults live here rather than in the signature so they follow the language on screen.
  const search = searchPlaceholder ?? t("search") + "…";
  const noRows = emptyText ?? t("empty");
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const toggleable = table.getAllColumns().filter((c) => c.getCanHide());
  const total = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();

  return (
    <div className="flex flex-col gap-3.5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        {leading}
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={search}
            className="pl-9 pr-9"
          />
          {globalFilter && (
            <button
              type="button"
              onClick={() => setGlobalFilter("")}
              className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-[6px] text-muted-foreground hover:bg-secondary"
              aria-label={t("tbl_clear")}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          {enableColumnToggle && toggleable.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="hidden sm:inline-flex">
                  <SlidersHorizontal /> {t("tbl_columns")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("tbl_columns")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {toggleable.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(v) => column.toggleVisibility(!!v)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {columnLabels[column.id] ?? column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {toolbar}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-[var(--shadow)]">
        <Table>
          <TableHeader className="bg-secondary/50">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  {noRows}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="text-[12.5px] text-muted-foreground">
            {total} {t("tbl_rows")}{pageCount > 1 && ` · ${table.getState().pagination.pageIndex + 1} / ${pageCount}`}
          </div>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label={t("tbl_prev")}>
                <ChevronLeft />
              </Button>
              <Button variant="secondary" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label={t("tbl_next")}>
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
