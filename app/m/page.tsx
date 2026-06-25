"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useLang, useToast } from "@/components/providers";
import { Badge, Segmented, Spinner, useIsMobile } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api, ApiError } from "@/lib/api";
import { woStateFromProto, type WoState } from "@/lib/enums";
import { money, num } from "@/lib/format";
import type { WorkOrder } from "@/lib/types";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));

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

type Tone = "accent" | "warn" | "ok";
type ColDef = { key: WoState; label: string; tone: Tone; accent: string; soft: string };

const COLS = (t: (k: string) => string): ColDef[] => [
  { key: "approved", label: t("kb_assigned"), tone: "accent", accent: "var(--accent)", soft: "var(--accent-soft)" },
  { key: "in_progress", label: t("kb_in_progress"), tone: "warn", accent: "var(--warn)", soft: "var(--warn-soft)" },
  { key: "ready", label: t("kb_ready"), tone: "ok", accent: "var(--ok)", soft: "var(--ok-soft)" },
];

// ── per-card status dropdown (Jira-style "move to") ──
function StatusMenu({ current, cols, onMove, disabled }: {
  current: WoState; cols: ColDef[]; onMove: (s: WoState) => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cur = cols.find((c) => c.key === current);
  return (
    <div style={{ position: "relative" }}>
      <button disabled={disabled} onClick={() => setOpen((o) => !o)} className="an-btn" style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 999,
        border: "1px solid var(--line)", background: cur?.soft ?? "var(--surface-2)", color: cur?.accent ?? "var(--ink-2)",
        cursor: disabled ? "default" : "pointer", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: "currentColor" }} />
        {cur?.label ?? current}
        <Icon name="chevD" size={13} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
          <div className="an-modal-in" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 91, minWidth: 180, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)", padding: 6 }}>
            {cols.map((c) => (
              <button key={c.key} onClick={() => { setOpen(false); if (c.key !== current) onMove(c.key); }} className="an-row-btn" style={{
                display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px", border: "none",
                background: c.key === current ? "var(--surface-2)" : "transparent", color: "var(--ink)", cursor: "pointer",
                borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 13.5, textAlign: "left",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: c.accent }} />
                {c.label}
                {c.key === current && <Icon name="check" size={14} style={{ marginLeft: "auto", color: "var(--ink-3)" }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── work-order card ──
function WOCard({ wo, col, cols, busy, dragging, t, mechName, onOpen, onMove, onDragStart, onDragEnd }: {
  wo: WorkOrder; col: ColDef; cols: ColDef[]; busy: boolean; dragging: boolean; t: (k: string) => string;
  mechName: string; onOpen: () => void; onMove: (s: WoState) => void;
  onDragStart: () => void; onDragEnd: () => void;
}) {
  const total = num(wo.total);
  const shortId = wo.id.slice(0, 8).toUpperCase();
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

      {/* vehicle: make/model + plate */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 9 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: col.soft, color: col.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="car" size={21} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[wo.make, wo.model].filter(Boolean).join(" ") || t("vehicle")}
          </div>
          {wo.plate && (
            <span style={{ display: "inline-block", marginTop: 3, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, color: "var(--ink-2)", background: "var(--surface-2)", border: "1px solid var(--line)", padding: "1px 7px", borderRadius: 6, letterSpacing: "0.03em" }}>{wo.plate}</span>
          )}
        </div>
      </div>

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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <StatusMenu current={col.key} cols={cols} onMove={onMove} disabled={busy} />
        <button onClick={onOpen} className="an-btn" style={{
          display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: "var(--radius-sm)",
          border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer",
          fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 12.5,
        }}>
          {t("open")} <Icon name="chevR" size={14} />
        </button>
      </div>
    </div>
  );
}

export default function MechanicBoardPage() {
  const { session } = useAuth();
  const { t } = useLang();
  const { toast } = useToast();
  const router = useRouter();
  const isMobile = useIsMobile();

  const mechanicId = session?.staff.id ?? "";
  const mechName = session?.staff.name ?? "";
  const shopId = session?.staff.shopId ?? "";

  const [orders, setOrders] = useState<WorkOrder[] | null>(null);
  const [col, setCol] = useState<WoState>("approved");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<WoState | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;
    try {
      setOrders(await api.listWorkOrders(shopId, undefined, mechanicId));
    } catch (e) {
      setOrders([]);
      toast(errMsg(e), { tone: "danger", icon: "alert" });
    }
  }, [shopId, mechanicId, toast]);

  useEffect(() => { void load(); }, [load]);

  const cols = COLS(t);
  const byState = (s: WoState) => (orders || []).filter((w) => woStateFromProto(w.state) === s);

  // Move a work order to a target column. Handles timer side-effects:
  // entering In Progress starts the timer; leaving it stops the timer.
  const moveTo = async (woId: string, target: WoState) => {
    const wo = (orders || []).find((w) => w.id === woId);
    if (!wo) return;
    const current = woStateFromProto(wo.state);
    if (current === target || busyId) return;
    setBusyId(woId);
    try {
      if (current === "in_progress" && target !== "in_progress") {
        try { await api.stopTimer(woId, mechanicId); } catch { /* may not be running */ }
      }
      await api.transition(woId, target);
      if (target === "in_progress" && current !== "in_progress") {
        try { await api.startTimer(woId, mechanicId); } catch { /* best effort */ }
      }
      toast(cols.find((c) => c.key === target)?.label || target, { icon: "check" });
      await load();
    } catch (e) {
      toast(errMsg(e), { tone: "danger", icon: "alert" });
    } finally {
      setBusyId(null);
    }
  };

  const openWO = (id: string) => router.push(`/m/wo/${id}`);
  const startDrag = (id: string) => { dragIdRef.current = id; setDragId(id); };
  const endDrag = () => { dragIdRef.current = null; setDragId(null); setOverCol(null); };
  const dropOn = (target: WoState) => { const id = dragIdRef.current; setOverCol(null); if (id) void moveTo(id, target); };

  if (orders === null) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={28} /></div>;
  }

  const total = orders.length;
  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div>
        <h2 style={{ margin: 0, fontSize: "calc(20px * var(--scale))", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.025em" }}>{t("my_jobs")}</h2>
        <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>{mechName}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {cols.map((c) => (
          <Badge key={c.key} tone={c.tone} dot>{c.label} · {byState(c.key).length}</Badge>
        ))}
      </div>
    </div>
  );

  // ── mobile: column switcher + stacked cards ──
  if (isMobile) {
    const items = byState(col);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {header}
        <div style={{ overflowX: "auto" }}>
          <Segmented options={cols.map((c) => ({ value: c.key, label: `${c.label} · ${byState(c.key).length}` }))} value={col} onChange={(v) => setCol(v as WoState)} size="sm" style={{ flexWrap: "nowrap" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {items.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>{t("no_jobs")}</div>
          ) : items.map((w) => {
            const c = cols.find((x) => x.key === woStateFromProto(w.state))!;
            return <WOCard key={w.id} wo={w} col={c} cols={cols} busy={busyId === w.id} dragging={false} t={t} mechName={mechName} onOpen={() => openWO(w.id)} onMove={(s) => void moveTo(w.id, s)} onDragStart={() => {}} onDragEnd={() => {}} />;
          })}
        </div>
      </div>
    );
  }

  // ── desktop: Jira-style 3-column board with drag & drop ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {header}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, alignItems: "start" }}>
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
                    {isOver ? t("drop_here") : t("no_jobs")}
                  </div>
                ) : items.map((w) => (
                  <WOCard key={w.id} wo={w} col={c} cols={cols} busy={busyId === w.id} dragging={dragId === w.id} t={t} mechName={mechName} onOpen={() => openWO(w.id)} onMove={(s) => void moveTo(w.id, s)} onDragStart={() => startDrag(w.id)} onDragEnd={endDrag} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center" }}>
        {t("board_hint")}
      </div>
    </div>
  );
}
