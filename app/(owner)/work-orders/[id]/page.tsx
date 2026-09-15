"use client";
// Work order detail, laid out after the redesign. The header carries the order's number, its
// status and how long it has been open, with the buttons that move it on. Under it, a stepper
// through the shop's own status flow says when each step happened. Then the car, the client
// and the mechanic side by side; the jobs with their materials tucked under them, who is doing
// each and how far it has got; the internal note beside the totals. On the right: how the
// client has been kept informed, when the car is due back next, and everything that happened.
//
// Taking the money opens a panel with the receipt the client will see on the left and the
// payment on the right. Every dialog the screen had — lines, discount, mechanic, approval
// link, next service, odometer, cancel with returns — is still here (see ./_parts).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Pencil, Trash2, Send, Receipt, Printer, Check, CreditCard, Banknote, Wallet, HandCoins,
  Bell, Phone, MessageSquare, MoreHorizontal, Wrench, Package, Clock, X, Landmark, ArrowRight,
} from "lucide-react";
import { StateBadge, Empty, useIsMobile } from "@/components/ui";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Textarea } from "@/components/ui-kit/textarea";
import { Spinner, Separator, Skeleton, Switch } from "@/components/ui-kit/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui-kit/dropdown-menu";
import { MaterialReturnDialog, returnableMaterials, type ReturnableMaterial } from "@/components/material-return-dialog";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { useLang, useToast, useAuth } from "@/components/providers";
import { api, ApiError, type PaymentPart } from "@/lib/api";
import { useAutoRefresh } from "@/lib/use-refresh";
import { canWork, useStaffNames } from "@/lib/use-staff";
import { can } from "@/lib/perms";
import { auditAction, auditDetail, serverMessage } from "@/lib/system-text";
import { money, num, shortDate, vatBreakdown, orderLabel, minutesBetween } from "@/lib/format";
import {
  woStateFromProto, kindFromProto, kindIsMaterial, lineStatusFromProto, discountFromProto, enabledSet,
  reminderStateFromProto, paymentFromProto, paymentLabelKey, STATE_LABEL, type WoState, type PaymentMethod,
} from "@/lib/enums";
import type { WorkOrder, Staff, AuditEntry, LineItem, MaterialReturn, Customer, ServiceReminder, Invoice, ShopCard } from "@/lib/types";
import { qtyUnit } from "@/components/catalog-fields";
import { PlatePreview } from "@/components/plate";
import { CarImage } from "@/components/car-image";
import { FiscalCheck } from "@/components/fiscal-check";
import { SplitPayment } from "@/components/split-payment";
import { useShopFlow, useShopProfile } from "@/lib/shop";
import { Row, StaffDot } from "../../_shared";
import {
  NONE, ApprovalModal, EditLineItemModal, OrderDiscountModal, AddLineItemModal, AssignModal,
  NextServiceModal, OdometerField, type LineItemInput,
} from "./_parts";

const CANONICAL: WoState[] = ["draft", "estimated", "approved", "in_progress", "ready", "invoiced", "closed"];
const TRANSITION_TO = /(?:→|->)\s*([a-z_]+)/;
const TRANSITION_FROM = /^([a-z_]+)\s*(?:→|->)/;
const hhmm = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const isToday = (iso?: string) => !!iso && new Date(iso).toDateString() === new Date().toDateString();

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { lang, t } = useLang();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const who = useStaffNames();

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const { enabled, transitions: flowTransitions } = useShopFlow();
  const [loading, setLoading] = useState(true);
  const [mechanics, setMechanics] = useState<Staff[]>([]);
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [year, setYear] = useState<number | undefined>(undefined);
  const [visits, setVisits] = useState<number | undefined>(undefined);
  const [reminders, setReminders] = useState<ServiceReminder[]>([]);

  const [addItem, setAddItem] = useState(false);
  const [addMode, setAddMode] = useState<"menu" | "custom">("menu");
  const [editItem, setEditItem] = useState<LineItem | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [invoice, setInvoice] = useState(false);
  const [discount, setDiscount] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [approval, setApproval] = useState<{ deepLink: string; botUsername: string } | null>(null);
  // Offered once, the moment the car is handed back. Asking "when should they come again?"
  // at any other time means someone has to remember to go and ask it, which is why the
  // reminders list was mostly empty.
  const [nextService, setNextService] = useState(false);
  const deepLinked = useRef(false);

  // The materials that actually left the warehouse on this order — the only things that can
  // come back if it is called off. An order with none of them gets the plain confirm.
  const returnable = useMemo<ReturnableMaterial[]>(() => returnableMaterials(wo ?? {}), [wo]);

  const load = useCallback(async () => {
    try { setWo(await api.getWorkOrder(id)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [id, t, toast]);

  useEffect(() => { load(); }, [load]);
  // Other staff change these records while this tab sits open; refresh when it regains focus.
  useAutoRefresh(load);
  useEffect(() => {
    api.listStaff(shopId).then((s) => setMechanics(s.filter(canWork))).catch(() => {});
  }, [shopId]);

  // The history feeds three things on this screen — the stepper's times, the client card's
  // approval line and the history itself — so it is fetched once, here.
  const auditKey = wo ? `${wo.state}|${(wo.lineItems ?? []).length}|${wo.assignedMechanicId ?? ""}|${wo.notes ?? ""}|${wo.discountAmount ?? ""}` : "";
  useEffect(() => {
    if (!wo) return;
    let alive = true;
    api.getAuditLog(id)
      .then((e) => { if (alive) setAudit([...e].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))); })
      .catch(() => {});
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, auditKey]);

  // Who the client is and what the car has behind it. Each is best-effort: a person who may
  // work orders but not read the client book still gets the order, just without these lines.
  const vehicleId = wo?.vehicleId;
  const customerId = wo?.customerId;
  useEffect(() => {
    if (!customerId) return;
    let alive = true;
    api.getCustomer(customerId).then((c) => { if (alive) setCustomer(c); }).catch(() => {});
    api.listVehicles(customerId).then((vs) => { if (alive) setYear(vs.find((v) => v.id === vehicleId)?.year || undefined); }).catch(() => {});
    return () => { alive = false; };
  }, [customerId, vehicleId]);
  const loadReminders = useCallback(() => {
    if (!vehicleId) return;
    api.listReminders(shopId, vehicleId).then(setReminders).catch(() => {});
  }, [shopId, vehicleId]);
  useEffect(() => {
    if (!vehicleId) return;
    let alive = true;
    api.serviceBook(vehicleId).then((b) => { if (alive) setVisits(b.visits || undefined); }).catch(() => {});
    loadReminders();
    return () => { alive = false; };
  }, [vehicleId, loadReminders]);

  // Arriving from the board's or the dashboard's "take the payment" / "bill it" button opens
  // the payment panel straight away, once, and then forgets it was asked.
  useEffect(() => {
    if (!wo || deepLinked.current) return;
    const p = new URLSearchParams(window.location.search);
    if (!p.get("pay") && !p.get("invoice")) return;
    deepLinked.current = true;
    const s = woStateFromProto(wo.state);
    if (s === "ready" || s === "invoiced" || s === "closed") setInvoice(true);
    window.history.replaceState(null, "", `/work-orders/${id}`);
  }, [wo, id]);

  // Payments live on the bill, not in the order's own log, so they are read from there and
  // woven into the history — "who took the money, how and when" is the line most looked for.
  const [payments, setPayments] = useState<AuditEntry[]>([]);
  const woState = wo ? woStateFromProto(wo.state) : null;
  useEffect(() => {
    if (!wo || (woState !== "invoiced" && woState !== "closed") || !can(session, "finance.manage")) { setPayments([]); return; }
    let alive = true;
    api.listInvoices(shopId).then((all) => {
      const inv = all.find((i) => i.workOrderId === wo.id);
      if (!alive || !inv) return;
      setPayments((inv.payments ?? []).map((p, i) => ({
        id: `pay-${p.id || i}`, workOrderId: wo.id, actorId: p.staffId, action: "payment",
        detail: `${t(paymentLabelKey(paymentFromProto(p.method)))} · ${money(num(p.amount))} ${t("soum")}`,
        createdAt: p.paidAt || inv.createdAt || "",
      })));
    }).catch(() => {});
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wo?.id, woState, shopId]);
  const history = useMemo(
    () => [...audit, ...payments].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [audit, payments],
  );

  // A bill paid in full closes its order on the server. That is the moment the shop is asked
  // when the car should come back — once the payment panel is put away, not over the receipt.
  const prevState = useRef<WoState | null>(null);
  const closedWhilePaying = useRef(false);
  useEffect(() => {
    if (!wo) return;
    const s = woStateFromProto(wo.state);
    if (invoice && prevState.current && prevState.current !== "closed" && s === "closed") closedWhilePaying.current = true;
    prevState.current = s;
  }, [wo, invoice]);

  // The tab names the order, so five orders in five tabs can be told apart.
  useEffect(() => {
    if (wo) document.title = `${orderLabel(wo)} · ${[wo.make, wo.model].filter(Boolean).join(" ") || wo.plate || ""} — ${t("app_name")}`;
  }, [wo, t]);

  const err = (e: unknown) => toast(e instanceof ApiError ? serverMessage(lang, e.message) : t("error"), { icon: "alert", tone: "danger" });

  const doTransition = async (target: WoState, returns?: MaterialReturn[]) => {
    if (busy) return;
    // The server holds these rules; they are checked here first so the answer is in the
    // reader's language and leads straight to the fix.
    const lines = wo?.lineItems ?? [];
    if (target !== "draft" && target !== "canceled" && lines.length === 0) {
      toast(t("guard_lines"), { icon: "alert", tone: "danger" });
      return;
    }
    if (target === "in_progress" && !wo?.assignedMechanicId && !lines.some((li) => li.assignedMechanicId)) {
      toast(t("guard_mech"), { icon: "alert", tone: "danger" });
      setAssigning(true);
      return;
    }
    setBusy(true);
    try {
      const updated = await api.transition(id, target, returns);
      setWo(updated);
      toast(t(STATE_LABEL[target]), { icon: "check" });
      // The car is going back to its owner: this is the one moment the shop knows what was
      // done and when it will need doing again.
      if (target === "closed") setNextService(true);
    }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const doAssign = async (mechanicId: string) => {
    if (busy) return; setBusy(true);
    try { setWo(await api.assignMechanic(id, mechanicId)); setAssigning(false); toast(mechanicId ? t("assign") : t("audit_mechanic_unassigned"), { icon: "check" }); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const doAssignLine = async (lineItemId: string, mechanicId: string) => {
    if (busy) return; setBusy(true);
    try { setWo(await api.assignLineItem(id, lineItemId, mechanicId)); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const doAddItems = async (items: LineItemInput[]) => {
    if (!items.length) return;
    setBusy(true);
    try {
      let updated: WorkOrder | undefined;
      for (const it of items) updated = await api.addLineItem(id, it);
      if (updated) setWo(updated);
      setAddItem(false);
      toast(t("add_item"), { icon: "check" });
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const doRemoveItem = async (lineItemId?: string) => {
    if (!lineItemId || busy) return; setBusy(true);
    try { setWo(await api.removeLineItem(id, lineItemId)); toast(t("removed"), { icon: "check" }); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const doUpdateItem = async (lineItemId: string, fields: { description: string; unitPrice: number; quantity: number; cost: number; consumedQty: number }) => {
    if (busy) return; setBusy(true);
    try { setWo(await api.updateLineItem(id, lineItemId, fields)); setEditItem(null); toast(t("save"), { icon: "check" }); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const requestApproval = async () => {
    if (busy) return; setBusy(true);
    try { const r = await api.createApprovalLink(id); setApproval({ deepLink: r.deepLink, botUsername: r.botUsername }); }
    catch (e) { err(e); } finally { setBusy(false); }
  };

  if (loading) return (
    <div className="flex flex-col gap-4">
      <Card className="p-4"><div className="flex flex-col gap-3"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-3.5 w-1/2" /></div></Card>
      <Card className="p-4"><div className="flex flex-col gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div></Card>
    </div>
  );
  if (!wo) return <Empty icon="alert" text={t("error")} />;

  const state = woStateFromProto(wo.state);
  const items = wo.lineItems ?? [];
  const computed = vatBreakdown(items);
  const subtotal = wo.subtotal != null ? num(wo.subtotal) : computed.subtotal;
  const orderDiscount = num(wo.discountAmount); // whole-order discount, on top of per-line
  const total = wo.total != null ? num(wo.total) : subtotal - orderDiscount; // VAT disabled
  const totalCost = num(wo.totalCost);
  const totalMargin = wo.totalMargin != null ? num(wo.totalMargin) : subtotal - orderDiscount - totalCost;
  const marginPct = total > 0 ? Math.round((totalMargin / total) * 100) : 0;
  const orderDiscKind = discountFromProto(wo.discountKind);
  const orderDiscLabel = orderDiscKind === "percent" ? ` · ${num(wo.discountValue) / 100}%` : "";
  const grossSubtotal = items.reduce((s, it) => {
    const qty = it.quantity || 0;
    const actualUnit = num(it.unitPrice);
    const listUnit = num(it.defaultPrice) > actualUnit ? num(it.defaultPrice) : actualUnit;
    return s + listUnit * qty;
  }, 0);
  const totalDiscount = Math.max(0, grossSubtotal - subtotal);
  const discountPct = grossSubtotal > 0 ? Math.round((totalDiscount / grossSubtotal) * 100) : 0;
  const worksSum = items.filter((it) => !kindIsMaterial(kindFromProto(it.kind))).reduce((s, it) => s + num(it.unitPrice) * (it.quantity || 0), 0);
  const materialsSum = items.filter((it) => kindIsMaterial(kindFromProto(it.kind))).reduce((s, it) => s + num(it.unitPrice) * (it.quantity || 0), 0);
  const services = items.filter((it) => !kindIsMaterial(kindFromProto(it.kind)));
  const servicesDone = services.filter((it) => lineStatusFromProto(it.status) === "done").length;
  const editable = ["draft", "estimated", "approved", "in_progress", "ready"].includes(state);
  const finished = state === "closed" || state === "canceled";
  const mech = mechanics.find((m) => m.id === wo.assignedMechanicId);
  const mechName = mech?.name || who(wo.assignedMechanicId);

  // The shop's own flow, not the full lifecycle: a shop that switched off a status must
  // not be offered it here, because the server derives its legal moves from the same set
  // and rejects the hop.
  const allowed = flowTransitions[state] || [];
  const canCancel = allowed.includes("canceled");
  const forwardTargets = allowed.filter((x) => x !== "canceled" && !(state === "ready" && x === "invoiced"));
  const payable = state === "ready" || state === "invoiced";

  // How long the order has been open, "1 soat 20 daqiqa".
  const openedMins = minutesBetween(wo.createdAt);
  const openedFor = openedMins >= 60 * 24
    ? `${Math.floor(openedMins / 1440)} ${t("dur_day")}`
    : `${Math.floor(openedMins / 60) ? `${Math.floor(openedMins / 60)} ${t("hours_short")} ` : ""}${Math.round(openedMins % 60)} ${t("dur_min")}`;

  // Jobs with the materials tucked under them. The order has no link from a material to its
  // job, but materials added with a job from the price list land right after it — so a
  // material follows the job above it, and one with no job above it stands on its own.
  type Group = { head: LineItem; kids: LineItem[] };
  const groups: Group[] = [];
  for (const it of items) {
    const mat = kindIsMaterial(kindFromProto(it.kind));
    const last = groups[groups.length - 1];
    if (mat && last && !kindIsMaterial(kindFromProto(last.head.kind))) last.kids.push(it);
    else groups.push({ head: it, kids: [] });
  }

  const nextReminder = reminders
    .filter((r) => reminderStateFromProto(r.state) === "pending")
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))[0];

  const primaryForward = forwardTargets[0];
  const forwardLabel = (s: WoState) => t(STATE_LABEL[s]);

  // ── header actions (desktop) / sticky bar (phone) ──
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" aria-label={t("nav_more")}><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        {editable && <DropdownMenuItem onClick={() => setDiscount(true)}>{orderDiscount > 0 ? t("edit_discount") : t("add_discount")}</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => setNextService(true)}><Bell /> {t("next_service")}</DropdownMenuItem>
        {forwardTargets.slice(1).map((s) => (
          <DropdownMenuItem key={s} disabled={busy} onClick={() => doTransition(s)}><ArrowRight /> {forwardLabel(s)}</DropdownMenuItem>
        ))}
        {canCancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmCancel(true)}><X /> {t("cancel_wo")}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const primaryButtons = (size: "default" | "lg" = "default") => (
    <>
      {state === "estimated" && <Button variant="secondary" size={size} disabled={busy} onClick={requestApproval}><Send /> {t("wo_send_customer")}</Button>}
      {(state === "invoiced" || state === "closed") && <Button variant="secondary" size={size} onClick={() => setInvoice(true)}><Printer /> {t("print")}</Button>}
      {payable && <Button size={size} disabled={busy} onClick={() => setInvoice(true)}><Receipt /> {state === "ready" ? t("act_invoice") : t("act_take_payment")}</Button>}
      {primaryForward && (
        <Button data-tour="wo-advance" size={size} variant={payable ? "secondary" : "default"} disabled={busy} onClick={() => doTransition(primaryForward)}>
          <Check /> {forwardLabel(primaryForward)}
        </Button>
      )}
    </>
  );

  // On a phone the actions sit in a bar at the thumb, the ⋯ menu with them; alone in the
  // header it took a row of its own and still pushed the state badge into the icons.
  const phoneBar = isMobile && !!(payable || primaryForward || state === "estimated" || state === "closed");

  return (
    <div className="flex flex-col gap-4" style={{ paddingBottom: isMobile ? 96 : 16 }}>
      <PageHeader
        title={
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <Button variant="secondary" size="icon" onClick={() => router.push("/work-orders")} aria-label={t("back")}><ArrowLeft /></Button>
            <h1 className="shrink-0 whitespace-nowrap font-mono text-[21px] font-bold tracking-[-0.02em] text-foreground touch:text-[18px]">{orderLabel(wo)}</h1>
            <StateBadge state={state} />
            {!isMobile && wo.createdAt && (
              <span className="truncate text-[13px] text-muted-foreground">
                {t("wo_opened")} {shortDate(wo.createdAt)} · {hhmm(wo.createdAt)}{!finished && ` · ${openedFor}`}
              </span>
            )}
          </div>
        }
        actions={!isMobile ? <>{menu}{primaryButtons()}</> : phoneBar ? undefined : menu}
      />

      <Stepper state={state} enabled={enabled} audit={audit} done={servicesDone} total={services.length} compact={isMobile} />

      {/* car · client · mechanic */}
      <Card className="p-0">
        <div className="grid divide-y divide-border md:grid-cols-[1.35fr_1fr_1fr] md:divide-x md:divide-y-0">
          <div className="flex items-center gap-3.5 p-4">
            <CarImage src={wo.vehicleImageUrl} make={wo.make} size={52} />
            <div className="min-w-0">
              <div className="truncate text-[16.5px] font-bold text-foreground">
                {[wo.make, wo.model].filter(Boolean).join(" ") || t("vehicle")}
                {year ? <span className="font-medium text-muted-foreground"> · {year}</span> : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {wo.plate ? <PlatePreview plate={wo.plate} size="sm" /> : <span className="font-mono text-[12.5px] text-muted-foreground">{wo.vehicleId.slice(0, 8)}</span>}
                {/* This visit's line in the service book. Here rather than on the new-order
                    form because this is where the car is identified and somebody is next to it. */}
                <OdometerField wo={wo} onSaved={setWo} />
              </div>
            </div>
          </div>
          <div className="min-w-0 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("customer")}</div>
            <div className="mt-1 truncate text-[15px] font-bold text-foreground">{wo.customerName || "—"}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {wo.customerPhone && <a href={`tel:${wo.customerPhone}`} className="font-mono text-[13px] text-ink-2 hover:underline">{wo.customerPhone}</a>}
              {visits ? <span className="rounded-full bg-secondary px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">{visits}{t("wo_visit")}</span> : null}
            </div>
          </div>
          <div className="flex min-w-0 items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("wo_resp_mech")}</div>
              {wo.assignedMechanicId ? (
                <div className="mt-1.5 flex items-center gap-2.5">
                  <StaffDot id={wo.assignedMechanicId} name={mechName} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-[14.5px] font-bold text-foreground">{mechName || "—"}</div>
                    {mech?.phone && <div className="truncate font-mono text-[12px] text-muted-foreground">{mech.phone}</div>}
                  </div>
                </div>
              ) : <div className="mt-1.5 text-[14px] text-muted-foreground">{t("unassigned")}</div>}
            </div>
            {!finished && (
              <button onClick={() => setAssigning(true)} className="shrink-0 text-[13px] font-semibold text-primary-emphasis hover:underline">
                {wo.assignedMechanicId ? t("wo_change") : t("assign")}
              </button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        {/* ── jobs and parts ── */}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-bold tracking-[-0.02em] text-foreground">{t("line_items")}</span>
              <span className="text-[12.5px] text-muted-foreground">{items.length} {t("wo_rows")}</span>
            </div>
            {editable && (
              <div className="flex items-center gap-2">
                <Button data-tour="wo-add-menu" variant="secondary" size="sm" onClick={() => { setAddMode("menu"); setAddItem(true); }}>{t("wo_from_price")}</Button>
                <Button data-tour="wo-add-item" variant="soft" size="sm" onClick={() => { setAddMode("custom"); setAddItem(true); }}><Plus /> {t("add_item")}</Button>
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <div className="p-5"><Empty icon="list" text={t("empty")} /></div>
          ) : (
            <div>
              {!isMobile && (
                <div className="grid grid-cols-[minmax(0,1fr)_170px_70px_110px_120px_36px] items-center gap-3 border-b border-border bg-secondary/40 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  <span>{t("col_desc")}</span><span>{t("col_doer")}</span><span className="text-right">{t("col_qty")}</span>
                  <span className="text-right">{t("col_price")}</span><span className="text-right">{t("total")}</span><span />
                </div>
              )}
              {groups.map((g, gi) => (
                <div key={g.head.id ?? gi} className="border-b border-border last:border-0">
                  {renderLine(g.head, false)}
                  {g.kids.map((k, ki) => <React.Fragment key={k.id ?? `${gi}-${ki}`}>{renderLine(k, true)}</React.Fragment>)}
                </div>
              ))}
            </div>
          )}

          {/* the internal note ←→ the money */}
          <div className="grid gap-5 border-t border-border bg-secondary/40 px-5 py-4 md:grid-cols-[1fr_300px]">
            <InlineNote wo={wo} onSaved={setWo} />
            <div className="flex flex-col">
              <Row label={t("sum_works")} value={money(worksSum)} mono />
              <Row label={t("materials")} value={money(materialsSum)} mono />
              {totalDiscount > 0 && (
                <>
                  <Row label={t("before_discount")} value={money(grossSubtotal)} mono />
                  <Row label={`${t("discount")} · ${discountPct}%`} value={<span className="text-success">−{money(totalDiscount)}</span>} mono />
                </>
              )}
              <div className="flex items-baseline justify-between gap-3 py-[3px]">
                <span className="text-[14px] font-medium text-ink-2">{t("discount")}{orderDiscount > 0 ? orderDiscLabel : ""}</span>
                {orderDiscount > 0 ? (
                  <button onClick={() => editable && setDiscount(true)} className="font-mono text-[14.5px] font-semibold text-success">−{money(orderDiscount)}</button>
                ) : editable ? (
                  <button onClick={() => setDiscount(true)} className="text-[13px] font-semibold text-primary-emphasis hover:underline">+ {t("wo_add_draft").toLowerCase()}</button>
                ) : <span className="font-mono text-[14.5px] text-muted-foreground">0</span>}
              </div>
              <Separator className="my-2" />
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-bold text-foreground">{t("total")}</span>
                <span className="font-mono text-[24px] font-bold tracking-[-0.02em] text-foreground">{money(total)} <span className="text-[14px] font-medium text-muted-foreground">{t("soum")}</span></span>
              </div>
              {totalCost > 0 && (
                <div className="mt-1 text-right text-[12px] text-muted-foreground">
                  {t("cost")} {money(totalCost)} · {t("margin")} {money(totalMargin)} ({marginPct}%)
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ── side column ── */}
        <div className="flex flex-col gap-3.5">
          <ContactCard wo={wo} customer={customer} audit={audit} state={state} />
          <Card className="p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("next_service")}</span>
              <button onClick={() => setNextService(true)} className="text-[13px] font-semibold text-primary-emphasis hover:underline">+ {t("wo_add_draft")}</button>
            </div>
            {nextReminder ? (
              <div className="flex items-start gap-2.5 rounded-[10px] bg-secondary/70 px-3 py-2.5">
                <Bell className="mt-0.5 size-4 shrink-0 text-primary-emphasis" />
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-foreground">{nextReminder.title}</div>
                  <div className="text-[12.5px] leading-snug text-muted-foreground">
                    {[nextReminder.dueDate ? shortDate(nextReminder.dueDate) : "", nextReminder.dueMileage ? `${Number(nextReminder.dueMileage).toLocaleString("ru-RU")} km` : ""].filter(Boolean).join(` ${t("next_or")} `)}
                    {nextReminder.dueDate && nextReminder.dueMileage ? ` — ${t("next_first")}` : ""}
                  </div>
                </div>
              </div>
            ) : <div className="text-[13px] text-muted-foreground">{t("next_none")}</div>}
          </Card>
          <HistoryCard audit={history} lang={lang} who={who} />
          {canCancel && (
            <button onClick={() => setConfirmCancel(true)} className="self-start px-1 text-[13.5px] font-semibold text-destructive hover:underline">{t("cancel_wo")}</button>
          )}
        </div>
      </div>

      {/* phone: the actions sit where the thumb is */}
      {phoneBar && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card p-3" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <div className="flex items-stretch gap-2 [&>button]:min-w-0 [&>button]:flex-1">{primaryButtons("lg")}<div className="shrink-0 [&_button]:h-full [&_button]:w-12">{menu}</div></div>
        </div>
      )}

      <AddLineItemModal open={addItem} initialMode={addMode} onClose={() => setAddItem(false)} onAdd={doAddItems} shopId={shopId} lang={lang} busy={busy} />
      <EditLineItemModal item={editItem} onClose={() => setEditItem(null)} onSave={doUpdateItem} busy={busy} />
      <AssignModal open={assigning} onClose={() => setAssigning(false)} mechanics={mechanics} current={wo.assignedMechanicId} onPick={doAssign} />
      <PaymentPanel open={invoice}
        onClose={() => {
          setInvoice(false);
          if (closedWhilePaying.current) { closedWhilePaying.current = false; setNextService(true); }
        }} wo={wo} shopId={shopId} total={total} customer={customer} onChange={load} />
      <OrderDiscountModal open={discount} onClose={() => setDiscount(false)} wo={wo} onSaved={() => { setDiscount(false); load(); }} />
      <ApprovalModal approval={approval} onClose={() => setApproval(null)} />
      <NextServiceModal open={nextService} onClose={() => { setNextService(false); loadReminders(); }} wo={wo} shopId={shopId} />
      {/* An order that drew stock has to say what became of it before it can be called off;
          one that drew none has nothing to settle and keeps the plain confirm. */}
      {returnable.length > 0 ? (
        <MaterialReturnDialog
          open={confirmCancel}
          title={t("cancel_wo")}
          warning={t("cancel_wo_confirm")}
          confirmLabel={t("cancel_wo")}
          materials={returnable}
          busy={busy}
          onClose={() => setConfirmCancel(false)}
          onConfirm={async (returns) => { setConfirmCancel(false); await doTransition("canceled", returns); }}
        />
      ) : (
        <Dialog open={confirmCancel} onOpenChange={(o) => !o && setConfirmCancel(false)}>
          <DialogContent className="max-w-[400px]">
            <DialogHeader><DialogTitle>{t("cancel_wo")}</DialogTitle></DialogHeader>
            <DialogBody className="py-1"><div className="text-[14px] leading-relaxed text-ink-2">{t("cancel_wo_confirm")}</div></DialogBody>
            <DialogFooter>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirmCancel(false)}>{t("no")}</Button>
              <Button variant="destructive" disabled={busy} onClick={async () => { setConfirmCancel(false); await doTransition("canceled"); }}>{busy ? <Spinner /> : t("cancel_wo")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );

  // One row of the jobs table: a job with its status and who is doing it, or a material with
  // where it came from. A plain function called in place rather than a component, so a
  // refresh re-renders the row instead of remounting it (which would close an open menu).
  function renderLine(it: LineItem, nested: boolean) {
    const kind = kindFromProto(it.kind);
    const material = kindIsMaterial(kind);
    const defPrice = num(it.defaultPrice);
    const lineDiscount = defPrice > num(it.unitPrice) ? (defPrice - num(it.unitPrice)) * (it.quantity || 0) : 0;
    const ls = lineStatusFromProto(it.status);
    const status = ls === "done" ? { tone: "ok" as const, label: t("ln_done") }
      : ls === "in_progress" ? { tone: "warn" as const, label: t("ln_inprogress") }
      : { tone: "neutral" as const, label: t("ln_pending") };
    const actions = editable && it.id ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("edit")} disabled={busy}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditItem(it)}><Pencil /> {t("edit")}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => doRemoveItem(it.id)}><Trash2 /> {t("remove")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : <span />;
    const doer = !material ? (editable ? (
      <Select value={it.assignedMechanicId || NONE} disabled={busy} onValueChange={(v) => it.id && doAssignLine(it.id, v === NONE ? "" : v)}>
        <SelectTrigger size="sm" className="w-full">
          <span className="flex min-w-0 items-center gap-2">
            {it.assignedMechanicId && <StaffDot id={it.assignedMechanicId} name={who(it.assignedMechanicId)} size={20} />}
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("unassigned")}</SelectItem>
          {mechanics.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
        </SelectContent>
      </Select>
    ) : it.assignedMechanicId ? (
      <span className="inline-flex items-center gap-2 text-[13px] text-foreground"><StaffDot id={it.assignedMechanicId} name={who(it.assignedMechanicId)} size={20} />{who(it.assignedMechanicId) || "—"}</span>
    ) : <span className="text-[13px] text-muted-foreground">—</span>) : <span />;
    const icon = material
      ? <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-info-soft text-info"><Package className="size-4" /></span>
      : <span className={cn("grid size-8 shrink-0 place-items-center rounded-[8px]", ls === "done" ? "bg-success-soft text-success" : ls === "in_progress" ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary-emphasis")}>
          {ls === "done" ? <Check className="size-4" /> : ls === "in_progress" ? <Clock className="size-4" /> : <Wrench className="size-4" />}
        </span>;
    const desc = (
      <div className="min-w-0">
        <div className={cn("text-foreground", nested ? "text-[13.5px] font-medium" : "text-[14.5px] font-semibold")}>
          {it.description}
          {material && it.variantId && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 align-middle text-[11px] font-semibold text-muted-foreground">{t("from_stock_chip")}</span>}
        </div>
        {!material && <div className="mt-1"><Badge tone={status.tone} dot>{status.label}</Badge></div>}
      </div>
    );
    const price = (
      <div className="text-right font-mono text-[13.5px] text-ink-2">
        {money(it.unitPrice)}
        {lineDiscount > 0 && <div className="text-[11.5px] text-muted-foreground line-through">{money(defPrice)}</div>}
      </div>
    );
    const lineTotal = (
      <div className="text-right">
        <div className={cn("font-mono text-foreground", nested ? "text-[13.5px] font-medium" : "text-[14.5px] font-bold")}>{money(num(it.unitPrice) * (it.quantity || 0))}</div>
        {lineDiscount > 0 && <div className="font-mono text-[11px] text-success">−{money(lineDiscount)}</div>}
      </div>
    );

    if (isMobile) {
      return (
        <div className={cn("flex items-start gap-3 px-4 py-3", nested && "pl-12")}>
          {!nested && icon}
          <div className="min-w-0 flex-1">
            {desc}
            <div className="mt-1 font-mono text-[12.5px] text-muted-foreground">{money(it.unitPrice)} × {qtyUnit(t, it.quantity, it.unit)}</div>
            {!material && <div className="mt-2 max-w-[240px]">{doer}</div>}
          </div>
          {lineTotal}
          {actions}
        </div>
      );
    }
    return (
      <div className={cn("grid grid-cols-[minmax(0,1fr)_170px_70px_110px_120px_36px] items-center gap-3 px-5", nested ? "py-2 pl-[68px]" : "py-3")}>
        <div className="flex min-w-0 items-center gap-3">{!nested && icon}{desc}</div>
        <div className="min-w-0">{doer}</div>
        <div className="text-right font-mono text-[13.5px] text-ink-2">{qtyUnit(t, it.quantity, it.unit)}</div>
        {price}
        {lineTotal}
        {actions}
      </div>
    );
  }
}

/* ── the status flow, with when each step happened ── */
function Stepper({ state, enabled, audit, done, total, compact }: {
  state: WoState; enabled?: string[]; audit: AuditEntry[]; done: number; total: number; compact: boolean;
}) {
  const { t } = useLang();
  const on = enabledSet(enabled);
  const steps = CANONICAL.filter((s) => on.has(s) || s === state);
  // When the order reached each status: the latest audit entry that moved it there.
  const reachedAt = new Map<WoState, string>();
  let canceledFrom: WoState | undefined;
  for (const e of [...audit].reverse()) {
    if (e.action !== "state") continue;
    const to = TRANSITION_TO.exec(e.detail || "")?.[1];
    if (!to) continue;
    const s = woStateFromProto(to);
    reachedAt.set(s, e.createdAt);
    if (s === "canceled") canceledFrom = woStateFromProto(TRANSITION_FROM.exec(e.detail || "")?.[1]);
  }
  const approvedAt = audit.find((e) => e.action === "approved")?.createdAt;
  const current = state === "canceled" ? (canceledFrom ?? "draft") : state;
  const idx = steps.indexOf(current);
  const label = (s: WoState) => (s === "invoiced" ? t("step_invoice") : t(STATE_LABEL[s]));
  const sub = (s: WoState, i: number) => {
    if (i < idx || (i === idx && state === "closed")) {
      if (s === "approved" && approvedAt) return `Telegram, ${hhmm(approvedAt)}`;
      const at = reachedAt.get(s);
      return at ? (isToday(at) ? hhmm(at) : shortDate(at)) : "";
    }
    if (i === idx && s === "in_progress" && total > 0) return `${done}/${total} ${t("jobs_short")}`;
    return "";
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1 px-1">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <span className={cn("size-3 shrink-0 rounded-full", i < idx || (i === idx && state === "closed") ? "bg-success" : i === idx ? (state === "canceled" ? "bg-destructive" : "bg-warning ring-4 ring-warning/20") : "bg-secondary border border-border")} />
            {i < steps.length - 1 && <span className={cn("h-0.5 flex-1 rounded-full", i < idx ? "bg-success" : "bg-border")} />}
          </React.Fragment>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[720px] items-start">
        {steps.map((s, i) => {
          const passed = i < idx || (i === idx && state === "closed");
          const cur = i === idx && !passed;
          return (
            <React.Fragment key={s}>
              <div className="flex min-w-0 shrink-0 items-start gap-2">
                <span className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2",
                  passed ? "border-success bg-success text-white" : cur ? (state === "canceled" ? "border-destructive bg-destructive-soft text-destructive" : "border-warning bg-warning-soft text-warning ring-4 ring-warning/15") : "border-border bg-card",
                )}>
                  {passed ? <Check className="size-3.5" strokeWidth={3} /> : cur ? (state === "canceled" ? <X className="size-3" strokeWidth={3} /> : <span className="size-2 rounded-full bg-current" />) : null}
                </span>
                <div className="min-w-0">
                  <div className={cn("whitespace-nowrap text-[13px]", passed ? "font-semibold text-success" : cur ? "font-bold text-warning" : "font-medium text-muted-foreground")}>{label(s)}</div>
                  {sub(s, i) && <div className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">{sub(s, i)}</div>}
                </div>
              </div>
              {i < steps.length - 1 && <span className={cn("mx-3 mt-3.5 h-0.5 min-w-6 flex-1 rounded-full", i < idx ? "bg-success" : "bg-border")} />}
            </React.Fragment>
          );
        })}
        {state === "canceled" && (
          <span className="ml-4 mt-0.5 shrink-0 rounded-full bg-destructive-soft px-2.5 py-1 text-[12px] font-bold text-destructive">{t("st_canceled")}</span>
        )}
      </div>
    </div>
  );
}

/* ── how the client has been kept informed ── */
function ContactCard({ wo, customer, audit, state }: { wo: WorkOrder; customer: Customer | null; audit: AuditEntry[]; state: WoState }) {
  const { t } = useLang();
  const linked = !!customer?.telegramChatId;
  const approved = audit.find((e) => e.action === "approved");
  const declined = audit.find((e) => e.action === "declined");
  const phone = wo.customerPhone || customer?.phone || "";
  const handle = (customer?.telegramHandle || "").replace(/^@/, "");
  const messageHref = handle ? `https://t.me/${handle}` : phone ? `sms:${phone}` : undefined;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("contact_title")}</span>
        {customer && <Badge tone={linked ? "ok" : "neutral"}>{linked ? t("tg_linked") : t("tg_not_linked")}</Badge>}
      </div>
      <div className="mb-3 flex flex-col gap-1.5 text-[13.5px]">
        {approved ? (
          <div className="flex items-center gap-2 text-foreground"><Check className="size-4 text-success" />{t("est_approved")}<span className="ml-auto font-mono text-[12px] text-muted-foreground">{hhmm(approved.createdAt)}</span></div>
        ) : declined ? (
          <div className="flex items-center gap-2 text-foreground"><X className="size-4 text-destructive" />{t("est_declined")}<span className="ml-auto font-mono text-[12px] text-muted-foreground">{hhmm(declined.createdAt)}</span></div>
        ) : state === "estimated" ? (
          <div className="flex items-center gap-2 text-ink-2"><Clock className="size-4 text-warning" />{t("est_waiting")}</div>
        ) : state === "draft" ? (
          <div className="flex items-center gap-2 text-ink-2"><Clock className="size-4 text-muted-foreground" />{t("est_not_sent")}</div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" asChild={!!phone} disabled={!phone}>
          {phone ? <a href={`tel:${phone}`}><Phone /> {t("call")}</a> : <span><Phone /> {t("call")}</span>}
        </Button>
        <Button variant="secondary" size="sm" asChild={!!messageHref} disabled={!messageHref}>
          {messageHref ? <a href={messageHref} target={handle ? "_blank" : undefined} rel="noreferrer"><MessageSquare /> {t("msg")}</a> : <span><MessageSquare /> {t("msg")}</span>}
        </Button>
      </div>
    </Card>
  );
}

/* ── everything that happened to the order ── */
function HistoryCard({ audit, lang, who }: { audit: AuditEntry[]; lang: string; who: (id?: string) => string }) {
  const { t } = useLang();
  const [all, setAll] = useState(false);
  if (audit.length === 0) return null;
  const dot = (a: string) => a === "approved" || a === "payment" ? "bg-success" : a === "declined" ? "bg-destructive" : a === "state" ? "bg-primary" : a === "materials_returned" ? "bg-warning" : "bg-ink-3";
  const shown = all ? audit : audit.slice(0, 6);
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("history")}</span>
        {isToday(audit[0]?.createdAt) && <span className="text-[12px] text-muted-foreground">{t("today").toLowerCase()}</span>}
      </div>
      <div className="flex flex-col gap-3">
        {shown.map((e) => {
          // An assignment's detail is a staff id; the reader wants the name.
          const detail = e.action === "mechanic_assigned" || e.action === "mechanic_unassigned"
            ? (who(e.detail ?? "") || "") : auditDetail(lang as "uz", e.action, e.detail);
          const actor = who(e.actorId);
          return (
            <div key={e.id} className="flex gap-2.5">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", dot(e.action))} />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] text-foreground">
                  {auditAction(lang as "uz", e.action)}
                  {detail ? <span className="text-ink-2"> · {detail}</span> : null}
                </div>
                <div className="font-mono text-[11.5px] text-muted-foreground">
                  {isToday(e.createdAt) ? hhmm(e.createdAt) : `${shortDate(e.createdAt)} ${hhmm(e.createdAt)}`}{actor ? ` · ${actor}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {audit.length > 6 && (
        <button onClick={() => setAll((v) => !v)} className="mt-3 text-[13px] font-semibold text-primary-emphasis hover:underline">
          {all ? t("dash_more") : t("full_log")}
        </button>
      )}
    </Card>
  );
}

/* ── the internal note, beside the totals ── */
// Internal to the shop — never printed on the client's check or sent with their copy — and
// editable at any point in the order's life, because the useful moment to write one is often
// after the work is finished.
function InlineNote({ wo, onSaved }: { wo: WorkOrder; onSaved: (w: WorkOrder) => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(wo.notes ?? "");
  const [saving, setSaving] = useState(false);
  // Re-sync when the order reloads under us, but never while somebody is typing.
  useEffect(() => { if (!editing) setDraft(wo.notes ?? ""); }, [wo.notes, editing]);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      onSaved(await api.setNotes(wo.id, draft.trim()));
      setEditing(false);
      toast(t("save"), { icon: "check" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally { setSaving(false); }
  };
  const has = (wo.notes ?? "").trim().length > 0;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("note_hidden")}</span>
        {!editing && <button onClick={() => { setDraft(wo.notes ?? ""); setEditing(true); }} className="text-[12.5px] font-semibold text-primary-emphasis hover:underline">{has ? t("edit") : `+ ${t("add_note")}`}</button>}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea value={draft} rows={3} maxLength={4000} autoFocus placeholder={t("note_placeholder")}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)} />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={saving} onClick={save}>{saving ? <Spinner /> : t("save")}</Button>
            <Button size="sm" variant="secondary" disabled={saving} onClick={() => { setDraft(wo.notes ?? ""); setEditing(false); }}>{t("cancel")}</Button>
          </div>
        </div>
      ) : has ? (
        <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">{wo.notes}</div>
      ) : (
        <div className="text-[13px] text-muted-foreground">{t("note_internal_hint")}</div>
      )}
    </div>
  );
}

/* ── taking the money: the receipt beside the payment ── */
function PaymentPanel({ open, onClose, wo, shopId, total, customer, onChange }: {
  open: boolean; onClose: () => void; wo: WorkOrder; shopId: string; total: number; customer: Customer | null; onChange: () => void;
}) {
  const shopProfile = useShopProfile();
  const { t } = useLang();
  const { toast } = useToast();
  const { session } = useAuth();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<ShopCard[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");
  const [split, setSplit] = useState(false);
  const [pickedCard, setPickedCard] = useState("");
  const [adhoc, setAdhoc] = useState("");

  useEffect(() => {
    if (!open) { setInv(null); setMethod("cash"); setReceived(""); setSplit(false); setPickedCard(""); setAdhoc(""); return; }
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const all = await api.listInvoices(shopId);
        let existing = all.find((i) => i.workOrderId === wo.id);
        if (!existing) {
          existing = await api.generateInvoice(shopId, wo.id, total);
          if (woStateFromProto(wo.state) === "ready") {
            try { await api.transition(wo.id, "invoiced"); } catch { /* best effort */ }
          }
        }
        if (!cancelled) setInv(existing);
        onChange();
      } catch (e) {
        if (!cancelled) toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    // the shop's receiving cards for the card payment (best effort)
    // A shop with one receiving card has nothing to choose, so it is chosen.
    api.listShopCards().then((c) => {
      if (cancelled) return;
      const active = c.filter((x) => x.active !== false);
      setCards(active);
      if (active.length === 1) setPickedCard(active[0].id);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, wo.id, shopId, total, onChange, t, toast, wo.state]);

  const due = inv ? Math.max(0, num(inv.total) - num(inv.paidAmount)) : total;
  const got = parseInt(received.replace(/\D/g, ""), 10) || 0;
  const change = method === "cash" && got > due ? got - due : 0;
  const short = method === "cash" && got > 0 && got < due;
  // The notes a cashier is actually handed for this bill: the exact sum, then the next round
  // figures above it.
  const quick = Array.from(new Set([100_000, 500_000, 1_000_000].map((s) => Math.ceil(due / s) * s).filter((v) => v > due))).slice(0, 3);

  const pay = async (m: PaymentMethod, card?: { cardId?: string; cardNumber?: string }) => {
    if (!inv || busy) return;
    setBusy(true);
    try { const updated = await api.markPaid(inv.id, m, card); setInv(updated); toast(t("paid"), { icon: "money" }); onChange(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };
  // The same bill, settled several ways at once. Recorded together or not at all.
  const paySplit = async (parts: PaymentPart[]) => {
    if (!inv || busy) return;
    setBusy(true);
    try { const updated = await api.payInvoice(inv.id, parts); setInv(updated); setSplit(false); toast(t("paid"), { icon: "money" }); onChange(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };
  const confirm = () => {
    if (method === "card") {
      const chosen = cards.find((c) => c.id === pickedCard);
      const number = chosen ? chosen.cardNumber : adhoc.trim();
      if (!number) { toast(t("card_required"), { icon: "alert", tone: "danger" }); return; }
      void pay("card", { cardId: chosen ? chosen.id : undefined, cardNumber: number });
      return;
    }
    void pay(method);
  };

  const METHODS: { key: PaymentMethod; icon: React.ReactNode; label: string }[] = [
    { key: "cash", icon: <Banknote className="size-5" />, label: t("pay_cash") },
    { key: "card", icon: <CreditCard className="size-5" />, label: t("pay_card") },
    { key: "transfer", icon: <Landmark className="size-5" />, label: t("pay_transfer") },
    { key: "credit", icon: <HandCoins className="size-5" />, label: t("pay_credit") },
  ];
  const linked = !!customer?.telegramChatId;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" wide className="p-0">
        {!inv ? (
          <>
            <DialogHeader><DialogTitle>{t("act_take_payment")}</DialogTitle></DialogHeader>
            <div className="flex flex-1 justify-center py-16"><Spinner className="size-6" /></div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:grid md:grid-cols-[1fr_1fr] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden">
            {/* what the client will see */}
            <div className="flex flex-col gap-3 bg-secondary/60 p-5 md:min-h-0 md:overflow-y-auto">
              <div className="flex items-center justify-between gap-2 pr-10 md:pr-0">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("check_customer_sees")}</span>
                <Badge tone="ok">{t("fiscal_badge")}</Badge>
              </div>
              {/* shrink-0: the column scrolls, the receipt never gets squeezed to fit it — a
                  squeezed receipt clipped its own bottom, QR and all, with nothing to scroll. */}
              <div className="shrink-0 overflow-hidden rounded-[12px] border border-border shadow-[var(--shadow)]">
                <FiscalCheck invoice={inv} wo={wo} shop={shopProfile} />
              </div>
              <Button variant="secondary" className="shrink-0" onClick={() => window.open(`/print-invoice/${inv.id}`, "_blank")}><Printer /> {t("print")}</Button>
            </div>

            {/* taking it */}
            <div className="flex flex-col gap-4 p-5 md:min-h-0 md:overflow-y-auto">
              <div className="pr-10">
                <DialogTitle>{inv.paid ? t("paid") : t("act_take_payment")}</DialogTitle>
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  {[orderLabel(wo), [wo.make, wo.model].filter(Boolean).join(" "), wo.customerName].filter(Boolean).join(" · ")}
                </div>
              </div>

              {inv.paid ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 rounded-[12px] bg-success-soft p-4 text-success">
                    <Check className="size-6" />
                    <div>
                      <div className="text-[15px] font-bold">{t("paid")}</div>
                      <div className="font-mono text-[13px]">{money(num(inv.total))} {t("soum")}</div>
                    </div>
                  </div>
                  {inv.cardNumber && (
                    <div className="flex items-center gap-2 rounded-[9px] border border-border bg-secondary px-3 py-2 text-[13px]">
                      <CreditCard className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{t("received_on")}</span>
                      <span className="ml-auto font-mono font-semibold">{inv.cardNumber}</span>
                    </div>
                  )}
                  <div className="text-[12.5px] text-muted-foreground">{linked ? t("receipt_auto_tg") : t("receipt_no_tg")}</div>
                </div>
              ) : split ? (
                <SplitPayment total={due} cards={cards} busy={busy} allowCredit onBack={() => setSplit(false)} onPay={paySplit} />
              ) : (
                <>
                  <div>
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("payment_method")}</div>
                    <div className="grid grid-cols-4 gap-2">
                      {METHODS.map((m) => (
                        <button key={m.key} onClick={() => setMethod(m.key)} aria-pressed={method === m.key}
                          className={cn(
                            "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-[12px] border text-[13px] font-semibold transition-colors",
                            method === m.key ? "border-primary bg-primary-soft text-primary-emphasis" : "border-border bg-card text-ink-2 hover:bg-secondary",
                          )}>
                          {m.icon}{m.label}
                        </button>
                      ))}
                    </div>
                    {/* Picks the method like the four above; the confirm button below takes the money. */}
                    <button onClick={() => setMethod("other")} aria-pressed={method === "other"}
                      className={cn(
                        "-mx-2 mt-1.5 inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[12.5px] font-semibold transition-colors",
                        method === "other" ? "bg-primary-soft text-primary-emphasis" : "text-muted-foreground hover:text-foreground",
                      )}>
                      <Wallet className="size-3.5" /> {t("other_method")}
                    </button>
                  </div>

                  {method === "cash" && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("received_amount")}</span>
                        <span className="text-[12.5px] text-muted-foreground">{t("to_pay")}: <span className="font-mono font-bold text-foreground">{money(due)}</span></span>
                      </div>
                      <div className="relative">
                        <Input value={received ? money(got) : ""} inputMode="numeric" placeholder={money(due)}
                          onChange={(e) => setReceived(e.target.value.replace(/\D/g, ""))}
                          className="h-14 pr-14 font-mono text-[24px] font-bold" />
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground">{t("soum")}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setReceived(String(due))} className="rounded-[9px] border border-primary/40 bg-primary-soft px-3 py-1.5 font-mono text-[13px] font-semibold text-primary-emphasis">{t("exact")}: {money(due)}</button>
                        {quick.map((v) => (
                          <button key={v} onClick={() => setReceived(String(v))} className="rounded-[9px] border border-border bg-card px-3 py-1.5 font-mono text-[13px] font-semibold text-foreground hover:bg-secondary">{money(v)}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {method === "card" && (
                    <div className="flex flex-col gap-2">
                      {cards.map((c) => (
                        <button key={c.id} disabled={busy} onClick={() => { setPickedCard(c.id); setAdhoc(""); }}
                          className={cn("flex items-center gap-3 rounded-[9px] border px-3 py-2.5 text-left transition-colors", pickedCard === c.id ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary")}>
                          <CreditCard className="size-4 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            {c.label && <div className="truncate text-[13.5px] font-semibold">{c.label}</div>}
                            <div className="truncate font-mono text-[13px] text-muted-foreground">{c.cardNumber}</div>
                          </div>
                          {pickedCard === c.id && <Check className="size-[17px] text-primary-emphasis" />}
                        </button>
                      ))}
                      <Input value={adhoc} inputMode="numeric" placeholder={cards.length > 0 ? `${t("new_card")} · 8600 0000 0000 0000` : "8600 0000 0000 0000"}
                        onChange={(e) => { setAdhoc(e.target.value); if (e.target.value) setPickedCard(""); }} className="font-mono" />
                    </div>
                  )}

                  {method === "credit" && <p className="text-[12.5px] leading-snug text-muted-foreground">{t("credit_hint")}</p>}

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className={cn("rounded-[12px] p-3", change > 0 ? "bg-success-soft" : short ? "bg-destructive-soft" : "bg-secondary")}>
                      <div className={cn("text-[11px] font-bold uppercase tracking-[0.06em]", change > 0 ? "text-success" : short ? "text-destructive" : "text-muted-foreground")}>{short ? t("amount_short") : t("change_due")}</div>
                      <div className={cn("font-mono text-[20px] font-bold", change > 0 ? "text-success" : short ? "text-destructive" : "text-foreground")}>
                        {short ? `−${money(due - got)}` : money(change)} <span className="text-[13px] font-medium">{t("soum")}</span>
                      </div>
                    </div>
                    <div className="rounded-[12px] bg-secondary p-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("pay_cashier")}</div>
                      <div className="truncate text-[14.5px] font-semibold text-foreground">{session?.staff.name || "—"}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-[12px] border border-border p-3">
                    <div>
                      <div className="text-[14px] font-semibold text-foreground">{t("split_payment")}</div>
                      <div className="text-[12.5px] text-muted-foreground">{t("split_hint_short")}</div>
                    </div>
                    <Switch checked={split} onCheckedChange={setSplit} />
                  </div>

                  <div>
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("receipt_send")}</div>
                    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold", linked ? "border-primary/40 bg-primary-soft text-primary-emphasis" : "border-border text-muted-foreground")}>
                        {linked && <Check className="size-3.5" />} Telegram
                      </span>
                      {wo.customerPhone && <span className="font-mono text-muted-foreground">{wo.customerPhone}</span>}
                    </div>
                    <div className="mt-1.5 text-[12px] text-muted-foreground">{linked ? t("receipt_auto_tg") : t("receipt_no_tg")}</div>
                  </div>

                  <div className="mt-auto flex flex-col gap-2 pt-2">
                    <Button size="lg" disabled={busy || short || (method === "card" && !pickedCard && !adhoc.trim())} onClick={confirm}>
                      {busy ? <Spinner /> : <>{t("confirm_payment")} — {money(due)} {t("soum")}</>}
                    </Button>
                    <p className="text-center text-[12px] text-muted-foreground">{t("pay_fiscal_note")}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
