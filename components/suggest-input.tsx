"use client";

// A text field that offers what the shop has already written here before.
//
// Half the typing in this app is the same handful of words over and over — the same supplier
// paid every month, the same six services written on every order, the same expense category.
// Retyping them is slow and, worse, it spells them differently each time, so "Sardor aka" and
// "sardor aka" become two different payees in the reports.
//
// So: focus the field and the list is already there. It is not a select — anything can still
// be typed, and a new value is a new value. The list only ever saves work when the answer is
// one that has been given before.

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui-kit/input";
import { cn } from "@/lib/utils";

export function SuggestInput({
  value, options, onChange, placeholder, className, autoFocus, disabled, max = 8,
}: {
  value: string;
  // What has been written here before, most useful first. Duplicates and blanks are dropped.
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const o of options) {
      const s = (o ?? "").trim();
      if (!s) continue;
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      // Already typed in full: there is nothing left to offer.
      if (k === q) continue;
      if (q && !k.includes(q)) continue;
      out.push(s);
      if (out.length >= max) break;
    }
    return out;
  }, [options, value, max]);

  useEffect(() => { setActive(-1); }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (s: string) => { onChange(s); setOpen(false); setActive(-1); };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) {
      if (e.key === "ArrowDown") { setOpen(true); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % matches.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? matches.length : i) - 1); }
    // Enter picks only what is highlighted. Without a highlight it must fall through, or a
    // field with suggestions could never submit a brand-new value on the keyboard alone.
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(matches[active]); }
    else if (e.key === "Escape") { setOpen(false); setActive(-1); }
  };

  return (
    <div ref={box} className="relative">
      <Input
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-[60] w-full overflow-hidden rounded-[11px] border border-border bg-card p-1 shadow-[var(--shadow-lg)]">
          <div className="max-h-[204px] overflow-y-auto overscroll-contain" onWheel={(e) => e.stopPropagation()}>
            {matches.map((s, i) => (
              <button
                key={s}
                type="button"
                // mousedown, not click: the input blurs first on click and a parent that closes
                // on blur would tear the row away before it could be pressed.
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  // appearance/border/bg are spelled out: this app has no preflight reset on
                  // bare buttons, so without them the browser draws its own grey 3-D chrome.
                  "flex w-full appearance-none items-center border-0 bg-transparent px-2.5 py-2 text-left text-[13.5px] text-foreground",
                  "rounded-[8px]",
                  i === active && "bg-secondary",
                )}
              >
                <span className="truncate">{s}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
