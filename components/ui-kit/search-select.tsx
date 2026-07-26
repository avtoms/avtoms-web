"use client";
// A searchable single-select dropdown. Unlike the native Select it shows a filter
// box and matches options as you type. Rendered in a portal with fixed positioning
// so it is never clipped by a scrolling dialog body.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchOption = { value: string; label: string };

export function SearchSelect({
  value, options, placeholder, onChange,
  allowClear = true, clearLabel = "—", searchPlaceholder = "Qidirish…",
}: {
  value: string;
  options: SearchOption[];
  placeholder?: string;
  onChange: (v: string) => void;
  allowClear?: boolean;
  clearLabel?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const measure = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  useLayoutEffect(() => { if (open) measure(); }, [open]);
  useEffect(() => {
    if (!open) return;
    setQ("");
    const focus = setTimeout(() => inputRef.current?.focus(), 0);
    const reflow = () => measure();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (triggerRef.current?.contains(tgt) || menuRef.current?.contains(tgt)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", reflow, true);
    window.addEventListener("resize", reflow);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      clearTimeout(focus);
      window.removeEventListener("scroll", reflow, true);
      window.removeEventListener("resize", reflow);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const shown = selected?.label ?? value;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [q, options]);

  const pick = (v: string) => { onChange(v); setOpen(false); };

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen((x) => !x)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-[9px] border border-input bg-card px-3 text-left text-[14px] text-foreground outline-none">
        <span className={cn("truncate", !shown && "text-muted-foreground")}>{shown || placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 300 }}
          className="overflow-hidden rounded-[12px] border border-border bg-card text-foreground shadow-[var(--shadow-lg)]">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
              className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground" />
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1">
            {allowClear && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick("")}
                className="flex w-full items-center px-3 py-1.5 text-[13.5px] text-muted-foreground hover:bg-secondary">{clearLabel}</button>
            )}
            {filtered.length === 0 && <div className="px-3 py-2 text-[12.5px] text-muted-foreground">—</div>}
            {filtered.map((o) => (
              <button key={o.value} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.value)}
                className={cn("flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13.5px] hover:bg-secondary",
                  o.value === value && "bg-primary-soft text-primary-emphasis")}>
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check className="size-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
