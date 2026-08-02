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
import { useIsMobile } from "@/components/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui-kit/table";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
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
  const rows = table.getRowModel().rows;

  const isMobile = useIsMobile();
  // Sorting a table on a phone: the column headers are gone with the table, so the sort lives
  // in a menu. Without it a phone can only ever see whatever order the server sent — which is
  // how "the buttons don't work" starts.
  const sortable = table.getAllColumns().filter((c) => c.getCanSort() && c.getIsVisible() && c.id !== "actions");
  const sortedBy = sorting[0];
  const labelOf = (id: string) => columnLabels[id] ?? id;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        {leading}
        <div className="relative min-w-0 flex-1 basis-full sm:basis-auto sm:min-w-[200px] sm:max-w-sm">
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
              className="absolute right-1.5 top-1/2 grid size-8 touch:size-10 -translate-y-1/2 place-items-center rounded-[6px] text-muted-foreground hover:bg-secondary"
              aria-label={t("tbl_clear")}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          {isMobile && sortable.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <ArrowUpDown />
                  <span className="max-w-[110px] truncate">{sortedBy ? labelOf(sortedBy.id) : t("tbl_sort")}</span>
                  {sortedBy && (sortedBy.desc ? <ChevronDown /> : <ChevronUp />)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuLabel>{t("tbl_sort")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {sortable.map((c) => {
                  const dir = sortedBy?.id === c.id ? (sortedBy.desc ? "desc" : "asc") : null;
                  return (
                    <DropdownMenuItem key={c.id} onClick={() => c.toggleSorting(dir === "asc")}>
                      <span className="flex-1">{labelOf(c.id)}</span>
                      {dir === "asc" && <ChevronUp className="size-4" />}
                      {dir === "desc" && <ChevronDown className="size-4" />}
                    </DropdownMenuItem>
                  );
                })}
                {sortedBy && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setSorting([])}>{t("tbl_clear")}</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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

      {/* Rows as cards — the phone. A table on a 390px screen is a box that scrolls sideways,
          and the actions live off the right-hand edge where nobody finds them: the row looks
          complete, so there is nothing to suggest scrolling, and the buttons may as well not
          exist. A card says the same things stacked, with its actions across the bottom.

          Built from the columns the page already declares, so every table in the console gets
          this at once and no screen can be left behind by accident. The first column is the
          row's identity and becomes the card's heading; `actions` becomes its footer. */}
      {isMobile ? (
        <div className="flex flex-col gap-2.5">
          {rows.length === 0 && (
            <div className="grid h-32 place-items-center rounded-[14px] border border-border bg-card text-[13.5px] text-muted-foreground">
              {noRows}
            </div>
          )}
          {rows.map((row) => {
            const cells = row.getVisibleCells();
            const head = cells[0];
            const actions = cells.filter((c) => c.column.id === "actions");
            const body = cells.slice(1).filter((c) => c.column.id !== "actions");
            return (
              <div
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(
                  "flex flex-col gap-2.5 rounded-[14px] border border-border bg-card p-3.5 shadow-[var(--shadow)]",
                  onRowClick && "cursor-pointer active:bg-secondary/60",
                )}
              >
                {head && <div className="min-w-0">{flexRender(head.column.columnDef.cell, head.getContext())}</div>}
                {body.length > 0 && (
                  <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
                    {body.map((cell) => (
                      <React.Fragment key={cell.id}>
                        <dt className="text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
                          {labelOf(cell.column.id)}
                        </dt>
                        <dd className="min-w-0 text-right text-[13.5px]">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </dd>
                      </React.Fragment>
                    ))}
                  </dl>
                )}
                {/* Full-width buttons along the bottom — the row's actions, where a thumb is. */}
                {actions.length > 0 && (
                  <div className="border-t border-border/70 pt-2.5 [&_button]:flex-1 [&>div]:flex [&>div]:justify-stretch [&>div]:gap-2">
                    {actions.map((cell) => (
                      <React.Fragment key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
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
            {rows.length ? (
              rows.map((row) => (
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
      )}

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
