"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useLang, useToast } from "@/components/providers";
import { Badge, Btn, Card, SkeletonRows } from "@/components/ui";
import { CreateWOModal } from "@/app/(owner)/_create-wo";
import { api, ApiError } from "@/lib/api";
import { woStateFromProto, woStateToProto, kindFromProto, kindIsMaterial, lineStatusFromProto, lineStatusToProto, type WoState, type LineItemStatus } from "@/lib/enums";
import { WorkOrderBoard, type ColDef } from "@/components/wo-board";
import type { WorkOrder, LineItem } from "@/lib/types";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));

const COLS = (t: (k: string) => string): ColDef[] => [
  { key: "approved", label: t("kb_assigned"), tone: "accent", accent: "var(--accent)", soft: "var(--accent-soft)" },
  { key: "in_progress", label: t("kb_in_progress"), tone: "warn", accent: "var(--warn)", soft: "var(--warn-soft)" },
  { key: "ready", label: t("kb_ready"), tone: "ok", accent: "var(--ok)", soft: "var(--ok-soft)" },
];

export default function MechanicBoardPage() {
  const { session } = useAuth();
  const { t } = useLang();
  const { toast } = useToast();
  const router = useRouter();

  const mechanicId = session?.staff.id ?? "";
  const mechName = session?.staff.name ?? "";
  const shopId = session?.staff.shopId ?? "";

  const [orders, setOrders] = useState<WorkOrder[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const cols = COLS(t);
  const byState = (s: WoState) => boardOrders.filter((w) => woStateFromProto(w.state) === s);

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {[0, 1, 2].map((i) => <Card key={i} pad={0}><SkeletonRows rows={3} avatar={false} /></Card>)}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "calc(20px * var(--scale))", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.025em" }}>{t("my_jobs")}</h2>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>{mechName}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {cols.map((c) => (
            <Badge key={c.key} tone={c.tone} dot>{c.label} · {byState(c.key).length}</Badge>
          ))}
          {canCreate && <Btn variant="primary" size="sm" icon="plus" onClick={() => setCreateOpen(true)}>{t("new_wo")}</Btn>}
        </div>
      </div>
      {canCreate && <CreateWOModal open={createOpen} onClose={() => setCreateOpen(false)} basePath="/m/wo" />}
      <WorkOrderBoard
        orders={boardOrders}
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
