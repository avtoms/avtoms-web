"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, useLang, useToast } from "@/components/providers";
import {
  Btn, IconBtn, Card, StateBadge, Badge, Field, TextInput, TextArea, Segmented, Modal, Empty, Spinner, useIsMobile, Skeleton, SkeletonRows,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { MoneyInput } from "@/components/catalog-fields";
import { api, ApiError } from "@/lib/api";
import { woStateFromProto, kindFromProto, kindIsMaterial, LINE_ITEM_KINDS, lineStatusFromProto, lineStatusToProto, type WoState, type LineItemKind, type LineItemStatus } from "@/lib/enums";
import { money, num, durationFmt, minutesBetween, orderLabel, vehicleTitle } from "@/lib/format";
import { PlatePreview } from "@/components/plate";
import type { WorkOrder, MenuItem } from "@/lib/types";

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));

// Payload for adding a line item (agreed price + optional shop cost + price-list origin).
type LineItemInput = {
  kind: LineItemKind; description: string; unitPrice: number; quantity: number;
  cost?: number; menuItemId?: string; defaultPrice?: number;
};

function SecTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontSize: "calc(13px * var(--scale))", fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</h3>
      {right}
    </div>
  );
}

function Row({ label, value, mono, strong }: { label: string; value: React.ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "3px 0" }}>
      <span style={{ color: "var(--ink-2)", fontSize: "calc(14px * var(--scale))", fontWeight: strong ? 700 : 500 }}>{label}</span>
      <span style={{ color: "var(--ink)", fontSize: `calc(${strong ? 17 : 14.5}px * var(--scale))`, fontWeight: strong ? 800 : 600, fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)", letterSpacing: strong ? "-0.02em" : 0 }}>{value}</span>
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
    return <Btn variant="soft" size="sm" icon="play" disabled={busy} onClick={() => onSet("in_progress")}>{t("ln_start")}</Btn>;
  if (status === "in_progress")
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <Badge tone="warn" dot>{t("ln_inprogress")}</Badge>
        <Btn variant="primary" size="sm" icon="check" disabled={busy} onClick={() => onSet("done")}>{t("ln_finish")}</Btn>
      </div>
    );
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Badge tone="ok" dot>{t("ln_done")}</Badge>
      <Btn variant="ghost" size="sm" disabled={busy} onClick={() => onSet("in_progress")} style={{ color: "var(--ink-3)" }}>{t("ln_reopen")}</Btn>
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
      await onAdd({
        kind, description: desc.trim(),
        unitPrice: parseInt(price, 10) || 0,
        quantity: parseInt(qty, 10) || 1,
        cost: parseInt(cost, 10) || 0,
        menuItemId: from.menuItemId || undefined,
        defaultPrice: from.defaultPrice || undefined,
      });
      onClose();
    } catch (e) { /* surfaced by parent toast */ } finally { setSaving(false); }
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 76px", gap: 10 }}>
            <Field label={t("agreed_price")}><MoneyInput value={price} onChange={setPrice} /></Field>
            <Field label={t("unit_cost")}><MoneyInput value={cost} onChange={setCost} /></Field>
            <Field label={t("qty")}><TextInput value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ fontFamily: "var(--font-mono)", textAlign: "center" }} /></Field>
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

  // running timer: track the started_at returned by start/stop so we can tick live elapsed.
  const [runningSince, setRunningSince] = useState<string | null>(null);
  const liveMins = useElapsed(runningSince);

  const load = useCallback(async () => {
    try {
      const data = await api.getWorkOrder(woId);
      setWo(data);
      // restore a running timer (e.g. after a page reload) from the work order itself
      setRunningSince(data.activeTimerStartedAt || null);
    } catch (e) {
      toast(errMsg(e), { tone: "danger", icon: "alert" });
    } finally {
      setLoading(false);
    }
  }, [woId, toast]);

  useEffect(() => { void load(); }, [load]);

  const state: WoState = wo ? woStateFromProto(wo.state) : "draft";
  const items = wo?.lineItems || [];
  const subtotal = useMemo(() => items.reduce((s, i) => s + num(i.unitPrice) * (i.quantity || 0), 0), [items]);
  const total = subtotal; // VAT (QQS/НДС) disabled: total equals subtotal

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
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card><div style={{ display: "flex", flexDirection: "column", gap: 12 }}><Skeleton w="40%" h={20} r={8} /><Skeleton w="60%" h={13} /></div></Card>
        <Card pad={0}><SkeletonRows rows={4} avatar={false} /></Card>
      </div>
    );
  }
  if (!wo) {
    return <Empty icon="clipboard" text={t("error")} />;
  }

  // mechanic state actions
  const actions: { label: string; icon: string; on: () => void }[] = [];
  if (state === "approved") actions.push({ label: t("start_work"), icon: "play", on: () => void doTransition("in_progress", t("start_work")) });
  if (state === "in_progress") actions.push({ label: t("mark_ready"), icon: "check", on: () => void doTransition("ready", t("mark_ready")) });

  const canControlTimer = state === "approved" || state === "in_progress";
  const running = !!runningSince;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: actions.length ? 90 : 16 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconBtn icon="arrowL" onClick={() => router.push("/m")} aria-label={t("back")} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: "calc(22px * var(--scale))", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.02em", fontFamily: "var(--font-mono)" }}>{orderLabel(wo)}</h1>
          <StateBadge state={state} />
        </div>
      </div>

      {/* vehicle / wo summary */}
      <Card pad={16}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="car" size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(16px * var(--scale))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{vehicleTitle(wo) || t("work_order")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {wo.plate && <PlatePreview plate={wo.plate} size="sm" />}
              {wo.customerName && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--ink-3)" }}><Icon name="users" size={13} />{wo.customerName}</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("total")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, color: "var(--ink)", fontSize: "calc(16px * var(--scale))" }}>{money(total)} {t("soum")}</div>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.5fr 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* line items (read-only list, mechanic may add) */}
          <Card pad={0}>
            <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)" }}>
              <SecTitle>{t("line_items")}</SecTitle>
              <Btn variant="soft" size="sm" icon="plus" onClick={() => setAddOpen(true)}>{t("add_item")}</Btn>
            </div>
            <div>
              {items.length === 0 && <div style={{ padding: 20 }}><Empty icon="list" text={t("empty")} /></div>}
              {items.map((it, i) => {
                const isService = !kindIsMaterial(kindFromProto(it.kind));
                const mine = !it.assignedMechanicId || it.assignedMechanicId === mechanicId;
                return (
                <div key={it.id || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--line)", flexWrap: "wrap", rowGap: 8 }}>
                  <Badge tone={kindIsMaterial(kindFromProto(it.kind)) ? "info" : "neutral"}>{t(kindFromProto(it.kind))}</Badge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{it.description}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{money(it.unitPrice)} × {it.quantity}</div>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{money(num(it.unitPrice) * (it.quantity || 0))}</span>
                  {isService && it.id && (
                    <div style={{ flexBasis: "100%" }}>
                      <LineStatusControl status={lineStatusFromProto(it.status)} editable={mine} busy={busy} t={t}
                        onSet={(next) => setLineStatus(it.id!, next)} />
                    </div>
                  )}
                </div>
                );
              })}
            </div>
            <div style={{ padding: "14px 18px", background: "var(--surface-2)" }}>
              <Row label={t("total")} value={`${money(total)} ${t("soum")}`} mono strong />
            </div>
          </Card>

          {wo.notes ? (
            <Card pad={16}>
              <SecTitle>{t("notes")}</SecTitle>
              <div style={{ fontSize: "calc(14px * var(--scale))", color: "var(--ink-2)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{wo.notes}</div>
            </Card>
          ) : null}
        </div>

        {/* timer panel */}
        <Card pad={16}>
          <SecTitle right={
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "calc(18px * var(--scale))", color: running ? "var(--accent-2)" : "var(--ink)" }}>
              {running ? durationFmt(liveMins) : "—"}
            </span>
          }>{t("total_time")}</SecTitle>

          {running ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <span className="an-pulse" style={{ width: 9, height: 9, borderRadius: 99, background: "var(--accent)" }} />
              <span style={{ fontWeight: 600, color: "var(--ink-2)", fontSize: 14, flex: 1 }}>{t("timer_running")}</span>
              <Btn variant="danger" size="md" icon="stop" disabled={busy} onClick={() => void stopTimer()}>{t("stop_timer")}</Btn>
            </div>
          ) : canControlTimer ? (
            <Btn variant="primary" full size="lg" icon="play" disabled={busy} onClick={() => void startTimer()}>{t("start_timer")}</Btn>
          ) : null}
        </Card>
      </div>

      {/* sticky action bar */}
      {actions.length > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, padding: 14, background: "color-mix(in oklch, var(--bg), transparent 8%)", borderTop: "1px solid var(--line)", backdropFilter: "blur(8px)" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 10, justifyContent: "flex-end" }}>
            {actions.map((a, i) => (
              <Btn key={i} variant="primary" size="lg" icon={a.icon} disabled={busy} onClick={a.on} style={{ flex: isMobile ? 1 : "0 0 auto" }}>{a.label}</Btn>
            ))}
          </div>
        </div>
      )}

      <AddLineItemModal open={addOpen} onClose={() => setAddOpen(false)} shopId={shopId} onAdd={addLineItem} t={t} />
    </div>
  );
}
