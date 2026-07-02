"use client";
// Work orders (owner): a Board / List toggle. The Board is the active cash pipeline
// (Estimated → Approved → In progress → Ready → Invoiced) as a Jira-style kanban — great
// for spotting bottlenecks (approvals piling up, jobs ready to invoice). The List is the
// flat, filterable view that also covers draft / closed / canceled and search.
// The Create-WO flow lives in the shared layout header button (_create-wo.tsx).
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Segmented, Empty, SkeletonRows } from "@/components/ui";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { WO_STATES, STATE_LABEL, TRANSITIONS, type WoState } from "@/lib/enums";
import type { WorkOrder } from "@/lib/types";
import { WorkOrderBoard, type ColDef } from "@/components/wo-board";
import { WORow } from "../_shared";

// The owner board shows the full lifecycle, left to right — every status is a column,
// including the terminal Closed/Canceled. Each card's status menu still offers only the
// legal next states (see moveTargets), so the columns are a complete view while moves stay
// valid. The board scrolls horizontally; the List remains for filtering/search.
const PIPELINE: ColDef[] = [
  { key: "draft", label: "st_draft", tone: "accent", accent: "var(--ink-3)", soft: "var(--surface-2)" },
  { key: "estimated", label: "st_estimated", tone: "accent", accent: "var(--info)", soft: "var(--info-soft)" },
  { key: "approved", label: "st_approved", tone: "accent", accent: "var(--accent)", soft: "var(--accent-soft)" },
  { key: "in_progress", label: "st_in_progress", tone: "warn", accent: "var(--warn)", soft: "var(--warn-soft)" },
  { key: "ready", label: "st_ready", tone: "ok", accent: "var(--ok)", soft: "var(--ok-soft)" },
  { key: "invoiced", label: "st_invoiced", tone: "ok", accent: "var(--accent-2)", soft: "var(--accent-soft)" },
  { key: "closed", label: "st_closed", tone: "ok", accent: "var(--ink-2)", soft: "var(--surface-2)" },
  { key: "canceled", label: "st_canceled", tone: "warn", accent: "var(--danger)", soft: "var(--danger-soft)" },
];

export default function WorkOrdersPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();
  const router = useRouter();

  const [view, setView] = useState<"board" | "list">("board");
  const [filter, setFilter] = useState<"all" | WoState>("all");
  const [list, setList] = useState<WorkOrder[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // On the board we load the whole shop and bucket client-side; on the list we let the
  // server filter by the selected state.
  const load = useCallback(async () => {
    setList(null);
    try {
      const state = view === "list" && filter !== "all" ? filter : undefined;
      setList(await api.listWorkOrders(shopId, state));
    } catch (e) {
      setList([]);
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    }
  }, [shopId, view, filter, t, toast]);

  useEffect(() => { void load(); }, [load]);

  // Owner board move: a plain state transition (the backend rejects invalid hops with a
  // clear error, which we surface). No timer side-effects here — that's the mechanic's flow.
  const moveTo = async (woId: string, target: WoState) => {
    if (busyId) return;
    const wo = (list || []).find((w) => w.id === woId);
    if (!wo) return;
    setBusyId(woId);
    try {
      await api.transition(woId, target);
      toast(t(STATE_LABEL[target]), { icon: "check" });
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setBusyId(null);
    }
  };

  const cols = PIPELINE.map((c) => ({ ...c, label: t(c.label) }));
  const filters = [{ value: "all", label: t("all") }, ...WO_STATES.map((s) => ({ value: s, label: t(STATE_LABEL[s]) }))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Segmented
          options={[{ value: "board", label: t("view_board") }, { value: "list", label: t("view_list") }]}
          value={view}
          onChange={(v) => setView(v as "board" | "list")}
          size="sm"
        />
        {view === "list" && (
          <div style={{ overflowX: "auto", paddingBottom: 2, maxWidth: "100%" }}>
            <Segmented options={filters} value={filter} onChange={(v) => setFilter(v as "all" | WoState)} size="sm" style={{ flexWrap: "nowrap" }} />
          </div>
        )}
      </div>

      {list === null ? (
        <Card pad={0}><SkeletonRows rows={7} avatar={false} /></Card>
      ) : view === "board" ? (
        <WorkOrderBoard
          orders={list}
          cols={cols}
          busyId={busyId}
          onMove={(id, s) => void moveTo(id, s)}
          onOpen={(id) => router.push(`/work-orders/${id}`)}
          hint={t("board_hint")}
          emptyLabel={t("no_orders_col")}
          moveTargets={(cur) => TRANSITIONS[cur] || []}
        />
      ) : (
        <Card pad={0}>
          {list.length === 0 ? <div style={{ padding: 24 }}><Empty icon="clipboard" /></div>
            : list.map((w) => <WORow key={w.id} wo={w} />)}
        </Card>
      )}
    </div>
  );
}
