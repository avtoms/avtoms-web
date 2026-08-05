"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, CalendarDays, Check, Gauge, Phone, Play, Plus, RotateCcw, Send, Square, Timer, Users,
} from "lucide-react";
import { useAuth, useLang, useToast } from "@/components/providers";
import { Btn, Field, TextInput, Segmented, Modal, Empty, Spinner, useIsMobile } from "@/components/ui";
import { Card } from "@/components/ui-kit/card";
import { Button } from "@/components/ui-kit/button";
import { Badge } from "@/components/ui-kit/badge";
import { Skeleton } from "@/components/ui-kit/misc";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui-kit/tabs";
import { MoneyInput, qtyUnit } from "@/components/catalog-fields";
import { useAutoRefresh } from "@/lib/use-refresh";
import { api, ApiError } from "@/lib/api";
import { woStateFromProto, kindFromProto, kindIsMaterial, LINE_ITEM_KINDS, lineStatusFromProto, lineStatusToProto, STATE_LABEL, type WoState, type LineItemKind, type LineItemStatus } from "@/lib/enums";
import { money, num, durationFmt, minutesBetween, orderLabel, vehicleTitle, shortDate, shortDateTime } from "@/lib/format";
import { PlatePreview } from "@/components/plate";
import { CarImage } from "@/components/car-image";
import { auditAction, auditDetail } from "@/lib/system-text";
import { cn } from "@/lib/utils";
import type { WorkOrder, MenuItem, AuditEntry, Vehicle, Customer } from "@/lib/types";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));

// The state badge tone mirrors the board columns, so a status means the same colour wherever
// the mechanic sees it.
const STATE_TONE: Record<string, "neutral" | "accent" | "warn" | "ok" | "danger" | "info"> = {
  draft: "neutral", estimated: "info", approved: "accent", in_progress: "warn",
  ready: "ok", invoiced: "accent", closed: "neutral", canceled: "danger",
};

// Payload for adding a line item (agreed price + optional shop cost + price-list origin).
type LineItemInput = {
  kind: LineItemKind; description: string; unitPrice: number; quantity: number;
  cost?: number; menuItemId?: string; defaultPrice?: number;
};

function PanelTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">{children}</h3>
      {right}
    </div>
  );
}

/* ── live ticking elapsed for a running timer ── */
function useElapsed(startedAt: string | null) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const iv = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [startedAt]);
  return startedAt ? minutesBetween(startedAt, undefined) : 0;
}

// Per-service-line progress control for the mechanic. Editable lines (assigned to me or
// unassigned) get Start/Finish buttons; others show a read-only status badge.
function LineStatusControl({ status, editable, busy, t, onSet }: {
  status: LineItemStatus; editable: boolean; busy: boolean; t: (k: string) => string;
  onSet: (next: LineItemStatus) => void;
}) {
  if (!editable) {
    const m = status === "done" ? { tone: "ok" as const, label: t("ln_done") }
      : status === "in_progress" ? { tone: "warn" as const, label: t("ln_inprogress") }
      : { tone: "neutral" as const, label: t("ln_pending") };
    return <Badge tone={m.tone} dot>{m.label}</Badge>;
  }
  if (status === "pending")
    return <Button variant="soft" size="sm" disabled={busy} onClick={() => onSet("in_progress")}><Play />{t("ln_start")}</Button>;
  if (status === "in_progress")
    return (
      <div className="flex items-center gap-2">
        <Badge tone="warn" dot>{t("ln_inprogress")}</Badge>
        <Button size="sm" disabled={busy} onClick={() => onSet("done")}><Check />{t("ln_finish")}</Button>
      </div>
    );
  return (
    <div className="flex items-center gap-2">
      <Badge tone="ok" dot>{t("ln_done")}</Badge>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => onSet("in_progress")}><RotateCcw />{t("ln_reopen")}</Button>
    </div>
  );
}

function AddLineItemModal({ open, onClose, shopId, onAdd, t }: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  onAdd: (item: LineItemInput) => Promise<void>;
  t: (k: string) => string;
}) {
  const { lang } = useLang();
  const [mode, setMode] = useState<"menu" | "custom">("menu");
  const [kind, setKind] = useState<LineItemKind>("service");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState("1");
  const [from, setFrom] = useState<{ menuItemId: string; defaultPrice: number }>({ menuItemId: "", defaultPrice: 0 });
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [maxDiscount, setMaxDiscount] = useState(100); // shop discount cap %; 100 = no cap
  const [saving, setSaving] = useState(false);

  const reset = () => { setKind("service"); setDesc(""); setPrice(""); setCost(""); setQty("1"); setFrom({ menuItemId: "", defaultPrice: 0 }); };

  useEffect(() => {
    if (!open) return;
    setMode("menu"); reset();
    api.listMenuItems(shopId).then((items) => setMenu(items.filter((m) => m.active))).catch(() => setMenu([]));
    api.getShopSettings().then((s) => setMaxDiscount(s.maxDiscountPercent)).catch(() => setMaxDiscount(100));
  }, [open, shopId]);

  const menuName = (m: MenuItem) => (lang === "ru" ? m.nameRu : lang === "uzc" ? m.nameUzCyrl : m.nameUzLatn) || m.nameUzLatn;

  // Prefill the editor from a price-list item so the price can be negotiated before adding.
  const pickMenu = (m: MenuItem) => {
    setKind("service");
    setDesc(menuName(m));
    setPrice(String(num(m.defaultPrice)));
    setCost(String(num(m.defaultCost)));
    setFrom({ menuItemId: m.id, defaultPrice: num(m.defaultPrice) });
    setMode("custom");
  };

  const addCustom = async () => {
    if (!desc.trim() || !price) return;
    setSaving(true);
    try {
      // A material may be fractional (e.g. 3.5 L); a service stays whole. The line total is
      // unit_price × quantity.
      const q = kind === "material" ? (parseFloat(qty) || 1) : (parseInt(qty, 10) || 1);
      await onAdd({
        kind, description: desc.trim(),
        unitPrice: parseInt(price, 10) || 0,
        quantity: q,
        cost: parseInt(cost, 10) || 0,
        menuItemId: from.menuItemId || undefined,
        defaultPrice: from.defaultPrice || undefined,
      });
      onClose();
    } catch { /* surfaced by parent toast */ } finally { setSaving(false); }
  };

  const agreed = parseInt(price, 10) || 0;
  const discount = from.defaultPrice > agreed ? from.defaultPrice - agreed : 0;
  // Mechanics are held to the shop's discount cap (the gateway blocks an override for them).
  const overCap = from.defaultPrice > 0 && maxDiscount < 100 && agreed * 100 < from.defaultPrice * (100 - maxDiscount);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("add_item")}
      maxWidth={460}
      footer={mode === "custom" ? (
        <>
          <Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn>
          <Btn variant="primary" icon="plus" disabled={saving || overCap} onClick={() => void addCustom()}>{t("add")}</Btn>
        </>
      ) : null}
    >
      <Segmented options={[{ value: "menu", label: t("from_menu") }, { value: "custom", label: t("custom_item") }]} value={mode} onChange={(v) => { const nv = v as "menu" | "custom"; if (nv === "custom" && mode === "menu") reset(); setMode(nv); }} style={{ marginBottom: 16, width: "100%" }} />
      {mode === "menu" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 360, overflowY: "auto" }}>
          {menu === null && <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Spinner /></div>}
          {menu !== null && menu.length === 0 && <Empty icon="list" text={t("empty")} />}
          {menu?.map((m) => (
            <button key={m.id} onClick={() => pickMenu(m)} disabled={saving} className="an-row-btn" style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px",
              border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--surface)", cursor: "pointer",
              fontFamily: "var(--font-sans)", textAlign: "left",
            }}>
              <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{menuName(m)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink-2)", fontSize: 14 }}>{money(m.defaultPrice)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Segmented options={LINE_ITEM_KINDS.map((k) => ({ value: k, label: t(k) }))} value={kind} onChange={(v) => setKind(v as LineItemKind)} style={{ width: "100%" }} />
          <Field label={t("description")}><TextInput value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("description")} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 76px", gap: 10 }}>
            <Field label={t("sell_price")}><MoneyInput value={price} onChange={setPrice} /></Field>
            <Field label={t("qty")}><TextInput value={qty} onChange={(e) => setQty(e.target.value.replace(kind === "material" ? /[^\d.]/g : /\D/g, ""))} inputMode={kind === "material" ? "decimal" : "numeric"} style={{ fontFamily: "var(--font-mono)", textAlign: "center" }} /></Field>
          </div>
          {from.defaultPrice > 0 && (
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>{t("menu_price")}: <span style={{ fontFamily: "var(--font-mono)" }}>{money(from.defaultPrice)}</span></span>
              {discount > 0 && <span style={{ color: overCap ? "var(--danger)" : "var(--accent-2)" }}>{t("discount")}: −{money(discount)}</span>}
            </div>
          )}
          {overCap && (
            <div style={{ fontSize: 12.5, color: "var(--danger)", fontWeight: 600 }}>
              {t("discount_exceeds_limit")} ({t("max_discount")}: {maxDiscount}%)
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ── order history ── */
function Timeline({ entries, limit }: { entries: AuditEntry[]; limit?: number }) {
  const { t, lang } = useLang();
  const shown = limit ? entries.slice(0, limit) : entries;
  if (shown.length === 0) return <div className="py-4 text-center text-[13px] text-muted-foreground">{t("no_history")}</div>;
  return (
    <div className="flex flex-col">
      {shown.map((e, i) => (
        <div key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < shown.length - 1 && <span className="absolute bottom-0 left-[5px] top-4 w-px bg-border" />}
          <span className={cn("mt-1 size-[11px] shrink-0 rounded-full border-2", i === 0 ? "border-primary-soft bg-primary" : "border-secondary bg-ink-3")} />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold text-foreground">
              {auditAction(lang, e.action)}
              {auditDetail(lang, e.action, e.detail)
                ? <span className="font-medium text-ink-2"> · {auditDetail(lang, e.action, e.detail)}</span> : null}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">{shortDateTime(e.createdAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MechanicWoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useLang();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const woId = String(params.id);
  const mechanicId = session?.staff.id ?? "";
  const shopId = session?.staff.shopId ?? "";

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  // Context the work order doesn't carry: the car's odometer and the owner's contacts. Both
  // are best-effort — the page is fully usable without them.
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [visits, setVisits] = useState(0);

  // running timer: track the started_at returned by start/stop so we can tick live elapsed.
  const [runningSince, setRunningSince] = useState<string | null>(null);
  const liveMins = useElapsed(runningSince);

  const load = useCallback(async () => {
    try {
      const data = await api.getWorkOrder(woId);
      setWo(data);
      // restore a running timer (e.g. after a page reload) from the work order itself
      setRunningSince(data.activeTimerStartedAt || null);
      api.getAuditLog(woId)
        .then((e) => setEntries([...e].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))))
        .catch(() => {});
    } catch (e) {
      toast(errMsg(e), { tone: "danger", icon: "alert" });
    } finally {
      setLoading(false);
    }
  }, [woId, toast]);

  useEffect(() => { void load(); }, [load]);
  useAutoRefresh(load);

  // Resolve the car (for its odometer) from the plate, then its owner (for call/Telegram) and
  // how often this car has been in. Every step is optional and silent on failure.
  const plate = wo?.plate;
  useEffect(() => {
    if (!shopId || !plate) return;
    let cancelled = false;
    api.searchVehicles(shopId, plate).then((vs) => {
      const v = vs[0];
      if (cancelled || !v) return;
      setVehicle(v);
      api.getCustomer(v.customerId).then((c) => { if (!cancelled) setCustomer(c); }).catch(() => {});
      api.listWorkOrders(shopId, undefined, undefined, v.id).then((ws) => { if (!cancelled) setVisits(ws.length); }).catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [shopId, plate]);

  const state: WoState = wo ? woStateFromProto(wo.state) : "draft";
  const items = useMemo(() => wo?.lineItems || [], [wo]);
  const subtotal = useMemo(() => items.reduce((s, i) => s + num(i.unitPrice) * (i.quantity || 0), 0), [items]);
  const discount = num(wo?.discountAmount);
  const total = Math.max(0, subtotal - discount);

  const startTimer = async () => {
    if (!wo) return;
    setBusy(true);
    try {
      const r = await api.startTimer(wo.id, mechanicId);
      setRunningSince(r.startedAt || new Date().toISOString());
      toast(t("start_timer"), { icon: "play" });
    } catch (e) {
      toast(errMsg(e), { tone: "danger", icon: "alert" });
    } finally {
      setBusy(false);
    }
  };

  const stopTimer = async () => {
    if (!wo) return;
    setBusy(true);
    try {
      await api.stopTimer(wo.id, mechanicId);
      setRunningSince(null);
      toast(t("stop_timer"), { icon: "stop" });
      await load();
    } catch (e) {
      toast(errMsg(e), { tone: "danger", icon: "alert" });
    } finally {
      setBusy(false);
    }
  };

  // A mechanic advances their service line (pending → in progress → done). The backend rolls
  // the order up automatically — all services done makes the whole order Ready.
  const setLineStatus = async (lineId: string, next: LineItemStatus) => {
    if (!wo || busy) return;
    setBusy(true);
    try {
      const before = woStateFromProto(wo.state);
      const r = await api.setLineItemStatus(wo.id, lineId, lineStatusToProto(next));
      setWo(r);
      if (before !== "ready" && woStateFromProto(r.state) === "ready") toast(t("order_ready_all_done"), { icon: "check" });
      else toast(t("save"), { icon: "check" });
    } catch (e) {
      toast(errMsg(e), { tone: "danger", icon: "alert" });
    } finally {
      setBusy(false);
    }
  };

  const doTransition = async (target: WoState, label: string) => {
    if (!wo) return;
    setBusy(true);
    try {
      if (target === "in_progress") {
        await api.transition(wo.id, "in_progress");
        const r = await api.startTimer(wo.id, mechanicId);
        setRunningSince(r.startedAt || new Date().toISOString());
      } else if (target === "ready") {
        try { await api.stopTimer(wo.id, mechanicId); } catch { /* may not be running */ }
        setRunningSince(null);
        await api.transition(wo.id, "ready");
      } else {
        await api.transition(wo.id, target);
      }
      toast(label, { icon: "check" });
      await load();
    } catch (e) {
      toast(errMsg(e), { tone: "danger", icon: "alert" });
    } finally {
      setBusy(false);
    }
  };

  const addLineItem = async (item: LineItemInput) => {
    if (!wo) return;
    try {
      const updated = await api.addLineItem(wo.id, item);
      setWo(updated);
      toast(t("add_item"), { icon: "plus" });
    } catch (e) {
      toast(errMsg(e), { tone: "danger", icon: "alert" });
      throw e;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-1/3 rounded-[10px]" />
        <Skeleton className="h-[86px] rounded-[14px]" />
        <Skeleton className="h-[260px] rounded-[14px]" />
      </div>
    );
  }
  if (!wo) return <Empty icon="clipboard" text={t("error")} />;

  // mechanic state actions
  const actions: { label: string; icon: React.ReactNode; on: () => void }[] = [];
  if (state === "approved") actions.push({ label: t("start_work"), icon: <Play />, on: () => void doTransition("in_progress", t("start_work")) });
  if (state === "in_progress") actions.push({ label: t("mark_ready"), icon: <Check />, on: () => void doTransition("ready", t("mark_ready")) });

  const canControlTimer = state === "approved" || state === "in_progress";
  const running = !!runningSince;
  const phone = customer?.phone || "";
  const tgHandle = (customer?.telegramHandle || "").replace(/^@/, "");

  const overview = (
    <div className="flex flex-col gap-4">
      {/* vehicle ←→ customer */}
      <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-[1.4fr_1fr]")}>
        <Card className="flex-row items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <CarImage src={wo.vehicleImageUrl || vehicle?.imageUrl} make={wo.make} size={52} radius={12} />
            <div className="min-w-0">
              <div className="truncate text-[16px] font-extrabold tracking-[-0.01em] text-foreground">{vehicleTitle(wo) || t("work_order")}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                {wo.plate && <PlatePreview plate={wo.plate} size="sm" />}
                {num(vehicle?.mileage) > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground">
                    <Gauge className="size-3.5" />{money(num(vehicle?.mileage))} km
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground">
                  <CalendarDays className="size-3.5" />{shortDate(wo.createdAt)}
                </span>
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{t("total")}</div>
            <div className="font-mono text-[22px] font-extrabold tracking-[-0.02em] text-foreground">{money(total)}</div>
          </div>
        </Card>

        <Card className="gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-[14px] font-extrabold text-primary-foreground">
              {(wo.customerName || "?").trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[14.5px] font-bold text-foreground">{wo.customerName || "—"}</div>
              <div className="text-[11.5px] font-semibold text-muted-foreground">
                {t("customer")}{visits > 0 ? ` · ${visits} ${t("visits_short")}` : ""}
              </div>
            </div>
          </div>
          {/* Contact buttons only exist once we know how to reach the owner — a dead button is
              worse than none on a phone the mechanic is holding with oily hands. */}
          <div className="flex gap-2">
            {phone ? (
              <Button asChild variant="secondary" size="sm" className="flex-1">
                <a href={`tel:${phone}`}><Phone />{t("call")}</a>
              </Button>
            ) : (
              <Button variant="secondary" size="sm" className="flex-1" disabled><Phone />{t("call")}</Button>
            )}
            {tgHandle ? (
              <Button asChild variant="secondary" size="sm" className="flex-1">
                <a href={`https://t.me/${tgHandle}`} target="_blank" rel="noreferrer"><Send />{t("write")}</a>
              </Button>
            ) : (
              <Button variant="secondary" size="sm" className="flex-1" disabled><Send />{t("write")}</Button>
            )}
          </div>
        </Card>
      </div>

      {/* work ←→ timer + history */}
      <div className={cn("grid items-start gap-4", isMobile ? "grid-cols-1" : "grid-cols-[1.6fr_1fr]")}>
        <Card className="px-5 py-4">
          <PanelTitle right={<Button variant="soft" size="sm" onClick={() => setAddOpen(true)}><Plus />{t("add_item")}</Button>}>
            {t("line_items")}
          </PanelTitle>

          <div className="mt-1.5">
            {items.length === 0 && <div className="py-6"><Empty icon="list" text={t("empty")} /></div>}
            {items.map((it, i) => {
              const material = kindIsMaterial(kindFromProto(it.kind));
              const mine = !it.assignedMechanicId || it.assignedMechanicId === mechanicId;
              return (
                <div key={it.id || i} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border py-3 first:border-t-0">
                  <Badge tone={material ? "warn" : "accent"} className="shrink-0 rounded-[7px] px-2 py-1 text-[10.5px] uppercase">
                    {t(kindFromProto(it.kind))}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-foreground">{it.description}</div>
                    <div className="font-mono text-[11.5px] font-semibold text-muted-foreground">{money(it.unitPrice)} × {qtyUnit(t, it.quantity, it.unit)}</div>
                  </div>
                  <span className="shrink-0 font-mono text-[14px] font-extrabold text-foreground">{money(num(it.unitPrice) * (it.quantity || 0))}</span>
                  {!material && it.id && (
                    <div className="basis-full">
                      <LineStatusControl status={lineStatusFromProto(it.status)} editable={mine} busy={busy} t={t} onSet={(next) => setLineStatus(it.id!, next)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-1.5 border-t-2 border-foreground pt-3.5">
            {discount > 0 && (
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-muted-foreground">{t("discount")}</span>
                <span className="font-mono text-[13.5px] font-bold text-primary-emphasis">−{money(discount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-muted-foreground">{t("total")}</span>
              <span className="font-mono text-[20px] font-extrabold tracking-[-0.02em] text-foreground">{money(total)} <span className="font-sans text-[12px] font-semibold text-muted-foreground">{t("soum")}</span></span>
            </div>
          </div>

          {wo.notes && (
            <div className="mt-3.5 rounded-[10px] border border-warning/30 bg-warning-soft px-3.5 py-3 text-[12.5px] font-semibold leading-relaxed text-warning">
              <b className="mb-1 block text-[11px] uppercase tracking-[0.03em]">{t("notes")}</b>
              <span className="whitespace-pre-wrap">{wo.notes}</span>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="gap-3 px-5 py-4">
            <PanelTitle right={
              <span className={cn("font-mono text-[17px] font-extrabold", running ? "text-primary-emphasis" : "text-foreground")}>
                {running ? durationFmt(liveMins) : "—"}
              </span>
            }>{t("total_time")}</PanelTitle>
            {running ? (
              <Button variant="destructive" size="lg" className="w-full" disabled={busy} onClick={() => void stopTimer()}>
                <Square />{t("stop_timer")}
              </Button>
            ) : canControlTimer ? (
              <Button size="lg" className="w-full" disabled={busy} onClick={() => void startTimer()}>
                <Play />{t("start_timer")}
              </Button>
            ) : (
              <div className="text-center text-[12.5px] font-medium text-muted-foreground">{t(STATE_LABEL[state])}</div>
            )}
            {running && (
              <div className="flex items-center justify-center gap-2 text-[12px] font-semibold text-muted-foreground">
                <span className="an-pulse size-2 rounded-full bg-primary" /><Timer className="size-3.5" />{t("timer_running")}
              </div>
            )}
          </Card>

          <Card className="gap-3 px-5 py-4">
            <PanelTitle>{t("audit_log")}</PanelTitle>
            <Timeline entries={entries} limit={4} />
          </Card>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn("flex flex-col gap-4", actions.length ? "pb-[90px]" : "")}>
      {/* back · number · status */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="icon" onClick={() => router.push("/m")} aria-label={t("back")}><ArrowLeft /></Button>
        <h1 className="font-mono text-[22px] font-extrabold tracking-[-0.02em] text-foreground">{orderLabel(wo)}</h1>
        <Badge tone={STATE_TONE[state] ?? "neutral"} dot>{t(STATE_LABEL[state])}</Badge>
        {wo.customerName && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground">
            <Users className="size-3.5" />{wo.customerName}
          </span>
        )}
      </div>

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
          <TabsTrigger value="history">{t("history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">{overview}</TabsContent>
        <TabsContent value="history">
          <Card className="px-5 py-4"><Timeline entries={entries} /></Card>
        </TabsContent>
      </Tabs>

      {/* sticky action bar */}
      {actions.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-[color-mix(in_oklch,var(--bg),transparent_8%)] p-3.5 backdrop-blur-md">
          <div className="mx-auto flex max-w-[720px] justify-end gap-2.5">
            {actions.map((a, i) => (
              <Button key={i} size="lg" disabled={busy} onClick={a.on} className={isMobile ? "flex-1" : ""}>{a.icon}{a.label}</Button>
            ))}
          </div>
        </div>
      )}

      <AddLineItemModal open={addOpen} onClose={() => setAddOpen(false)} shopId={shopId} onAdd={addLineItem} t={t} />
    </div>
  );
}
