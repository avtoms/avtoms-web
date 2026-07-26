"use client";
// A searchable single-select dropdown (shadcn Combobox: Popover + Command). Shows a
// filter box and matches options as you type. Portaled so it is never clipped by a
// scrolling dialog body, and sized to match its trigger.
import React, { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui-kit/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui-kit/command";

export type SearchOption = { value: string; label: string };

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
  const selected = options.find((o) => o.value === value);
  const shown = selected?.label ?? value;

  const pick = (v: string) => { onChange(v); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-[9px] border border-input bg-card px-3 text-left text-[14px] text-foreground outline-none"
        >
          <span className={cn("truncate", !shown && "text-muted-foreground")}>{shown || placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0" style={{ width: "var(--radix-popover-trigger-width)" }}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {allowClear && (
              <CommandItem value="__clear__" onSelect={() => pick("")} className="text-muted-foreground">
                {clearLabel}
              </CommandItem>
            )}
            {options.map((o) => (
              <CommandItem key={o.value} value={o.label} onSelect={() => pick(o.value)}>
                <span className="flex-1 truncate">{o.label}</span>
                {o.value === value && <Check className="size-3.5 shrink-0" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
