import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "primary" | "info" | "warn" | "ok" | "neutral";

const TONE: Record<StatTone, string> = {
  primary: "bg-primary-soft text-primary-emphasis",
  info: "bg-info-soft text-info",
  warn: "bg-warning-soft text-warning",
  ok: "bg-success-soft text-success",
  neutral: "bg-secondary text-muted-foreground",
};

export function StatCard({
  icon: Icon, tone = "neutral", value, label, sub, className,
}: { icon: LucideIcon; tone?: StatTone; value: React.ReactNode; label: string; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3.5 rounded-[14px] border border-border bg-card p-4 shadow-[var(--shadow)]", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className={cn("grid size-10 place-items-center rounded-[11px]", TONE[tone])}>
          <Icon className="size-[21px]" />
        </div>
        {sub && <div className="text-right text-[12px] font-semibold leading-tight text-muted-foreground">{sub}</div>}
      </div>
      <div>
        <div className="text-[28px] font-extrabold leading-none tracking-[-0.03em] text-foreground">{value}</div>
        <div className="mt-1.5 text-[13px] font-semibold text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
