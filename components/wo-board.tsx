"use client";
// Shared work-order board: column buckets, drag-and-drop between columns, a per-card
// "move to" dropdown, and a mobile column switcher. Used by both the mechanic shop-floor
// board (app/m) and the owner pipeline board (app/(owner)/work-orders).
// The owner of *what a move means* (timers, valid transitions) stays with the caller via
// onMove — this component only renders and routes drag/click intents.
import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, ClipboardList, Timer } from "lucide-react";
import { useIsMobile } from "@/components/ui";
import { useLang } from "@/components/providers";
import { woStateFromProto, kindFromProto, kindIsMaterial, lineStatusFromProto, STATE_LABEL, TRANSITIONS, type WoState } from "@/lib/enums";
import { PlatePreview } from "@/components/plate";
import { CarImage } from "@/components/car-image";
import { money, num, orderLabel, shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkOrder } from "@/lib/types";

export type Tone = "accent" | "warn" | "ok";
export type ColDef = { key: WoState; label: string; tone: Tone; accent: string; soft: string };

// Live ticking elapsed time (mm:ss or h:mm:ss) since a timer's start, refreshing each second.
function useElapsedLabel(startedAt?: string): string | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [startedAt]);
  if (!startedAt) return null;
  const secs = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Share of the order's service lines that are finished. Returns null when the order was
// loaded without its line items (the owner board lists heads only), so the bar is shown
// only where it means something.
function serviceProgress(wo: WorkOrder): { done: number; total: number } | null {
  const lines = (wo.lineItems || []).filter((li) => !kindIsMaterial(kindFromProto(li.kind)));
  if (lines.length === 0) return null;
  return { done: lines.filter((li) => lineStatusFromProto(li.status) === "done").length, total: lines.length };
}

type MoveTarget = { key: WoState; label: string; accent: string };

// ── per-card status dropdown ──
// `targets` are the LEGAL next states for this card (driven by the state machine, not the
// board layout) so the menu never offers an illegal move and can reach off-board states
// like Closed/Canceled. The button shows the current state styled by its column.
function StatusMenu({ currentCol, targets, onMove, disabled }: {
  currentCol: ColDef; targets: MoveTarget[]; onMove: (s: WoState) => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dead = disabled || targets.length === 0;
  return (
    <div className="relative max-w-full shrink-0">
      <button
        disabled={dead}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap outline-none",
          dead ? "cursor-default" : "cursor-pointer hover:brightness-[0.97]",
        )}
        style={{ background: currentCol.soft, color: currentCol.accent }}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-current" />
        <span className="truncate">{currentCol.label}</span>
        {targets.length > 0 && <ChevronDown className="size-3 shrink-0" />}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-[90]" />
          <div className="an-modal-in absolute left-0 top-[calc(100%+6px)] z-[91] min-w-[180px] rounded-[12px] border border-border bg-card p-1.5 shadow-[var(--shadow-lg)]">
            {targets.map((tg) => (
              <button
                key={tg.key}
                onClick={() => { setOpen(false); onMove(tg.key); }}
                className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13.5px] font-semibold text-foreground outline-none hover:bg-secondary"
              >
                <span className="size-2 rounded-full" style={{ background: tg.accent }} />
                {tg.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── work-order card ──
function WOCard({ wo, col, targets, busy, dragging, t, onOpen, onMove, onDragStart, onDragEnd }: {
  wo: WorkOrder; col: ColDef; targets: MoveTarget[]; busy: boolean; dragging: boolean;
  t: (k: string) => string;
  onOpen: () => void; onMove: (s: WoState) => void;
  onDragStart: () => void; onDragEnd: () => void;
}) {
  const running = col.key === "in_progress";
  const elapsed = useElapsedLabel(running ? wo.activeTimerStartedAt : undefined);
  const prog = serviceProgress(wo);
  const pct = prog ? Math.round((prog.done / prog.total) * 100) : 0;
  const customer = wo.customerName || "";
  const initial = customer.trim().charAt(0).toUpperCase();

  return (
    <div
      draggable={!busy}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", wo.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      className={cn(
        "an-card-hover relative flex flex-col gap-2.5 rounded-[14px] border border-border bg-card py-3.5 pl-4 pr-3.5",
        "transition-[box-shadow,opacity,transform] duration-100",
        dragging ? "cursor-grabbing opacity-50 shadow-[var(--shadow-lg)]" : busy ? "cursor-wait opacity-70 shadow-[var(--shadow)]" : "cursor-grab shadow-[var(--shadow)]",
      )}
    >
      {/* accent bar — rounded to match the card so no overflow:hidden is needed (which would
          clip the status dropdown) */}
      <span className="absolute inset-y-0 left-0 w-1 rounded-l-[14px]" style={{ background: col.accent }} />

      {/* order number ←→ status control */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[12px] font-bold text-muted-foreground">
          <ClipboardList className="size-3.5 shrink-0" />
          <span className="truncate">{orderLabel(wo)}</span>
        </span>
        <StatusMenu currentCol={col} targets={targets} onMove={onMove} disabled={busy} />
      </div>

      {/* vehicle — the make's logo makes a card recognisable at a glance; CarImage falls back
          to a brand monogram, then the car glyph, keeping this column's tint either way */}
      <div className="flex items-center gap-2.5">
        <CarImage src={wo.vehicleImageUrl} make={wo.make} size={38} radius={10} bg={col.soft} fg={col.accent} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <div className="w-full truncate text-[14px] font-bold tracking-[-0.01em] text-foreground">
            {[wo.make, wo.model].filter(Boolean).join(" ") || t("vehicle")}
          </div>
          {wo.plate && <PlatePreview plate={wo.plate} size="sm" />}
        </div>
      </div>

      {/* how far this order's services have got — hidden once everything is finished */}
      {prog && pct < 100 && (
        <div className="flex items-center gap-2">
          <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct}%`, background: col.accent }} />
          </div>
          <span className="font-mono text-[11px] font-bold text-muted-foreground">{pct}%</span>
        </div>
      )}

      {/* customer ←→ price */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-[9px] font-extrabold text-primary-emphasis">{initial || "—"}</span>
          <span className="truncate">{customer || "—"}</span>
        </span>
        <span className="shrink-0 font-mono text-[13.5px] font-extrabold text-foreground">{money(num(wo.total))}</span>
      </div>

      {/* footer: what is happening now ←→ open */}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
        {running && elapsed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2 py-1 font-mono text-[11.5px] font-bold text-warning">
            <span className="an-pulse size-1.5 rounded-full bg-current" />
            <Timer className="size-3.5" />
            {elapsed}
          </span>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" />
            <span className="truncate">{shortDateTime(wo.createdAt)}</span>
          </span>
        )}
        <button
          onClick={onOpen}
          className="inline-flex shrink-0 items-center gap-0.5 text-[12.5px] font-bold text-primary-emphasis outline-none hover:underline"
        >
          {t("open")} <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// WorkOrderBoard renders the column buckets for the given orders. onMove fires when a card
// is dragged to another column or a target is chosen from its status dropdown; the caller
// decides what a transition means (and whether to reload). Orders whose state is not one of
// `cols` are simply not shown (the board is the active pipeline; archives live in the list).
export function WorkOrderBoard({ orders, cols, busyId, onMove, onOpen, hint, emptyLabel, moveTargets }: {
  orders: WorkOrder[];
  cols: ColDef[];
  busyId: string | null;
  onMove: (woId: string, target: WoState) => void;
  onOpen: (woId: string) => void;
  hint?: string;
  emptyLabel: string;
  // Legal move targets for a card's current state. Defaults to the on-board columns that
  // the state machine permits; pass a wider set (e.g. the full TRANSITIONS, including
  // off-board Closed/Canceled) for the owner board.
  moveTargets?: (current: WoState) => WoState[];
}) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const [col, setCol] = useState<WoState>(cols[0]?.key);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<WoState | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const byState = (s: WoState) => orders.filter((w) => woStateFromProto(w.state) === s);

  // Resolve a card's move targets into labelled, coloured options. An on-board target keeps
  // its column colour; an off-board one (Closed/Canceled) falls back to a neutral chip.
  const defaultTargets = (cur: WoState) => cols.map((c) => c.key).filter((k) => k !== cur && (TRANSITIONS[cur] || []).includes(k));
  const resolveTargets = moveTargets ?? defaultTargets;
  const targetsFor = (cur: WoState): MoveTarget[] => resolveTargets(cur).map((k) => {
    const c = cols.find((x) => x.key === k);
    return { key: k, label: c?.label ?? t(STATE_LABEL[k]), accent: c?.accent ?? "var(--ink-2)" };
  });
  const startDrag = (id: string) => { dragIdRef.current = id; setDragId(id); };
  const endDrag = () => { dragIdRef.current = null; setDragId(null); setOverCol(null); };
  const dropOn = (target: WoState) => { const id = dragIdRef.current; setOverCol(null); if (id) onMove(id, target); };

  const cardProps = (w: WorkOrder, c: ColDef) => ({
    wo: w, col: c, targets: targetsFor(c.key), busy: busyId === w.id, t,
    onOpen: () => onOpen(w.id), onMove: (s: WoState) => onMove(w.id, s),
  });

  // ── mobile: column switcher + stacked cards ──
  if (isMobile) {
    const active = cols.find((c) => c.key === col) ? col : cols[0]?.key;
    const items = byState(active);
    return (
      <div className="flex flex-col gap-3.5">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {cols.map((c) => {
            const on = c.key === active;
            return (
              <button
                key={c.key}
                onClick={() => setCol(c.key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-[10px] px-3 py-2 text-[13px] font-bold outline-none transition-colors",
                  on ? "" : "border border-border bg-card text-muted-foreground",
                )}
                style={on ? { background: c.soft, color: c.accent } : undefined}
              >
                <span className="size-2 rounded-full" style={{ background: on ? "currentColor" : c.accent }} />
                {c.label}
                <span className="rounded-full bg-card/70 px-1.5 font-mono text-[11.5px]">{byState(c.key).length}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2.5">
          {items.length === 0 ? (
            <div className="py-8 text-center text-[14px] text-muted-foreground">{emptyLabel}</div>
          ) : items.map((w) => {
            const c = cols.find((x) => x.key === woStateFromProto(w.state))!;
            return <WOCard key={w.id} {...cardProps(w, c)} dragging={false} onDragStart={() => {}} onDragEnd={() => {}} />;
          })}
        </div>
      </div>
    );
  }

  // ── desktop: board with drag & drop; scrolls horizontally when columns are many ──
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto pb-1">
        {/* A few columns (the mechanic's three) share the full width; many columns (the owner's
            eight) hold the 260px floor and let the row scroll instead of squeezing the cards. */}
        <div className="grid items-start gap-4" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(260px, 1fr))` }}>
          {cols.map((c) => {
            const items = byState(c.key);
            const isOver = overCol === c.key;
            return (
              <div
                key={c.key}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overCol !== c.key) setOverCol(c.key); }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null); }}
                onDrop={(e) => { e.preventDefault(); dropOn(c.key); }}
                className="flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between rounded-[12px] px-3.5 py-2.5" style={{ background: c.soft, color: c.accent }}>
                  <span className="inline-flex items-center gap-2 text-[13.5px] font-bold tracking-[-0.01em]">
                    <span className="size-2 rounded-full bg-current" /> {c.label}
                  </span>
                  <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-card px-1.5 font-mono text-[12.5px] font-extrabold" style={{ color: c.accent }}>
                    {items.length}
                  </span>
                </div>
                <div
                  className={cn(
                    "flex min-h-[120px] flex-col gap-2.5 rounded-[14px] p-2.5 outline-2 outline-dashed transition-colors duration-100",
                    isOver ? "" : "bg-secondary/60 outline-transparent",
                  )}
                  style={isOver ? { background: c.soft, outlineColor: c.accent } : undefined}
                >
                  {items.length === 0 ? (
                    <div className="py-6 text-center text-[12.5px] font-medium text-muted-foreground">
                      {isOver ? t("drop_here") : emptyLabel}
                    </div>
                  ) : items.map((w) => (
                    <WOCard key={w.id} {...cardProps(w, c)} dragging={dragId === w.id} onDragStart={() => startDrag(w.id)} onDragEnd={endDrag} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {hint && <div className="text-center text-[12px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
