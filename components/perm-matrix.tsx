"use client";
// The permission matrix: the one screen where an owner says what a job is.
//
// Grouped and spelled out rather than a list of keys. "finance.view" means nothing to the
// person deciding whether their cashier should see the month's profit, so every row carries the
// sentence that answers exactly that — the label alone would leave them guessing, and an owner
// guessing about permissions ticks everything.
import React from "react";
import { Check } from "lucide-react";
import { useLang } from "@/components/providers";
import { PERM_GROUPS, permLabel, permHint, type Permission } from "@/lib/perms";
import { cn } from "@/lib/utils";

export function PermMatrix({
  value, onChange, locked = [], disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  // Permissions the person already has from somewhere else — their role, when this matrix is
  // editing the grants on top of it. Shown ticked and unclickable, because unticking one here
  // would look like it revoked something and it cannot: grants only ever add.
  locked?: string[];
  disabled?: boolean;
}) {
  const { t } = useLang();
  const held = new Set(value);
  const fixed = new Set(locked);

  const toggle = (p: Permission) => {
    if (disabled || fixed.has(p)) return;
    onChange(held.has(p) ? value.filter((x) => x !== p) : [...value, p]);
  };

  return (
    <div className="flex flex-col gap-3.5">
      {PERM_GROUPS.map((g) => (
        <div key={g.titleKey}>
          <div className="pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            {t(g.titleKey)}
          </div>
          <div className="overflow-hidden rounded-[10px] border border-border">
            {g.perms.map((p, i) => {
              const on = held.has(p) || fixed.has(p);
              const isFixed = fixed.has(p);
              return (
                <button
                  key={p} type="button" onClick={() => toggle(p)} disabled={disabled || isFixed}
                  aria-pressed={on}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
                    i > 0 && "border-t border-border",
                    on ? "bg-success-soft/40" : "bg-card",
                    !disabled && !isFixed && "hover:bg-secondary",
                    (disabled || isFixed) && "cursor-default",
                  )}
                >
                  <span className={cn(
                    "mt-[1px] grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors",
                    on ? "border-success bg-success text-white" : "border-border bg-card",
                  )}>
                    {on && <Check className="size-3" strokeWidth={3.5} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13.5px] font-semibold text-foreground">{t(permLabel(p))}</span>
                      {isFixed && (
                        <span className="rounded-full bg-secondary px-1.5 py-[1px] text-[10.5px] font-bold text-muted-foreground">
                          {t("perm_from_role")}
                        </span>
                      )}
                    </span>
                    <span className="block text-[12px] leading-snug text-muted-foreground">{t(permHint(p))}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
