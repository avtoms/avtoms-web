"use client";
// Shared work-order board: column buckets, drag-and-drop between columns, a per-card
// "move to" menu, and a mobile column switcher. Used by both the mechanic shop-floor
// board (app/m) and the owner pipeline board (app/(owner)/work-orders).
// The owner of *what a move means* (timers, valid transitions) stays with the caller via
// onMove — this component only renders and routes drag/click intents.
//
// The owner board hands over a little more per card: who is on the job, a badge when it has
// been waiting too long, a line of context, and the one button that moves the order on (bill
// it, take the payment). It also folds the finished states into a narrow rail on the right,
// so the live queue gets the width and the archive is one click away rather than gone.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Timer } from "lucide-react";
import { useIsMobile } from "@/components/ui";
import { useLang } from "@/components/providers";
import { woStateFromProto, kindFromProto, kindIsMaterial, lineStatusFromProto, STATE_LABEL, TRANSITIONS, type WoState } from "@/lib/enums";
import { PlatePreview } from "@/components/plate";
import { money, num, orderLabel, shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkOrder } from "@/lib/types";

export type Tone = "accent" | "warn" | "ok";
export type ColDef = { key: WoState; label: string; tone: Tone; accent: string; soft: string };

// What the caller adds to a card. Everything is optional: the mechanic board passes none of it.
export type CardExtras = {
  mechanicId?: string;
  mechanicName?: string;
  badge?: { tone: "warn" | "danger" | "ok" | "neutral"; label: string } | null;
  meta?: string;
  action?: React.ReactNode;
};

const BADGE: Record<NonNullable<CardExtras["badge"]>["tone"], string> = {
  warn: "bg-warning-soft text-warning",
  danger: "bg-destructive-soft text-destructive",
  ok: "bg-success-soft text-success",
  neutral: "bg-secondary text-ink-2",
};

// The same colour per person on every screen, so a board is read by colour before names.
const STAFF_COLORS = ["#0f9488", "#8b5cf6", "#d97706", "#2563eb", "#db2777", "#16a34a", "#dc2626", "#0891b2"];
function staffColor(id?: string): string {
  if (!id) return "var(--ink-3)";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return STAFF_COLORS[h % STAFF_COLORS.length];
}

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

// ── per-card status menu ──
// `targets` are the LEGAL next states for this card (driven by the state machine, not the
// board layout) so the menu never offers an illegal move and can reach off-board states
// like Closed/Canceled. Full form: a pill naming the current state. Compact form (owner
// board): a small "…" button, because there the column already says what state the card is in.
function StatusMenu({ currentCol, targets, onMove, disabled, compact, label }: {
  currentCol: ColDef; targets: MoveTarget[]; onMove: (s: WoState) => void; disabled: boolean; compact?: boolean; label: string;
}) {
  const [open, setOpen] = useState(false);
  const dead = disabled || targets.length === 0;
  if (compact && targets.length === 0) return null;
  return (
    <div className="relative max-w-full shrink-0" onClick={(e) => e.stopPropagation()}>
      {compact ? (
        <button
          disabled={dead}
          aria-label={label}
          title={label}
          onClick={() => setOpen((o) => !o)}
          className="-mr-1 grid size-7 touch:size-11 place-items-center rounded-[7px] text-muted-foreground outline-none hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          <MoreHorizontal className="size-4" />
        </button>
      ) : (
        <button
          disabled={dead}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap outline-none",
            dead ? "cursor-default" : "cursor-pointer hover:brightness-[0.97]",
            // A status pill is a badge as much as a button, so it keeps its shape and takes its
            // 44px from an invisible ::after — padding here would turn every card's badge into a
            // slab. Not applied when it is dead: there is nothing to press.
            !dead && "touch:relative touch:after:absolute touch:after:-inset-y-3 touch:after:inset-x-0 touch:after:content-['']",
          )}
          style={{ background: currentCol.soft, color: currentCol.accent }}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-current" />
          <span className="truncate">{currentCol.label}</span>
          {targets.length > 0 && <ChevronDown className="size-3 shrink-0" />}
        </button>
      )}
      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-[90]" />
          <div className={cn("an-modal-in absolute top-[calc(100%+6px)] z-[91] min-w-[180px] rounded-[12px] border border-border bg-card p-1.5 shadow-[var(--shadow-lg)]", compact ? "right-0" : "left-0")}>
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
function WOCard({ wo, col, targets, busy, dragging, t, onOpen, onMove, onDragStart, onDragEnd, extras, compactMenu }: {
  wo: WorkOrder; col: ColDef; targets: MoveTarget[]; busy: boolean; dragging: boolean;
  t: (k: string) => string;
  onOpen: () => void; onMove: (s: WoState) => void;
  onDragStart: () => void; onDragEnd: () => void;
  extras?: CardExtras; compactMenu?: boolean;
}) {
  const running = col.key === "in_progress";
  const elapsed = useElapsedLabel(running ? wo.activeTimerStartedAt : undefined);
  const prog = serviceProgress(wo);
  const pct = prog ? Math.round((prog.done / prog.total) * 100) : 0;
  const car = [wo.make, wo.model].filter(Boolean).join(" ");
  const badge = extras?.badge;
  const mech = extras?.mechanicName;

  return (
    <div
      draggable={!busy}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", wo.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className={cn(
        "an-card-hover relative flex flex-col gap-2 rounded-[12px] border bg-card p-3.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
        "transition-[box-shadow,opacity,transform] duration-100",
        badge?.tone === "danger" ? "border-destructive/45" : badge?.tone === "warn" ? "border-warning/55" : "border-border",
        dragging ? "cursor-grabbing opacity-50 shadow-[var(--shadow-lg)]" : busy ? "cursor-wait opacity-70 shadow-[var(--shadow)]" : "cursor-pointer shadow-[var(--shadow)]",
      )}
    >
      {/* number ←→ who is on it. The number is what people read out to each other, so it
          always gets the room; the reason to look at the card sits on its own line below. */}
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="shrink-0 font-mono text-[12.5px] font-semibold text-muted-foreground">{orderLabel(wo)}</span>
        <div className="flex min-w-0 items-center gap-1.5">
          {extras?.mechanicId ? (
            <span title={mech} className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: staffColor(extras.mechanicId) }}>
              {(mech || "?").charAt(0).toUpperCase()}
            </span>
          ) : null}
          {compactMenu ? (
            <StatusMenu currentCol={col} targets={targets} onMove={onMove} disabled={busy} compact label={t("wo_move")} />
          ) : null}
        </div>
      </div>
      {badge && (
        <div className="-mt-1">
          <span className={cn("inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[11.5px] font-semibold", BADGE[badge.tone])}>{badge.label}</span>
        </div>
      )}
      {!compactMenu && (
        <div className="-mt-1"><StatusMenu currentCol={col} targets={targets} onMove={onMove} disabled={busy} label={t("wo_move")} /></div>
      )}

      {wo.plate && <div><PlatePreview plate={wo.plate} size="sm" /></div>}

      <div className="min-w-0">
        <div className="truncate text-[15px] font-bold tracking-[-0.01em] text-foreground">{car || t("vehicle")}</div>
        {wo.customerName && <div className="truncate text-[12.5px] text-muted-foreground">{wo.customerName}</div>}
      </div>

      {/* how far this order's services have got */}
      {prog && (
        <div className="flex flex-col gap-1">
          <div className="h-[5px] overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct}%`, background: col.accent }} />
          </div>
        </div>
      )}

      {/* context ←→ price */}
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 text-[11.5px] leading-snug text-muted-foreground">
          {running && elapsed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 font-mono font-bold text-warning">
              <span className="an-pulse size-1.5 rounded-full bg-current" />
              <Timer className="size-3" />
              {elapsed}
            </span>
          ) : (
            <span className="line-clamp-2">
              {[prog ? `${prog.done}/${prog.total} ${t("jobs_short")}` : "", extras?.meta || shortDateTime(wo.createdAt)].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
        <span className="shrink-0 font-mono text-[14px] font-bold text-foreground">{money(num(wo.total))}</span>
      </div>

      {extras?.action && <div onClick={(e) => e.stopPropagation()}>{extras.action}</div>}
    </div>
  );
}

// WorkOrderBoard renders the column buckets for the given orders. onMove fires when a card
// is dragged to another column or a target is chosen from its status menu; the caller
// decides what a transition means (and whether to reload). Orders whose state is not one of
// `cols` are simply not shown (the board is the active pipeline; archives live in the list).
export function WorkOrderBoard({ orders, cols, busyId, onMove, onOpen, hint, emptyLabel, moveTargets, extras, compactMenu, rail, addTo }: {
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
  extras?: (wo: WorkOrder) => CardExtras;
  compactMenu?: boolean;
  // States folded into a narrow rail at the right edge until clicked open.
  rail?: { states: WoState[]; label: string };
  // A "+ add" button at the foot of one column (the owner board's drafts).
  addTo?: { state: WoState; label: string; onClick: () => void };
}) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const [col, setCol] = useState<WoState>(cols[0]?.key);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<WoState | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const dragIdRef = useRef<string | null>(null);

  // ── sideways scrolling that works with a mouse ──
  // A board wider than the screen scrolls sideways, and on a trackpad that is a two-finger
  // swipe. With a mouse it was only the scrollbar under the tallest column — usually below the
  // bottom of the window — so the right-hand columns were simply out of reach. Hence a second
  // scrollbar above the board kept in step with the real one, arrow buttons on whichever side
  // has more, and grabbing an empty part of the board to drag it along.
  const scroller = useRef<HTMLDivElement>(null);
  const topBar = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; left: number } | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false, width: 0 });
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const next = { left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4, width: el.scrollWidth };
    setEdges((p) => (p.left === next.left && p.right === next.right && p.width === next.width ? p : next));
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure, orders.length, cols.length, railOpen, isMobile]);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const p = pan.current, el = scroller.current;
      if (!p || !el) return;
      el.scrollLeft = p.left - (e.clientX - p.x);
    };
    const up = () => { if (pan.current) { pan.current = null; document.body.style.cursor = ""; } };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);
  const onBoardScroll = () => {
    measure();
    const el = scroller.current, bar = topBar.current;
    if (el && bar && bar.scrollLeft !== el.scrollLeft) bar.scrollLeft = el.scrollLeft;
  };
  const onTopScroll = () => {
    const el = scroller.current, bar = topBar.current;
    if (el && bar && el.scrollLeft !== bar.scrollLeft) el.scrollLeft = bar.scrollLeft;
  };
  const nudge = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * Math.max(260, el.clientWidth * 0.6), behavior: "smooth" });
  };
  // Grabbing the board itself — never a card (those drag between columns), a button or a field.
  const startPan = (e: React.MouseEvent) => {
    if (e.button !== 0 || (!edges.left && !edges.right)) return;
    if ((e.target as HTMLElement).closest('[draggable="true"],button,a,input,select,textarea,[role="button"]')) return;
    const el = scroller.current;
    if (!el) return;
    e.preventDefault();
    pan.current = { x: e.clientX, left: el.scrollLeft };
    document.body.style.cursor = "grabbing";
  };

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
    extras: extras?.(w), compactMenu,
  });

  const addButton = (c: ColDef) => addTo && addTo.state === c.key ? (
    <button onClick={addTo.onClick}
      className="flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-input py-2.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground">
      <Plus className="size-4" /> {addTo.label}
    </button>
  ) : null;

  // ── mobile: column switcher + stacked cards ──
  if (isMobile) {
    // One column is visible at a time here, so landing on an empty one is a dead end: the
    // screen says "no orders" while the orders sit a tap away in a column nobody can see. So
    // the chosen column holds only while it has something, and otherwise the first that does.
    const chosen = cols.find((c) => c.key === col) ? col : cols[0]?.key;
    const firstWithWork = cols.find((c) => byState(c.key).length > 0)?.key;
    const active = byState(chosen).length > 0 || !firstWithWork ? chosen : firstWithWork;
    const items = byState(active);
    const activeCol = cols.find((c) => c.key === active);
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
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-bold outline-none transition-colors",
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
          {activeCol && addButton(activeCol)}
        </div>
      </div>
    );
  }

  // ── desktop: board with drag & drop; scrolls horizontally when columns are many ──
  const railStates = rail?.states ?? [];
  const mainCols = railOpen ? cols : cols.filter((c) => !railStates.includes(c.key));
  const railCount = railStates.reduce((s, k) => s + byState(k).length, 0);
  const showRail = !!rail && !railOpen && cols.some((c) => railStates.includes(c.key));
  // An empty column on the owner board needs only room for its heading and a drop target, so
  // it gives its width to the columns that hold cards — which is often what lets the whole
  // board fit without scrolling at all.
  const template = mainCols.map((c) => {
    const empty = compactMenu && byState(c.key).length === 0 && addTo?.state !== c.key;
    return empty ? "minmax(168px, 0.55fr)" : `minmax(${compactMenu ? 210 : 260}px, 1fr)`;
  }).join(" ") + (showRail ? " 44px" : "");
  const overflowing = edges.left || edges.right;
  const fade = (side: "left" | "right") => ({
    background: `linear-gradient(to ${side === "left" ? "right" : "left"}, var(--bg), transparent)`,
  });

  return (
    <div className="flex flex-col gap-2">
      {overflowing && (
        <div ref={topBar} onScroll={onTopScroll} className="overflow-x-auto overflow-y-hidden" style={{ height: 12 }} aria-hidden>
          <div style={{ width: edges.width, height: 1 }} />
        </div>
      )}
      <div className="relative">
        {edges.left && <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10" style={fade("left")} />}
        {edges.right && <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10" style={fade("right")} />}
        {edges.left && (
          <button onClick={() => nudge(-1)} aria-label={t("back")}
            className="absolute -left-3 top-1 z-20 grid size-9 place-items-center rounded-full border border-border bg-card text-foreground shadow-[var(--shadow-lg)] hover:bg-secondary">
            <ChevronLeft className="size-5" />
          </button>
        )}
        {edges.right && (
          <button onClick={() => nudge(1)} aria-label={t("next")}
            className="absolute -right-3 top-1 z-20 grid size-9 place-items-center rounded-full border border-border bg-card text-foreground shadow-[var(--shadow-lg)] hover:bg-secondary">
            <ChevronRight className="size-5" />
          </button>
        )}
      <div ref={scroller} onScroll={onBoardScroll} onMouseDown={startPan} className={cn("overflow-x-auto pb-1", overflowing && "cursor-grab")}>
        <div className="grid items-start gap-3" style={{ gridTemplateColumns: template }}>
          {mainCols.map((c) => {
            const items = byState(c.key);
            const isOver = overCol === c.key;
            const inRail = railStates.includes(c.key);
            return (
              <div
                key={c.key}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overCol !== c.key) setOverCol(c.key); }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null); }}
                onDrop={(e) => { e.preventDefault(); dropOn(c.key); }}
                className="flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between gap-2 rounded-[10px] px-3 py-2" style={{ background: c.soft, color: c.accent }}>
                  <span className="inline-flex min-w-0 items-center gap-2 text-[13.5px] font-bold tracking-[-0.01em]">
                    <span className="size-2 shrink-0 rounded-full bg-current" /> <span className="truncate">{c.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="font-mono text-[12.5px] font-bold">{items.length}</span>
                    {inRail && (
                      <button onClick={() => setRailOpen(false)} aria-label={t("back")} className="grid size-6 place-items-center rounded-[6px] hover:bg-card/70">
                        <ChevronRight className="size-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                <div
                  className={cn(
                    "flex min-h-[120px] flex-col gap-2.5 rounded-[12px] p-2 outline-2 outline-dashed transition-colors duration-100",
                    isOver ? "" : "bg-secondary/60 outline-transparent",
                  )}
                  style={isOver ? { background: c.soft, outlineColor: c.accent } : undefined}
                >
                  {items.length === 0 && addTo?.state !== c.key ? (
                    <div className="py-6 text-center text-[12.5px] font-medium text-muted-foreground">
                      {isOver ? t("drop_here") : emptyLabel}
                    </div>
                  ) : items.map((w) => (
                    <WOCard key={w.id} {...cardProps(w, c)} dragging={dragId === w.id} onDragStart={() => startDrag(w.id)} onDragEnd={endDrag} />
                  ))}
                  {addButton(c)}
                </div>
              </div>
            );
          })}
          {showRail && (
            <button
              onClick={() => setRailOpen(true)}
              title={rail!.label}
              className="flex min-h-[260px] flex-col items-center gap-3 rounded-[12px] bg-secondary/60 py-3 text-muted-foreground transition-colors hover:bg-secondary"
            >
              <span className="grid size-7 place-items-center rounded-[8px] bg-card shadow-[var(--shadow)]"><ChevronLeft className="size-4" /></span>
              <span className="rounded-full bg-success-soft px-1.5 font-mono text-[12px] font-bold text-success">{railCount}</span>
              <span className="text-[12.5px] font-semibold [writing-mode:vertical-rl]">{rail!.label}</span>
            </button>
          )}
        </div>
      </div>
      </div>
      {hint && <div className="text-center text-[12px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
