"use client";
// Work order detail (flows.jsx WorkOrderDetail) wired to the live backend.
// Loads api.getWorkOrder; line items, assign mechanic, state transitions, invoice
// generation + fiscal QR + mark-paid. Re-fetches after every mutation.
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card, Badge, Btn, IconBtn, Avatar, Modal, Field, TextInput, Segmented,
  Spinner, Empty, StateBadge, FiscalBadge, QR, useIsMobile,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num, vatBreakdown, orderLabel } from "@/lib/format";
import {
  woStateFromProto, kindFromProto, kindIsMaterial, fiscalFromProto,
  TRANSITIONS, STATE_LABEL, LINE_ITEM_KINDS, type WoState, type LineItemKind, type PaymentMethod,
} from "@/lib/enums";
import type { WorkOrder, Staff, MenuItem, AuditEntry } from "@/lib/types";
import { MoneyInput } from "@/components/catalog-fields";
import { PlatePreview } from "@/components/plate";
import { SecTitle, Row } from "../../_shared";

function menuName(m: MenuItem, lang: string): string {
  return lang === "uzc" ? m.nameUzCyrl : lang === "ru" ? m.nameRu : m.nameUzLatn;
}

// Payload for adding a line item: unitPrice is the agreed (negotiated) price, cost is the
// shop expense, and defaultPrice/menuItemId capture the price-list origin for the discount audit.
type LineItemInput = {
  kind: LineItemKind; description: string; unitPrice: number; quantity: number;
  cost?: number; menuItemId?: string; defaultPrice?: number;
};

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { lang, t } = useLang();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [mechanics, setMechanics] = useState<Staff[]>([]);
  const [busy, setBusy] = useState(false);

  const [addItem, setAddItem] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [invoice, setInvoice] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [approval, setApproval] = useState<{ deepLink: string; botUsername: string } | null>(null);

  const load = useCallback(async () => {
    try { setWo(await api.getWorkOrder(id)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [id, t, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.listStaff(shopId).then((s) => setMechanics(s.filter((x) => x.role === "ROLE_MECHANIC" && x.active))).catch(() => {});
  }, [shopId]);

  const err = (e: unknown) => toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });

  const doTransition = async (target: WoState) => {
    if (busy) return; setBusy(true);
    try { setWo(await api.transition(id, target)); toast(t(STATE_LABEL[target]), { icon: "check" }); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const doAssign = async (mechanicId: string) => {
    if (busy) return; setBusy(true);
    try { setWo(await api.assignMechanic(id, mechanicId)); setAssigning(false); toast(t("assign"), { icon: "check" }); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const doAddItem = async (item: LineItemInput) => {
    setBusy(true);
    try { setWo(await api.addLineItem(id, item)); setAddItem(false); toast(t("add_item"), { icon: "check" }); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const doRemoveItem = async (lineItemId?: string) => {
    if (!lineItemId || busy) return; setBusy(true);
    try { setWo(await api.removeLineItem(id, lineItemId)); toast(t("removed"), { icon: "check" }); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  const requestApproval = async () => {
    if (busy) return; setBusy(true);
    try { const r = await api.createApprovalLink(id); setApproval({ deepLink: r.deepLink, botUsername: r.botUsername }); }
    catch (e) { err(e); } finally { setBusy(false); }
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={28} /></div>;
  if (!wo) return <Empty icon="alert" text={t("error")} />;

  const state = woStateFromProto(wo.state);
  const items = wo.lineItems ?? [];
  const computed = vatBreakdown(items);
  const subtotal = wo.subtotal != null ? num(wo.subtotal) : computed.subtotal;
  const vat = wo.vat != null ? num(wo.vat) : computed.vat;
  const total = wo.total != null ? num(wo.total) : computed.total;
  const totalCost = num(wo.totalCost);
  const totalMargin = wo.totalMargin != null ? num(wo.totalMargin) : subtotal - totalCost;
  // Line items can be added while the order is still open (matches the backend state guard).
  const editable = ["draft", "estimated", "approved", "in_progress", "ready"].includes(state);
  const mech = mechanics.find((m) => m.id === wo.assignedMechanicId);

  // contextual actions from the allowed forward transitions
  const allowed = TRANSITIONS[state] || [];
  const canCancel = allowed.includes("canceled");
  const forwardTargets = allowed.filter((x) => x !== "canceled");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: (forwardTargets.length || canCancel || state === "ready" || state === "invoiced") ? 90 : 16 }}>
      {/* header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <IconBtn icon="arrowL" onClick={() => router.push("/work-orders")} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: "calc(22px * var(--scale))", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.02em", fontFamily: "var(--font-mono)" }}>{orderLabel(wo)}</h1>
              <StateBadge state={state} />
            </div>
          </div>
        </div>
        <Card pad={16}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="car" size={24} /></div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(16px * var(--scale))" }}>{[wo.make, wo.model].filter(Boolean).join(" ") || t("vehicle")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                {wo.plate ? <PlatePreview plate={wo.plate} size="sm" /> : <span style={{ fontSize: 12.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{wo.vehicleId.slice(0, 8)}</span>}
                {wo.customerName && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--ink-3)" }}><Icon name="users" size={13} />{wo.customerName}</span>}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* line items */}
          <Card pad={0}>
            <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)" }}>
              <SecTitle>{t("line_items")}</SecTitle>
              {editable && <Btn variant="soft" size="sm" icon="plus" onClick={() => setAddItem(true)}>{t("add_item")}</Btn>}
            </div>
            <div>
              {items.length === 0 && <div style={{ padding: 20 }}><Empty icon="list" text={t("empty")} /></div>}
              {items.map((it, i) => {
                const kind = kindFromProto(it.kind);
                const defPrice = num(it.defaultPrice);
                const discount = defPrice > num(it.unitPrice) ? (defPrice - num(it.unitPrice)) * (it.quantity || 0) : 0;
                return (
                  <div key={it.id ?? i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--line)" }}>
                    <Badge tone={kindIsMaterial(kind) ? "info" : "neutral"}>{t(kind)}</Badge>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{it.description}</div>
                      <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                        {money(it.unitPrice)} × {it.quantity}
                        {discount > 0 && <span style={{ color: "var(--ink-3)", textDecoration: "line-through", marginLeft: 6 }}>{money(defPrice)}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{money(num(it.unitPrice) * (it.quantity || 0))}</span>
                      {discount > 0 && <div style={{ fontSize: 11, color: "var(--ok, var(--accent-2))", fontFamily: "var(--font-mono)" }}>−{money(discount)} {t("discount").toLowerCase()}</div>}
                    </div>
                    {editable && <IconBtn icon="trash" onClick={() => doRemoveItem(it.id)} aria-label={t("remove")} disabled={busy} />}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "14px 18px", background: "var(--surface-2)" }}>
              <Row label={t("subtotal")} value={money(subtotal)} mono />
              <Row label={t("vat")} value={money(vat)} mono />
              <div style={{ height: 1, background: "var(--line-2)", margin: "6px 0" }} />
              <Row label={t("total")} value={money(total) + " " + t("soum")} mono strong />
              {totalCost > 0 && (
                <>
                  <div style={{ height: 1, background: "var(--line-2)", margin: "6px 0" }} />
                  <Row label={t("expense")} value={money(totalCost)} mono />
                  <Row label={t("margin")} value={money(totalMargin)} mono />
                </>
              )}
            </div>
          </Card>

          {/* notes (read-only — no update-notes endpoint) */}
          {wo.notes && (
            <Card pad={16}>
              <SecTitle>{t("notes")}</SecTitle>
              <div style={{ fontSize: "calc(14px * var(--scale))", color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{wo.notes}</div>
              {/* TODO backend: no set-notes endpoint exposed in the API client. */}
            </Card>
          )}
        </div>

        {/* side column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card pad={16}>
            <SecTitle right={state !== "closed" && state !== "canceled" ? <button onClick={() => setAssigning(true)} className="an-btn" style={{ border: "none", background: "transparent", color: "var(--accent-2)", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "var(--font-sans)" }}>{t("assign")}</button> : undefined}>{t("mechanic")}</SecTitle>
            {mech ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={mech.name} size={34} color="var(--info)" />
                <div><div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 14 }}>{mech.name}</div><div style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{mech.phone}</div></div>
              </div>
            ) : <span style={{ color: "var(--ink-3)", fontSize: 14 }}>{t("unassigned")}</span>}
          </Card>
          <AuditCard woId={id} refresh={`${state}|${items.length}|${wo.assignedMechanicId ?? ""}`} mechanics={mechanics} />
        </div>
      </div>

      {/* sticky action bar */}
      {(forwardTargets.length > 0 || canCancel || state === "ready" || state === "invoiced") && (
        <div style={{ position: "fixed", bottom: 0, left: isMobile ? 0 : 260, right: 0, zIndex: 50, padding: 14, paddingBottom: isMobile ? "calc(14px + env(safe-area-inset-bottom))" : 14, background: "color-mix(in oklch, var(--bg), transparent 8%)", borderTop: "1px solid var(--line)", backdropFilter: "blur(8px)" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
            {canCancel && <Btn variant="ghost" size={isMobile ? "sm" : "md"} disabled={busy} onClick={() => setConfirmCancel(true)} style={{ color: "var(--danger)", marginRight: "auto" }}>{t("cancel_wo")}</Btn>}
            {state === "estimated" && <Btn variant="soft" size={isMobile ? "sm" : "md"} icon="tg" disabled={busy} onClick={requestApproval}>{t("request_approval")}</Btn>}
            {(state === "ready" || state === "invoiced") && <Btn variant="primary" size={isMobile ? "md" : "lg"} icon="receipt" disabled={busy} onClick={() => setInvoice(true)}>{state === "ready" ? t("generate_invoice") : t("invoice")}</Btn>}
            {forwardTargets.map((target) => {
              // hide the "ready -> invoiced" forward chip since the invoice modal drives it.
              if (state === "ready" && target === "invoiced") return null;
              return <Btn key={target} variant="primary" size={isMobile ? "md" : "lg"} disabled={busy} onClick={() => doTransition(target)}>{t(STATE_LABEL[target])}</Btn>;
            })}
          </div>
        </div>
      )}

      <AddLineItemModal open={addItem} onClose={() => setAddItem(false)} onAdd={doAddItem} shopId={shopId} lang={lang} busy={busy} />
      <AssignModal open={assigning} onClose={() => setAssigning(false)} mechanics={mechanics} current={wo.assignedMechanicId} onPick={doAssign} />
      <InvoiceModal open={invoice} onClose={() => setInvoice(false)} wo={wo} shopId={shopId} total={total} onChange={load} />
      <ApprovalModal approval={approval} onClose={() => setApproval(null)} />
      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title={t("cancel_wo")} maxWidth={400}
        footer={<>
          <Btn variant="ghost" disabled={busy} onClick={() => setConfirmCancel(false)}>{t("no")}</Btn>
          <Btn variant="primary" disabled={busy} style={{ background: "var(--danger)" }} onClick={async () => { setConfirmCancel(false); await doTransition("canceled"); }}>{busy ? <Spinner /> : t("cancel_wo")}</Btn>
        </>}>
        <div style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>{t("cancel_wo_confirm")}</div>
      </Modal>
    </div>
  );
}

/* ── audit log ── */
const AUDIT_LABEL: Record<string, string> = {
  state: "audit_state", line_added: "audit_line_added",
  line_removed: "audit_line_removed", mechanic_assigned: "audit_mechanic_assigned",
};

function AuditCard({ woId, refresh, mechanics }: { woId: string; refresh: string; mechanics: Staff[] }) {
  const { t } = useLang();
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getAuditLog(woId)
      .then((e) => { if (!cancelled) setEntries([...e].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [woId, refresh]);

  if (entries.length === 0) return null;
  const who = (id?: string) => (id ? (mechanics.find((m) => m.id === id)?.name ?? id.slice(0, 8)) : "");

  return (
    <Card pad={16}>
      <SecTitle>{t("audit_log")}</SecTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        {entries.map((e) => (
          <div key={e.id} style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: 99, background: "var(--accent-2)", marginTop: 5, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "calc(13px * var(--scale))", color: "var(--ink)", fontWeight: 600 }}>
                {t(AUDIT_LABEL[e.action] ?? "history")}{e.detail ? <span style={{ fontWeight: 400, color: "var(--ink-2)" }}> · {e.detail}</span> : null}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                {new Date(e.createdAt).toLocaleString()}{who(e.actorId) ? " · " + who(e.actorId) : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── estimate approval (Telegram) ── */
function ApprovalModal({ approval, onClose }: { approval: { deepLink: string; botUsername: string } | null; onClose: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  if (!approval) return null;
  const configured = !!approval.deepLink;
  const copy = () => { if (approval.deepLink) { navigator.clipboard?.writeText(approval.deepLink); toast(t("copied"), { icon: "check" }); } };
  return (
    <Modal open={!!approval} onClose={onClose} title={t("request_approval")} maxWidth={420}>
      {!configured ? (
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6 }}>{t("telegram_not_configured")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
          <div style={{ fontSize: 13.5, color: "var(--ink-2)", textAlign: "center", lineHeight: 1.6 }}>{t("approval_share_hint")}</div>
          <div style={{ background: "#fff", padding: 12, borderRadius: 12, border: "1px solid var(--line)" }}><QR data={approval.deepLink} size={180} /></div>
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <TextInput value={approval.deepLink} readOnly style={{ fontFamily: "var(--font-mono)", fontSize: 12, flex: 1 }} onFocus={(e) => e.currentTarget.select()} />
            <Btn variant="soft" icon="check" onClick={copy}>{t("copy")}</Btn>
          </div>
          <a href={approval.deepLink} target="_blank" rel="noreferrer" style={{ width: "100%" }}>
            <Btn variant="primary" icon="tg" style={{ width: "100%" }}>{t("open_in_telegram")}</Btn>
          </a>
        </div>
      )}
    </Modal>
  );
}

/* ── add line item ── */
function AddLineItemModal({ open, onClose, onAdd, shopId, lang, busy }: {
  open: boolean; onClose: () => void; onAdd: (i: LineItemInput) => void; shopId: string; lang: string; busy: boolean;
}) {
  const { t } = useLang();
  const [mode, setMode] = useState<"menu" | "custom">("menu");
  const [kind, setKind] = useState<LineItemKind>("service");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState("1");
  // Captures the price-list origin so a negotiated price can be audited against the menu price.
  const [from, setFrom] = useState<{ menuItemId: string; defaultPrice: number }>({ menuItemId: "", defaultPrice: 0 });
  const [menu, setMenu] = useState<MenuItem[]>([]);

  const reset = () => { setKind("service"); setDesc(""); setPrice(""); setCost(""); setQty("1"); setFrom({ menuItemId: "", defaultPrice: 0 }); };

  useEffect(() => {
    if (!open) return;
    setMode("menu"); reset();
    api.listMenuItems(shopId).then((m) => setMenu(m.filter((x) => x.active))).catch(() => {});
  }, [open, shopId]);

  // Picking from the price list prefills the editor (instead of adding immediately) so the
  // owner can negotiate the price before confirming — the menu price is kept as the snapshot.
  const pickMenu = (m: MenuItem) => {
    setKind("service");
    setDesc(menuName(m, lang));
    setPrice(String(num(m.defaultPrice)));
    setCost(String(num(m.defaultCost)));
    setFrom({ menuItemId: m.id, defaultPrice: num(m.defaultPrice) });
    setMode("custom");
  };
  const addCustom = () => {
    if (!desc.trim() || !price) return;
    onAdd({
      kind, description: desc.trim(),
      unitPrice: parseInt(price, 10) || 0,
      quantity: parseInt(qty, 10) || 1,
      cost: parseInt(cost, 10) || 0,
      menuItemId: from.menuItemId || undefined,
      defaultPrice: from.defaultPrice || undefined,
    });
  };

  const agreed = parseInt(price, 10) || 0;
  const discount = from.defaultPrice > agreed ? from.defaultPrice - agreed : 0;

  return (
    <Modal open={open} onClose={onClose} title={t("add_item")} maxWidth={460}
      footer={mode === "custom" ? <><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" icon="plus" disabled={busy} onClick={addCustom}>{t("add")}</Btn></> : undefined}>
      <Segmented options={[{ value: "menu", label: t("from_menu") }, { value: "custom", label: t("custom_item") }]} value={mode} onChange={(v) => { const nv = v as "menu" | "custom"; if (nv === "custom" && mode === "menu") reset(); setMode(nv); }} style={{ marginBottom: 16, width: "100%" }} />
      {mode === "menu" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 360, overflowY: "auto" }}>
          {menu.length === 0 && <Empty icon="list" text={t("empty")} />}
          {menu.map((m) => (
            <button key={m.id} disabled={busy} onClick={() => pickMenu(m)} className="an-row-btn" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--surface)", cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left" }}>
              <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{menuName(m, lang)}</span>
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
              {discount > 0 && <span style={{ color: "var(--accent-2)" }}>{t("discount")}: −{money(discount)}</span>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ── assign mechanic ── */
function AssignModal({ open, onClose, mechanics, current, onPick }: { open: boolean; onClose: () => void; mechanics: Staff[]; current?: string; onPick: (id: string) => void }) {
  const { t } = useLang();
  return (
    <Modal open={open} onClose={onClose} title={t("assign")} maxWidth={400}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {mechanics.length === 0 && <Empty icon="team" text={t("empty")} />}
        {mechanics.map((m) => (
          <button key={m.id} onClick={() => onPick(m.id)} className="an-row-btn" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", border: "1px solid " + (current === m.id ? "var(--accent)" : "var(--line)"), borderRadius: "var(--radius-sm)", background: "var(--surface)", cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left" }}>
            <Avatar name={m.name} size={36} color="var(--info)" />
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 14.5 }}>{m.name}</div><div style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{m.phone}</div></div>
            {current === m.id && <Icon name="check" size={18} style={{ color: "var(--accent-2)" }} />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ── invoice / fiscalize / pay (flows.jsx InvoiceModal) ── */
function InvoiceModal({ open, onClose, wo, shopId, total, onChange }: { open: boolean; onClose: () => void; wo: WorkOrder; shopId: string; total: number; onChange: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [inv, setInv] = useState<import("@/lib/types").Invoice | null>(null);
  const [busy, setBusy] = useState(false);

  // Find or generate the invoice for this WO when opened.
  useEffect(() => {
    if (!open) { setInv(null); return; }
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const all = await api.listInvoices(shopId);
        let existing = all.find((i) => i.workOrderId === wo.id);
        if (!existing) {
          existing = await api.generateInvoice(shopId, wo.id, total);
          // Issuing the invoice advances the order ready → invoiced (the modal "drives"
          // this transition, which is also what emits the workorder.invoiced event).
          if (woStateFromProto(wo.state) === "ready") {
            try { await api.transition(wo.id, "invoiced"); } catch { /* best effort; ignore if already advanced */ }
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
    return () => { cancelled = true; };
  }, [open, wo.id, shopId, total, onChange, t, toast]);

  const pay = async (method: PaymentMethod) => {
    if (!inv || busy) return;
    setBusy(true);
    try { const updated = await api.markPaid(inv.id, method); setInv(updated); toast(t("paid"), { icon: "money" }); onChange(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  if (!open) return null;
  const fiscal = inv ? fiscalFromProto(inv.fiscalStatus) : "pending";

  return (
    <Modal open={open} onClose={onClose} title={t("invoice") + (inv ? " · " + inv.id.slice(0, 8) : "")} maxWidth={440}>
      {!inv ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 30 }}><Spinner size={24} /></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <FiscalBadge status={fiscal} />
            <Badge tone={inv.paid ? "ok" : "neutral"} dot>{inv.paid ? t("paid") : t("unpaid")}</Badge>
          </div>
          <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 16 }}>
            <Row label={t("work_order")} value={orderLabel(wo)} mono />
            <div style={{ height: 1, background: "var(--line)", margin: "8px 0" }} />
            <Row label={t("total")} value={money(inv.total) + " " + t("soum")} strong mono />
          </div>

          {fiscal === "fiscalized" && inv.fiscalQr ? (
            <div style={{ display: "flex", gap: 16, alignItems: "center", padding: 14, background: "var(--ok-soft)", borderRadius: "var(--radius)" }}>
              <QR data={inv.fiscalQr} size={104} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Badge tone="ok" dot>{t("fs_fiscalized")}</Badge>
                {inv.fiscalReceiptId && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}>{inv.fiscalReceiptId}</div>}
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>OFD · QR</div>
              </div>
            </div>
          ) : fiscal === "failed" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: 14, background: "var(--danger-soft)", borderRadius: "var(--radius)", color: "var(--danger)", fontWeight: 600, fontSize: 14 }}>
              <Icon name="alert" size={18} /> {t("fs_failed")}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, background: "var(--warn-soft)", borderRadius: "var(--radius)", color: "var(--warn)" }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{t("fiscalizing")}</span>
            </div>
          )}

          {!inv.paid && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8 }}>{t("mark_paid")} · {t("payment_method")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Btn variant="soft" icon="money" disabled={busy} onClick={() => pay("cash")}>{t("pay_cash")}</Btn>
                <Btn variant="soft" disabled={busy} onClick={() => pay("other")}>{t("pay_other")}</Btn>
              </div>
            </div>
          )}

          {/* notify customer is a visual stub (no notify endpoint in the API client). */}
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="secondary" size="sm" icon="send" style={{ flex: 1 }} onClick={() => toast(t("sent"), { icon: "send" })}>{t("notify_customer")}</Btn>
            <Btn variant="secondary" size="sm" icon="printer" style={{ flex: 1 }} onClick={() => toast(t("print"), { icon: "printer" })}>{t("print")}</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
