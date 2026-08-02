"use client";
// A simple searchable single-select. Uses cmdk's Command for clean rows + built-in
// filtering, rendered INLINE (not in a portal) so the search input keeps focus even
// inside a modal dialog. The list scrolls on its own without scrolling the dialog.
import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui-kit/command";

// icon is an optional image URL shown before the label (e.g. a brand logo), in both the
// closed trigger and the open list, so a brand is recognisable at a glance rather than by
// name alone.
export type SearchOption = { value: string; label: string; icon?: string };

function OptionIcon({ src }: { src?: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" aria-hidden className="size-5 shrink-0 rounded-[4px] object-contain" />
  );
}

export function SearchSelect({
  value, options, placeholder, onChange,
  allowClear = true, clearLabel = "—", searchPlaceholder = "Qidirish…", emptyLabel = "—",
}: {
  value: string;
  options: SearchOption[];
  placeholder?: string;
  onChange: (v: string) => void;
  allowClear?: boolean;
  clearLabel?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const shown = selected?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const pick = (v: string) => { onChange(v); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-[9px] border border-input bg-card px-3 text-left text-[14px] text-foreground outline-none touch:h-11 touch:text-base"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <OptionIcon src={selected?.icon} />
          <span className={cn("truncate", !shown && "text-muted-foreground")}>{shown || placeholder}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-[60] w-full overflow-hidden rounded-[12px] border border-border bg-card shadow-[var(--shadow-lg)]">
          <Command>
            <CommandInput placeholder={searchPlaceholder} autoFocus />
            <CommandList
              className="overscroll-contain"
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              {allowClear && (
                <CommandItem value="__clear__" onSelect={() => pick("")} className="text-muted-foreground">
                  {clearLabel}
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label} onSelect={() => pick(o.value)}>
                  <OptionIcon src={o.icon} />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.value === value && <Check className="size-3.5 shrink-0" />}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
