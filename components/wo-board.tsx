"use client";
// Shared Jira-style work-order board: column buckets, drag-and-drop between columns,
// a per-card "move to" dropdown, and a mobile column switcher. Used by both the mechanic
// shop-floor board (app/m) and the owner pipeline board (app/(owner)/work-orders).
// The owner of *what a move means* (timers, valid transitions) stays with the caller via
// onMove — this component only renders and routes drag/click intents.
import React, { useEffect, useRef, useState } from "react";
import { Segmented, useIsMobile } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useLang } from "@/components/providers";
import { woStateFromProto, STATE_LABEL, TRANSITIONS, type WoState } from "@/lib/enums";
import { PlatePreview } from "@/components/plate";
import { money, num, orderLabel } from "@/lib/format";
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

type MoveTarget = { key: WoState; label: string; accent: string };

// ── per-card status dropdown (Jira-style "move to") ──
// `targets` are the LEGAL next states for this card (driven by the state machine, not the
// board layout) so the menu never offers an illegal move and can reach off-board states
// like Closed/Canceled. The button shows the current state styled by its column.
function StatusMenu({ currentCol, targets, onMove, disabled }: {
  currentCol: ColDef; targets: MoveTarget[]; onMove: (s: WoState) => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dead = disabled || targets.length === 0;
  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <button disabled={dead} onClick={() => setOpen((o) => !o)} className="an-btn" style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 999, maxWidth: "100%",
        border: "1px solid var(--line)", background: currentCol.soft, color: currentCol.accent,
        cursor: dead ? "default" : "pointer", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 700,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: "currentColor", flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentCol.label}</span>
        {targets.length > 0 && <Icon name="chevD" size={13} style={{ flexShrink: 0 }} />}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
          <div className="an-modal-in" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 91, minWidth: 180, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)", padding: 6 }}>
            {targets.map((tg) => (
              <button key={tg.key} onClick={() => { setOpen(false); onMove(tg.key); }} className="an-row-btn" style={{
                display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px", border: "none",
                background: "transparent", color: "var(--ink)", cursor: "pointer",
                borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 13.5, textAlign: "left",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: tg.accent }} />
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
  wo: WorkOrder; col: ColDef; targets: MoveTarget[]; busy: boolean; dragging: boolean; t: (k: string) => string;
  onOpen: () => void; onMove: (s: WoState) => void;
  onDragStart: () => void; onDragEnd: () => void;
}) {
  const total = num(wo.total);
  const shortId = orderLabel(wo);
  const running = col.key === "in_progress";
  const elapsed = useElapsedLabel(running ? wo.activeTimerStartedAt : undefined);
  return (
    <div
      draggable={!busy}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", wo.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      style={{
        position: "relative", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)",
        boxShadow: dragging ? "var(--shadow-lg)" : "var(--shadow)", padding: "13px 14px 13px 16px", cursor: busy ? "wait" : "grab",
        opacity: dragging ? 0.5 : busy ? 0.7 : 1, transition: "box-shadow .12s, opacity .12s, transform .08s",
      }}
      className="an-card-hover"
    >
      {/* accent bar — rounded to match the card so no overflow:hidden is needed (keeps the status dropdown un-clipped) */}
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: col.accent, borderTopLeftRadius: "var(--radius)", borderBottomLeftRadius: "var(--radius)" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 11 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink-2)", fontSize: 12.5 }}>
          <Icon name="clipboard" size={14} style={{ color: "var(--ink-3)" }} /> {shortId}
        </span>
        {running && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--warn)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", background: "var(--warn-soft)", padding: "3px 8px", borderRadius: 999 }}>
            <span className="an-pulse" style={{ width: 7, height: 7, borderRadius: 99, background: "currentColor" }} />
            <Icon name="clock" size={13} />
            {elapsed ?? t("timer_running")}
          </span>
        )}
      </div>

      {/* vehicle: make/model + plate. Plate gets its own row so it has the full card width
          (it's a fixed-size element and would overflow a narrow flex column otherwise). */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 9 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: col.soft, color: col.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="car" size={21} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[wo.make, wo.model].filter(Boolean).join(" ") || t("vehicle")}
          </div>
        </div>
      </div>
      {wo.plate && (
        <div style={{ minWidth: 0, marginBottom: 9 }}><PlatePreview plate={wo.plate} size="sm" /></div>
      )}

      {/* customer + total */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, color: "var(--ink-2)", fontSize: 12.5 }}>
          <Icon name="users" size={14} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wo.customerName || "—"}</span>
        </span>
        <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(14px * var(--scale))", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
          {money(total)} <span style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-3)" }}>{t("soum")}</span>
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
        <StatusMenu currentCol={col} targets={targets} onMove={onMove} disabled={busy} />
        <button onClick={onOpen} className="an-btn" style={{
          display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: "var(--radius-sm)", flexShrink: 0,
          border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer",
          fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 12.5,
        }}>
          {t("open")} <Icon name="chevR" size={14} />
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

  // ── mobile: column switcher + stacked cards ──
  if (isMobile) {
    const active = cols.find((c) => c.key === col) ? col : cols[0]?.key;
    const items = byState(active);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ overflowX: "auto" }}>
          <Segmented options={cols.map((c) => ({ value: c.key, label: `${c.label} · ${byState(c.key).length}` }))} value={active} onChange={(v) => setCol(v as WoState)} size="sm" style={{ flexWrap: "nowrap" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {items.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>{emptyLabel}</div>
          ) : items.map((w) => {
            const c = cols.find((x) => x.key === woStateFromProto(w.state))!;
            return <WOCard key={w.id} wo={w} col={c} targets={targetsFor(c.key)} busy={busyId === w.id} dragging={false} t={t} onOpen={() => onOpen(w.id)} onMove={(s) => onMove(w.id, s)} onDragStart={() => {}} onDragEnd={() => {}} />;
          })}
        </div>
      </div>
    );
  }

  // ── desktop: Jira-style board with drag & drop; scrolls horizontally when columns are many ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        {/* Cap column width (max 300px) so cards don't balloon on wide screens; the 230px
            floor lets the row scroll horizontally only when the viewport is genuinely narrow. */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length}, minmax(230px, 300px))`, gap: 16, alignItems: "start", justifyContent: "start" }}>
          {cols.map((c) => {
            const items = byState(c.key);
            const isOver = overCol === c.key;
            return (
              <div
                key={c.key}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overCol !== c.key) setOverCol(c.key); }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null); }}
                onDrop={(e) => { e.preventDefault(); dropOn(c.key); }}
                style={{ display: "flex", flexDirection: "column", gap: 11 }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: "var(--radius-sm)", background: c.soft, color: c.accent }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13.5, letterSpacing: "-0.01em" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: "currentColor" }} /> {c.label}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 13, minWidth: 22, height: 22, borderRadius: 999, background: "var(--surface)", color: c.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 7px" }}>{items.length}</span>
                </div>
                <div style={{
                  display: "flex", flexDirection: "column", gap: 11, minHeight: 120, borderRadius: "var(--radius)",
                  padding: 11, background: isOver ? c.soft : "var(--surface-2)",
                  outline: isOver ? `2px dashed ${c.accent}` : "2px dashed transparent", transition: "background .12s, outline-color .12s",
                }}>
                  {items.length === 0 ? (
                    <div style={{ padding: "26px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 12.5, fontWeight: 500 }}>
                      {isOver ? t("drop_here") : emptyLabel}
                    </div>
                  ) : items.map((w) => (
                    <WOCard key={w.id} wo={w} col={c} targets={targetsFor(c.key)} busy={busyId === w.id} dragging={dragId === w.id} t={t} onOpen={() => onOpen(w.id)} onMove={(s) => onMove(w.id, s)} onDragStart={() => startDrag(w.id)} onDragEnd={endDrag} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center" }}>{hint}</div>
      )}
    </div>
  );
}
