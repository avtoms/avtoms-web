"use client";
// Shared owner-console building blocks, rebuilt on the shadcn/ui kit. Same export API as
// before (SecTitle / Row / StatCard / WORow / PaidBadge) so every page keeps working; only
// the presentation is upgraded. These render inside `.app-scope` (owner layout), so Tailwind
// utilities + theme tokens apply.
import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Icon } from "@/components/icons";
import { Badge as KitBadge } from "@/components/ui-kit/badge";
import { useT } from "@/components/providers";
import { useIsMobile } from "@/components/ui";
import { money, num, orderLabel, vehicleTitle } from "@/lib/format";
import { woStateFromProto } from "@/lib/enums";
import { StateBadge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { WorkOrder } from "@/lib/types";

export function SecTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2.5">
      <h3 className="min-w-0 truncate text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{children}</h3>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function Row({ label, value, mono, strong }: { label: React.ReactNode; value: React.ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className={cn("text-[14px] text-ink-2", strong ? "font-bold" : "font-medium")}>{label}</span>
      <span className={cn(
        "text-foreground",
        strong ? "text-[17px] font-extrabold tracking-[-0.02em]" : "text-[14.5px] font-semibold",
        mono && "font-mono",
      )}>{value}</span>
    </div>
  );
}

type StatTone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";
const TONE_TEXT: Record<StatTone, string> = {
  neutral: "text-foreground", accent: "text-primary-emphasis", ok: "text-success",
  warn: "text-warning", danger: "text-destructive", info: "text-info",
};
const TONE_CHIP: Record<StatTone, string> = {
  neutral: "bg-secondary text-muted-foreground", accent: "bg-primary-soft text-primary-emphasis",
  ok: "bg-success-soft text-success", warn: "bg-warning-soft text-warning",
  danger: "bg-destructive-soft text-destructive", info: "bg-info-soft text-info",
};

// Shrink the value font by character count so long money sums (e.g. "48 500 000") stay fully
// visible in a narrow card instead of being clipped (mirrors the original StatCard behaviour).
function statCap(value: React.ReactNode, big?: boolean): number {
  const len = typeof value === "string" ? value.length : typeof value === "number" ? String(value).length : 0;
  const base = big ? 30 : 26;
  if (len > 12) return Math.round(base * 0.55);
  if (len > 9) return Math.round(base * 0.66);
  if (len > 7) return Math.round(base * 0.8);
  return base;
}

// Keeps the label/value/sub/icon(string)/tone/big/onClick API of the original StatCard, so
// every existing caller works unchanged — only the styling is upgraded.
export function StatCard({
  label, value, sub, icon, tone = "neutral", big, onClick,
}: {
  label: string; value: React.ReactNode; sub?: string; icon?: string;
  tone?: StatTone; big?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4 shadow-[var(--shadow)]",
        onClick && "cursor-pointer transition-shadow hover:shadow-[var(--shadow-lg)]",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
        {icon && (
          <div className={cn("grid size-9 place-items-center rounded-[10px]", TONE_CHIP[tone])}>
            <Icon name={icon} size={18} />
          </div>
        )}
      </div>
      <div
        className={cn("min-w-0 truncate font-extrabold leading-none tracking-[-0.03em]", TONE_TEXT[tone], big ? "font-mono" : "")}
        style={{ fontSize: `clamp(15px, 4.4vw, ${statCap(value, big)}px)` }}
      >
        {value}
      </div>
      {sub && <div className="-mt-1 text-[12.5px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// Work-order list row — identity is the car (plate · make model), client secondary.
export function WORow({ wo }: { wo: WorkOrder }) {
  const t = useT();
  const isMobile = useIsMobile();
  const state = woStateFromProto(wo.state);
  const total = num(wo.total);
  const created = wo.createdAt ? new Date(wo.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";
  const title = vehicleTitle(wo) || t("work_order");
  return (
    <Link href={`/work-orders/${wo.id}`} className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-secondary/60 sm:px-5">
      <div className="flex w-14 shrink-0 flex-col gap-0.5">
        <span className="font-mono text-[13.5px] font-bold text-foreground">{orderLabel(wo)}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{created}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-bold tracking-[-0.01em] text-foreground">{title}</div>
        <div className="flex gap-2 text-[12px] text-muted-foreground">
          {wo.customerName && <span className="truncate">{wo.customerName}</span>}
          {isMobile && <span className="ml-auto shrink-0 font-mono font-bold text-ink-2">{money(total)}</span>}
        </div>
      </div>
      {!isMobile && <span className="shrink-0 font-mono text-[13px] font-bold text-ink-2">{money(total)}</span>}
      <StateBadge state={state} style={{ flexShrink: 0 }} />
      {!isMobile && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
    </Link>
  );
}

export function PaidBadge({ paid }: { paid?: boolean }) {
  const t = useT();
  return <KitBadge tone={paid ? "ok" : "neutral"} dot>{paid ? t("paid") : t("unpaid")}</KitBadge>;
}
