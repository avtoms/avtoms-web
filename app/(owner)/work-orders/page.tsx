"use client";
// Work orders (owner): a Board / List toggle. The Board is the active cash pipeline
// (Estimated → Approved → In progress → Ready → Invoiced) as a Jira-style kanban — great
// for spotting bottlenecks (approvals piling up, jobs ready to invoice). The List is the
// flat, filterable view (now a searchable/sortable DataTable) that also covers
// draft / closed / canceled and search.
// The Create-WO flow lives in the shared layout header button (_create-wo.tsx).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { SkeletonRows, StateBadge } from "@/components/ui";
import { Card } from "@/components/ui-kit/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui-kit/select";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { WO_STATES, STATE_LABEL, visibleStates, transitionsFor, woStateFromProto, type WoState } from "@/lib/enums";
import { useAutoRefresh } from "@/lib/use-refresh";
import { money, num, orderLabel, vehicleTitle } from "@/lib/format";
import type { WorkOrder } from "@/lib/types";
import { WorkOrderBoard, type ColDef } from "@/components/wo-board";

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
  // The shop's configured status flow; undefined until loaded, meaning "every status".
  const [enabled, setEnabled] = useState<string[] | undefined>(undefined);

  useEffect(() => { api.getShopSettings().then((s) => setEnabled(s.enabledStates)).catch(() => {}); }, []);

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
  // Other staff move orders while this board sits open; refresh when it regains focus.
  useAutoRefresh(load);

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

  // Show the shop's statuses, plus any status that still holds an order — a card must never
  // disappear just because its status was switched off after the order landed there.
  const shown = useMemo(() => {
    const present = (list ?? []).map((w) => woStateFromProto(w.state));
    return visibleStates(enabled, present);
  }, [enabled, list]);
  const cols = PIPELINE.filter((c) => shown.has(c.key)).map((c) => ({ ...c, label: t(c.label) }));
  // Moves must match the shop's flow, not the full lifecycle, or the board would offer a hop
  // the server rejects.
  const flowTransitions = useMemo(() => transitionsFor(enabled), [enabled]);

  const columns = useMemo<ColumnDef<WorkOrder>[]>(() => [
    {
      id: "order",
      accessorFn: (w) => orderLabel(w),
      header: ({ column }) => <SortHeader column={column}>{t("work_order")}</SortHeader>,
      cell: ({ row }) => {
        const w = row.original;
        const created = w.createdAt
          ? new Date(w.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" })
          : "";
        return (
          <div className="flex flex-col">
            <span className="font-mono text-[13.5px] font-bold text-foreground">{orderLabel(w)}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{created}</span>
          </div>
        );
      },
    },
    {
      id: "vehicle",
      accessorFn: (w) => `${vehicleTitle(w)} ${w.customerName || ""}`,
      header: ({ column }) => <SortHeader column={column}>{t("vehicle")}</SortHeader>,
      cell: ({ row }) => {
        const w = row.original;
        return (
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-foreground">{vehicleTitle(w) || t("work_order")}</div>
            {w.customerName && <div className="truncate text-[12px] text-muted-foreground">{w.customerName}</div>}
          </div>
        );
      },
    },
    {
      id: "total",
      accessorFn: (w) => num(w.total),
      header: ({ column }) => <SortHeader column={column}>{t("total")}</SortHeader>,
      cell: ({ row }) => <span className="font-mono text-[13.5px] font-bold text-foreground">{money(num(row.original.total))}</span>,
    },
    {
      id: "status",
      accessorFn: (w) => t(STATE_LABEL[woStateFromProto(w.state)]),
      header: ({ column }) => <SortHeader column={column}>{t("status")}</SortHeader>,
      cell: ({ row }) => <StateBadge state={woStateFromProto(row.original.state)} />,
    },
  ], [t]);

  const columnLabels = useMemo(
    () => ({ order: t("work_order"), vehicle: t("vehicle"), total: t("total"), status: t("status") }),
    [t],
  );

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={view} onValueChange={(v) => setView(v as "board" | "list")}>
        <TabsList>
          <TabsTrigger value="board">{t("view_board")}</TabsTrigger>
          <TabsTrigger value="list">{t("view_list")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {list === null ? (
        <Card className="overflow-hidden"><SkeletonRows rows={7} avatar={false} /></Card>
      ) : view === "board" ? (
        <WorkOrderBoard
          orders={list}
          cols={cols}
          busyId={busyId}
          onMove={(id, s) => void moveTo(id, s)}
          onOpen={(id) => router.push(`/work-orders/${id}`)}
          hint={t("board_hint")}
          emptyLabel={t("no_orders_col")}
          moveTargets={(cur) => flowTransitions[cur] || []}
        />
      ) : (
        <DataTable
          columns={columns}
          data={list}
          searchPlaceholder={t("search")}
          columnLabels={columnLabels}
          emptyText={t("no_orders_col")}
          onRowClick={(w) => router.push(`/work-orders/${w.id}`)}
          pageSize={12}
          toolbar={
            <Select value={filter} onValueChange={(v) => setFilter(v as "all" | WoState)}>
              <SelectTrigger size="sm" className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {WO_STATES.filter((s) => shown.has(s)).map((s) => <SelectItem key={s} value={s}>{t(STATE_LABEL[s])}</SelectItem>)}
              </SelectContent>
            </Select>
          }
        />
      )}
    </div>
  );
}
