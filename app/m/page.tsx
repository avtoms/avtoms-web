"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useLang, useToast } from "@/components/providers";
import { Badge, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { woStateFromProto, type WoState } from "@/lib/enums";
import { WorkOrderBoard, type ColDef } from "@/components/wo-board";
import type { WorkOrder } from "@/lib/types";

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

  if (orders === null) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={28} /></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
      <WorkOrderBoard
        orders={orders}
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
