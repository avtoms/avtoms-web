"use client";
// Work orders (owner): a Board / List toggle. The Board is the live pipeline as a kanban —
// Draft → Estimate → Approved → In progress → Ready → Payment due — with the finished orders
// folded into a rail on the right, one click from open. Each card says who is on it, flags an
// order that has waited too long (no mechanic, estimate unanswered, bill unpaid), and carries
// the button that moves it on: bill it, take the payment. The List is the flat, filterable
// table that also covers search and every status.
//
// Above both: the window (active orders, or the ones that came in today, this week, this
// month…), a mechanic filter, and a strip of what the orders on screen are worth. The search
// box in the header narrows the board and the table alike.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { SkeletonRows, StateBadge, useIsMobile } from "@/components/ui";
import { Card } from "@/components/ui-kit/card";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui-kit/select";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { PageHeader } from "@/components/page-header";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { can } from "@/lib/perms";
import { WO_STATES, STATE_LABEL, fiscalFromProto, visibleStates, woStateFromProto, type WoState } from "@/lib/enums";
import { useShopFlow } from "@/lib/shop";
import { canWork } from "@/lib/use-staff";
import { serverMessage } from "@/lib/system-text";
import { useAutoRefresh } from "@/lib/use-refresh";
import { minutesBetween, money, num, orderLabel, shortDate, vehicleTitle } from "@/lib/format";
import type { Invoice, MaterialReturn, Staff, WorkOrder } from "@/lib/types";
import { WorkOrderBoard, type CardExtras, type ColDef } from "@/components/wo-board";
import { MaterialReturnDialog, returnableMaterials, type ReturnableMaterial } from "@/components/material-return-dialog";
import { useDateFilter, type RangePreset } from "@/components/date-range-filter";
import { inRange } from "@/lib/range";
import { CarImage } from "@/components/car-image";
import { CreateWOModal } from "../_create-wo";
import { StaffDot } from "../_shared";
import { cn } from "@/lib/utils";

// The full lifecycle, left to right. Closed and Canceled are columns too, but they start
// folded into the rail — the board is for what is still moving.
const PIPELINE: ColDef[] = [
  { key: "draft", label: "st_draft", tone: "accent", accent: "var(--ink-3)", soft: "var(--surface-2)" },
  { key: "estimated", label: "st_estimated", tone: "accent", accent: "var(--info)", soft: "var(--info-soft)" },
  { key: "approved", label: "st_approved", tone: "accent", accent: "var(--accent)", soft: "var(--accent-soft)" },
  { key: "in_progress", label: "st_in_progress", tone: "warn", accent: "var(--warn)", soft: "var(--warn-soft)" },
  { key: "ready", label: "st_ready", tone: "ok", accent: "var(--ok)", soft: "var(--ok-soft)" },
  { key: "invoiced", label: "st_invoiced", tone: "warn", accent: "var(--warn)", soft: "var(--warn-soft)" },
  { key: "closed", label: "st_closed", tone: "ok", accent: "var(--ink-2)", soft: "var(--surface-2)" },
  { key: "canceled", label: "st_canceled", tone: "warn", accent: "var(--danger)", soft: "var(--danger-soft)" },
];
const FINISHED: WoState[] = ["closed", "canceled"];
const NEEDS_MECHANIC: WoState[] = ["draft", "estimated", "approved", "in_progress"];

// The window chips. "Faol" is every order still moving, whenever it came in; the others are
// the day it came in, as before. Yesterday stays — it was there, and people use it.
type Chip = "active" | Exclude<RangePreset, "all">;
const CHIPS: { key: Chip; labelKey: string }[] = [
  { key: "active", labelKey: "wo_active" },
  { key: "today", labelKey: "flt_today" },
  { key: "yesterday", labelKey: "flt_yesterday" },
  { key: "week", labelKey: "flt_week" },
  { key: "month", labelKey: "flt_month" },
  { key: "custom", labelKey: "flt_custom" },
];
const ALL = "__all";
const norm = (s: string) => s.toLowerCase().replace(/[\s\-·]+/g, "");

export default function WorkOrdersPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t, lang } = useLang();
  const { toast } = useToast();
  const router = useRouter();
  const isMobile = useIsMobile();
  const canBill = can(session, "finance.manage");
  const canCreate = can(session, "orders.create");

  const [view, setView] = useState<"board" | "list">("board");
  const [filter, setFilter] = useState<"all" | WoState>("all");
  const [list, setList] = useState<WorkOrder[] | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [mech, setMech] = useState(ALL);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  // When the order came in. Active by default: the board is a live queue, and a car in the
  // shop since last week must not disappear because somebody once looked at today.
  const dates = useDateFilter();
  const chip: Chip = dates.preset === "all" ? "active" : dates.preset;
  const [busyId, setBusyId] = useState<string | null>(null);
  // The order a drag into the cancelled column is waiting on, with the stock it drew.
  const [cancelling, setCancelling] = useState<{ wo: WorkOrder; materials: ReturnableMaterial[] } | null>(null);
  // The shop's configured status flow; undefined until loaded, meaning "every status".
  const { enabled, transitions: flowTransitions } = useShopFlow();

  // On the board we load the whole shop and bucket client-side; on the list we let the
  // server filter by the selected state.
  const load = useCallback(async () => {
    try {
      const state = view === "list" && filter !== "all" ? filter : undefined;
      const [wos, st, invs] = await Promise.all([
        api.listWorkOrders(shopId, state),
        api.listStaff(shopId).catch(() => [] as Staff[]),
        canBill ? api.listInvoices(shopId).catch(() => null) : Promise.resolve(null),
      ]);
      setList(wos);
      setStaff(st);
      setInvoices(invs);
    } catch (e) {
      // Keep what is on the board: a blip during the auto-refresh must not read as "no orders".
      setList((prev) => prev ?? []);
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    }
  }, [shopId, view, filter, canBill, t, toast]);

  useEffect(() => { setList(null); void load(); }, [load]);
  // Other staff move orders while this board sits open; refresh when it regains focus.
  useAutoRefresh(load);

  const staffName = useCallback((id?: string) => (id ? staff.find((s) => s.id === id)?.name ?? "" : ""), [staff]);
  const mechanics = useMemo(() => staff.filter(canWork), [staff]);
  // The bill behind each invoiced order, when this person may read bills: it says whether the
  // money has come in and since when it has been waiting.
  const invByWo = useMemo(() => {
    const m = new Map<string, Invoice>();
    for (const i of invoices ?? []) if (fiscalFromProto(i.fiscalStatus) !== "voided") m.set(i.workOrderId, i);
    return m;
  }, [invoices]);

  // Owner board move: a plain state transition (the backend rejects invalid hops with a
  // clear error, which we surface). No timer side-effects here — that's the mechanic's flow.
  const moveTo = async (woId: string, target: WoState, returns?: MaterialReturn[]) => {
    if (busyId) return;
    const wo = (list || []).find((w) => w.id === woId);
    if (!wo) return;
    // Dragging a card into the cancelled column calls the job off just as firmly as the
    // button on the order screen does, so it has to ask the same question about the
    // materials. The board's list carries no line items, so the order is fetched to find
    // out whether it drew any stock at all; one with none goes straight through.
    if (target === "canceled" && !returns) {
      setBusyId(woId);
      try {
        const full = await api.getWorkOrder(woId);
        const mats = returnableMaterials(full);
        if (mats.length > 0) { setCancelling({ wo: full, materials: mats }); return; }
      } catch { /* fall through and cancel plainly — a failed lookup must not block the move */ }
      finally { setBusyId(null); }
    }
    setBusyId(woId);
    try {
      await api.transition(woId, target, returns);
      toast(t(STATE_LABEL[target]), { icon: "check" });
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? serverMessage(lang, e.message) : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setBusyId(null);
    }
  };

  // The orders on screen: the window, the mechanic and the search box, applied to both views
  // so the board, the table and the money strip always describe the same set. "Faol" on the
  // table leaves out finished orders unless a finished status is what was asked for.
  const visible = useMemo(() => {
    const n = norm(q);
    return (list ?? []).filter((w) => {
      if (!inRange(w.createdAt, dates.range)) return false;
      if (mech !== ALL && w.assignedMechanicId !== mech) return false;
      if (n && !norm(`${orderLabel(w)} ${w.plate ?? ""} ${w.customerName ?? ""} ${w.make ?? ""} ${w.model ?? ""} ${w.customerPhone ?? ""}`).includes(n)) return false;
      if (view === "list" && chip === "active" && !FINISHED.includes(filter as WoState) && FINISHED.includes(woStateFromProto(w.state))) return false;
      return true;
    });
  }, [list, dates.range, mech, q, view, chip, filter]);

  // Show the shop's statuses, plus any status that still holds an order — a card must never
  // disappear just because its status was switched off after the order landed there.
  const shown = useMemo(() => {
    const present = visible.map((w) => woStateFromProto(w.state));
    return visibleStates(enabled, present);
  }, [enabled, visible]);
  const cols = PIPELINE.filter((c) => shown.has(c.key)).map((c) => ({ ...c, label: t(c.label) }));

  const age = useCallback((iso?: string) => {
    const mins = minutesBetween(iso);
    if (mins < 60) return `${Math.max(1, Math.round(mins))} ${t("dur_min")}`;
    const h = mins / 60;
    if (h < 24) return `${Math.round(h)} ${t("hours_short")}`;
    return `${Math.round(h / 24)} ${t("dur_day")}`;
  }, [t]);

  // What the card adds on the owner board. The badge is the reason to look at the card now:
  // nobody is on it, the estimate has gone unanswered for two hours, the bill for one.
  const extras = useCallback((w: WorkOrder): CardExtras => {
    const s = woStateFromProto(w.state);
    const inv = invByWo.get(w.id);
    let badge: CardExtras["badge"] = null;
    let meta: string | undefined;
    let action: React.ReactNode = null;
    if (NEEDS_MECHANIC.includes(s) && !w.assignedMechanicId) badge = { tone: "warn", label: t("no_mechanic") };
    else if (s === "estimated" && minutesBetween(w.createdAt) >= 120) badge = { tone: "danger", label: `${age(w.createdAt)} ${t("dash_waiting")}` };
    if (s === "invoiced") {
      if (inv?.paid) {
        badge = { tone: "ok", label: t("paid") };
        meta = t("wo_paid_not_closed");
      } else {
        const since = inv?.createdAt || w.createdAt;
        if (minutesBetween(since) >= 60) badge = { tone: "danger", label: age(since) };
        if (inv) meta = `${t("wo_invoice_no")} ${inv.id.slice(0, 6).toUpperCase()}`;
        if (canBill) action = (
          <Button size="sm" className="w-full" onClick={() => router.push(`/work-orders/${w.id}?pay=1`)}>{t("act_take_payment")}</Button>
        );
      }
    }
    if (s === "ready" && canBill) action = (
      <Button size="sm" className="w-full" onClick={() => router.push(`/work-orders/${w.id}?invoice=1`)}>{t("act_invoice")}</Button>
    );
    return { mechanicId: w.assignedMechanicId, mechanicName: staffName(w.assignedMechanicId), badge, meta, action };
  }, [invByWo, age, t, canBill, router, staffName]);

  const columns = useMemo<ColumnDef<WorkOrder>[]>(() => [
    {
      id: "order",
      accessorFn: (w) => orderLabel(w),
      header: ({ column }) => <SortHeader column={column}>{t("work_order")}</SortHeader>,
      cell: ({ row }) => {
        const w = row.original;
        const created = w.createdAt ? shortDate(w.createdAt) : "";
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
          <div className="flex min-w-0 items-center gap-2.5">
            <CarImage make={w.make} size={30} radius={8} />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-foreground">{vehicleTitle(w) || t("work_order")}</div>
              {w.customerName && <div className="truncate text-[12px] text-muted-foreground">{w.customerName}</div>}
            </div>
          </div>
        );
      },
    },
    {
      id: "mechanic",
      accessorFn: (w) => staffName(w.assignedMechanicId),
      header: ({ column }) => <SortHeader column={column}>{t("mechanic")}</SortHeader>,
      cell: ({ row }) => {
        const w = row.original;
        const name = staffName(w.assignedMechanicId);
        return w.assignedMechanicId
          ? <span className="inline-flex items-center gap-2 text-[13.5px]"><StaffDot id={w.assignedMechanicId} name={name} size={22} />{name}</span>
          : <span className="text-[13px] text-muted-foreground">—</span>;
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
  ], [t, staffName]);

  // What the orders on screen are worth. Derived from the visible list rather than fetched,
  // so the strip always describes exactly what is below it. Money that has been earned is
  // separated from money still in the shop: an order becomes income when it is invoiced.
  const totals = useMemo(() => {
    let openValue = 0, expected = 0, income = 0, outcome = 0, active = 0;
    for (const w of visible) {
      const st = woStateFromProto(w.state);
      if (st === "canceled") continue;
      if (st !== "closed") active += 1;
      if (st === "invoiced" || st === "closed") {
        income += num(w.total);
        outcome += num(w.totalCost);
        if (st === "invoiced") {
          const inv = invByWo.get(w.id);
          expected += inv ? (inv.paid ? 0 : Math.max(0, num(inv.total) - num(inv.paidAmount))) : num(w.total);
        }
      } else {
        openValue += num(w.total);
      }
    }
    return { active, openValue, expected, income, outcome, profit: income - outcome };
  }, [visible, invByWo]);

  const columnLabels = useMemo(
    () => ({ order: t("work_order"), vehicle: t("vehicle"), mechanic: t("mechanic"), total: t("total"), status: t("status") }),
    [t],
  );

  const search = (
    <div className={cn("relative", isMobile ? "w-full" : "w-[300px]")}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("wo_search_ph")} aria-label={t("search")} className="pl-9" />
    </div>
  );

  const stripItem = (label: string, value: string, tone?: "warn" | "ok" | "danger" | "accent") => (
    <span className="whitespace-nowrap">
      {label} <span className={cn("font-mono font-bold", tone === "warn" ? "text-warning" : tone === "ok" ? "text-success" : tone === "danger" ? "text-destructive" : tone === "accent" ? "text-primary-emphasis" : "text-foreground")}>{value}</span>
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-[19px] font-bold tracking-[-0.025em] text-foreground touch:text-[16px]">{t("nav_workorders")}</h1>
            <Tabs value={view} onValueChange={(v) => setView(v as "board" | "list")}>
              <TabsList>
                <TabsTrigger value="board">{t("view_board")}</TabsTrigger>
                <TabsTrigger value="list">{t("view_list")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        }
        actions={!isMobile ? search : undefined}
      />

      {isMobile && search}

      {/* window · mechanic ←→ what it is worth */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-[10px] bg-secondary p-1">
          {CHIPS.map((c) => (
            <button key={c.key} onClick={() => dates.setPreset(c.key === "active" ? "all" : c.key)} aria-pressed={chip === c.key}
              className={cn(
                "min-h-9 rounded-[8px] px-3 text-[13px] font-semibold transition-colors touch:min-h-11",
                chip === c.key ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground hover:text-foreground",
              )}>
              {t(c.labelKey)}
            </button>
          ))}
        </div>
        {chip === "custom" && (
          <div className="flex items-center gap-1.5">
            <Input type="date" value={dates.from} onChange={(e) => e.target.value && dates.setFrom(e.target.value)} className="max-w-[160px] font-mono" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={dates.to} onChange={(e) => e.target.value && dates.setTo(e.target.value)} className="max-w-[160px] font-mono" />
          </div>
        )}
        {mechanics.length > 0 && (
          <Select value={mech} onValueChange={setMech}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("wo_mech_all")}</SelectItem>
              {mechanics.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {list !== null && (
          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground touch:ml-0">
            {stripItem(t("wo_active_n"), String(totals.active))}
            {stripItem(t("ln_inprogress"), money(totals.openValue), "accent")}
            {stripItem(t("wo_expected_pay"), money(totals.expected), "warn")}
            {stripItem(t("revenue"), money(totals.income), "ok")}
            {stripItem(t("expenses"), money(totals.outcome), "danger")}
            {stripItem(t("net_profit"), money(totals.profit), totals.profit < 0 ? "danger" : "accent")}
          </div>
        )}
      </div>

      {list === null ? (
        <Card className="overflow-hidden"><SkeletonRows rows={7} avatar={false} /></Card>
      ) : view === "board" ? (
        <WorkOrderBoard
          orders={visible}
          cols={cols}
          busyId={busyId}
          onMove={(id, s) => void moveTo(id, s)}
          onOpen={(id) => router.push(`/work-orders/${id}`)}
          hint={t("board_hint")}
          emptyLabel={t("no_orders_col")}
          moveTargets={(cur) => flowTransitions[cur] || []}
          extras={extras}
          compactMenu
          rail={{ states: FINISHED, label: t("wo_closed_hint") }}
          addTo={canCreate ? { state: "draft", label: t("wo_add_draft"), onClick: () => setCreating(true) } : undefined}
        />
      ) : (
        <DataTable
          columns={columns}
          data={visible}
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
                {WO_STATES.filter((s) => shown.has(s) || FINISHED.includes(s)).map((s) => <SelectItem key={s} value={s}>{t(STATE_LABEL[s])}</SelectItem>)}
              </SelectContent>
            </Select>
          }
        />
      )}

      {/* Dropping a card into the cancelled column reaches here before anything moves. */}
      <MaterialReturnDialog
        open={!!cancelling}
        title={t("cancel_wo")}
        warning={t("cancel_wo_confirm")}
        confirmLabel={t("cancel_wo")}
        materials={cancelling?.materials ?? []}
        busy={!!busyId}
        onClose={() => setCancelling(null)}
        onConfirm={async (returns) => {
          const id = cancelling?.wo.id;
          setCancelling(null);
          if (id) await moveTo(id, "canceled", returns);
        }}
      />
      <CreateWOModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
