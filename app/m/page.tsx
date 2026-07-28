"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { useAuth, useLang, useToast } from "@/components/providers";
import { Card } from "@/components/ui-kit/card";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Skeleton } from "@/components/ui-kit/misc";
import { CreateWOModal } from "@/app/(owner)/_create-wo";
import { useAutoRefresh } from "@/lib/use-refresh";
import { api, ApiError } from "@/lib/api";
import { woStateFromProto, woStateToProto, kindFromProto, kindIsMaterial, lineStatusFromProto, lineStatusToProto, type WoState, type LineItemStatus } from "@/lib/enums";
import { money, num, orderLabel } from "@/lib/format";
import { WorkOrderBoard, type ColDef } from "@/components/wo-board";
import type { WorkOrder, LineItem } from "@/lib/types";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));

const COLS = (t: (k: string) => string): ColDef[] => [
  { key: "approved", label: t("kb_assigned"), tone: "accent", accent: "var(--accent)", soft: "var(--accent-soft)" },
  { key: "in_progress", label: t("kb_in_progress"), tone: "warn", accent: "var(--warn)", soft: "var(--warn-soft)" },
  { key: "ready", label: t("kb_ready"), tone: "ok", accent: "var(--ok)", soft: "var(--ok-soft)" },
];

// A headline number with its label. `tone` colours the value only — the card itself stays
// neutral so a row of them reads as one strip rather than four competing blocks.
function Stat({ label, value, suffix, tone }: { label: string; value: string; suffix?: string; tone?: "accent" | "warn" | "ok" }) {
  const color = tone === "warn" ? "text-warning" : tone === "ok" ? "text-success" : tone === "accent" ? "text-primary-emphasis" : "text-foreground";
  return (
    <Card className="gap-0.5 px-4 py-3.5">
      <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
      <span className={`font-mono text-[20px] font-extrabold tracking-[-0.02em] ${color}`}>
        {value}
        {suffix && <span className="ml-1 font-sans text-[12px] font-semibold text-muted-foreground">{suffix}</span>}
      </span>
    </Card>
  );
}

export default function MechanicBoardPage() {
  const { session } = useAuth();
  const { t } = useLang();
  const { toast } = useToast();
  const router = useRouter();

  const mechanicId = session?.staff.id ?? "";
  const shopId = session?.staff.shopId ?? "";

  const [orders, setOrders] = useState<WorkOrder[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Whether the owner granted this mechanic the create-orders capability. Read live from the
  // backend (not the login session) so a fresh grant shows up without re-logging in.
  const [canCreate, setCanCreate] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => { api.getMe().then((me) => setCanCreate(!!me.canCreateOrders)).catch(() => setCanCreate(false)); }, []);

  // Load the mechanic's orders WITH line items, so each card reflects the mechanic's own
  // progress (his services), not the shared order state.
  const load = useCallback(async () => {
    if (!shopId) return;
    try {
      const heads = await api.listWorkOrders(shopId, undefined, mechanicId);
      const full = await Promise.all(heads.map((h) => api.getWorkOrder(h.id).catch(() => h)));
      setOrders(full);
    } catch (e) {
      setOrders([]);
      toast(errMsg(e), { tone: "danger", icon: "alert" });
    }
  }, [shopId, mechanicId, toast]);

  useEffect(() => { void load(); }, [load]);
  // The board is the screen a mechanic leaves open all day while the office edits orders
  // behind him, so keep it current without a manual reload.
  useAutoRefresh(load, { intervalMs: 60000 });

  // The mechanic's own SERVICE lines on an order (his sub-work).
  const myLines = useCallback((wo: WorkOrder): LineItem[] =>
    (wo.lineItems || []).filter((li) => li.id && !kindIsMaterial(kindFromProto(li.kind)) && li.assignedMechanicId === mechanicId),
    [mechanicId]);

  // Which column a card sits in for THIS mechanic: driven by his own line progress. When he
  // has no assigned lines (he's the order lead), fall back to the order state.
  const myState = useCallback((wo: WorkOrder): WoState => {
    const actual = woStateFromProto(wo.state);
    // only reinterpret while the order is in the active work band (approved/in_progress/ready);
    // draft/estimated/invoiced/closed keep their real state (and drop off the 3-column board).
    if (actual !== "approved" && actual !== "in_progress" && actual !== "ready") return actual;
    const lines = myLines(wo);
    if (lines.length === 0) return actual;
    const st = lines.map((li) => lineStatusFromProto(li.status));
    if (st.every((s) => s === "done")) return "ready";
    if (st.some((s) => s === "in_progress")) return "in_progress";
    return "approved";
  }, [myLines]);

  // Board buckets by woStateFromProto(w.state); override it with the mechanic's effective state.
  const boardOrders = useMemo(() => (orders || []).map((w) => ({ ...w, state: woStateToProto(myState(w)) })), [orders, myState]);

  // Search matches the handful of things a mechanic actually knows about a car in front of
  // him: its plate, its make/model, whose it is, or the order number on the paperwork.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return boardOrders;
    return boardOrders.filter((w) =>
      [orderLabel(w), w.plate, w.make, w.model, w.customerName].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [boardOrders, query]);

  const cols = useMemo(() => COLS(t), [t]);
  const byState = (s: WoState) => shown.filter((w) => woStateFromProto(w.state) === s);
  const onBoard = useMemo(() => shown.filter((w) => cols.some((c) => c.key === woStateFromProto(w.state))), [shown, cols]);
  const sum = useMemo(() => onBoard.reduce((acc, w) => acc + num(w.total), 0), [onBoard]);

  // Moving a card only changes the mechanic's OWN service lines (start/finish). The order
  // auto-readies on the backend once EVERY service is done — one mechanic can't ready it alone.
  const moveTo = async (woId: string, target: WoState) => {
    const wo = (orders || []).find((w) => w.id === woId);
    if (!wo || busyId) return;
    const lines = myLines(wo);
    const cur = myState(wo);
    if (cur === target) return;
    setBusyId(woId);
    try {
      if (lines.length === 0) {
        // order lead without specific lines → move the whole order (legacy behavior)
        const orderState = woStateFromProto(wo.state);
        if (orderState === "in_progress" && target !== "in_progress") { try { await api.stopTimer(woId, mechanicId); } catch { /* */ } }
        await api.transition(woId, target);
        if (target === "in_progress" && orderState !== "in_progress") { try { await api.startTimer(woId, mechanicId); } catch { /* */ } }
      } else {
        // set only MY service lines; the backend rolls the whole order up when all are done
        const ls: LineItemStatus = target === "ready" ? "done" : target === "in_progress" ? "in_progress" : "pending";
        for (const li of lines) await api.setLineItemStatus(woId, li.id!, lineStatusToProto(ls));
        if (target === "in_progress" && cur !== "in_progress") { try { await api.startTimer(woId, mechanicId); } catch { /* */ } }
        if (cur === "in_progress" && target !== "in_progress") { try { await api.stopTimer(woId, mechanicId); } catch { /* */ } }
      }
      toast(cols.find((c) => c.key === target)?.label || target, { icon: "check" });
      await load();
    } catch (e) {
      toast(errMsg(e), { tone: "danger", icon: "alert" });
    } finally {
      setBusyId(null);
    }
  };

  if (orders === null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[70px] rounded-[14px]" />)}
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[210px] rounded-[14px]" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* title ←→ search + create */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-[-0.025em] text-foreground">{t("my_jobs")}</h1>
          <div className="mt-0.5 text-[13px] font-medium text-muted-foreground">{session?.staff.name} · {t("role_mechanic")}</div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              className="h-9 w-[190px] pl-9 text-[13px]"
            />
          </div>
          {canCreate && <Button onClick={() => setCreateOpen(true)}><Plus />{t("new_wo")}</Button>}
        </div>
      </div>

      {/* the day at a glance, over the board it summarises */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("stat_my_orders")} value={String(onBoard.length)} />
        <Stat label={t("kb_in_progress")} value={String(byState("in_progress").length)} tone="warn" />
        <Stat label={t("kb_ready")} value={String(byState("ready").length)} tone="ok" />
        <Stat label={t("stat_board_total")} value={money(sum)} suffix={t("soum")} tone="accent" />
      </div>

      {canCreate && <CreateWOModal open={createOpen} onClose={() => setCreateOpen(false)} basePath="/m/wo" />}
      <WorkOrderBoard
        orders={shown}
        cols={cols}
        busyId={busyId}
        onMove={(id, s) => void moveTo(id, s)}
        onOpen={(id) => router.push(`/m/wo/${id}`)}
        hint={t("board_hint")}
        emptyLabel={t("no_jobs")}
      />
    </div>
  );
}
