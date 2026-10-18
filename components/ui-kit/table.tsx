import * as React from "react";
import { cn } from "@/lib/utils";

// `bare` renders the table without its own scrolling wrapper, for a table that already sits
// inside one. Two nested scrollers look fine and behave badly: the inner one takes the
// scroll, and its scrollbar sits at the bottom of the whole table — hundreds of pixels below
// the fold on a long list — so the last column reads as clipped with no way to reach it.
function Table({ className, bare, ...props }: React.ComponentProps<"table"> & { bare?: boolean }) {
  const table = <table data-slot="table" className={cn("w-full caption-bottom text-sm border-collapse", className)} {...props} />;
  if (bare) return table;
  return <div className="relative w-full overflow-x-auto">{table}</div>;
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b border-border transition-colors hover:bg-secondary/60 data-[state=selected]:bg-primary-soft/50", className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 px-4 text-left align-middle text-[11.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-4 py-3 align-middle text-[13.5px] [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
