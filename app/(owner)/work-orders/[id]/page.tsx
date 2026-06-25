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
import { money, num, vatBreakdown } from "@/lib/format";
import {
  woStateFromProto, kindFromProto, fiscalFromProto,
  TRANSITIONS, STATE_LABEL, type WoState, type LineItemKind, type PaymentMethod,
} from "@/lib/enums";
import type { WorkOrder, Staff, MenuItem } from "@/lib/types";
import { SecTitle, Row } from "../../_shared";

function menuName(m: MenuItem, lang: string): string {
  return lang === "uzc" ? m.nameUzCyrl : lang === "ru" ? m.nameRu : m.nameUzLatn;
}

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
  const doAddItem = async (item: { kind: LineItemKind; description: string; unitPrice: number; quantity: number }) => {
    setBusy(true);
    try { setWo(await api.addLineItem(id, item)); setAddItem(false); toast(t("add_item"), { icon: "check" }); }
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
  const editable = ["draft", "estimated", "approved"].includes(state);
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
              <h1 style={{ margin: 0, fontSize: "calc(22px * var(--scale))", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.02em", fontFamily: "var(--font-mono)" }}>{wo.id.slice(0, 8)}</h1>
              <StateBadge state={state} />
            </div>
          </div>
        </div>
        <Card pad={16}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="car" size={24} /></div>
            <div style={{ flex: 1, minWidth: 140 }}>
              {/* TODO backend: no get-vehicle-by-id endpoint; show the vehicle id reference. */}
              <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(16px * var(--scale))" }}>{t("vehicle")}</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{wo.vehicleId}</div>
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
                return (
                  <div key={it.id ?? i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--line)" }}>
                    <Badge tone={kind === "part" ? "info" : "neutral"}>{t(kind)}</Badge>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{it.description}</div>
                      <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{money(it.unitPrice)} × {it.quantity}</div>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{money(num(it.unitPrice) * (it.quantity || 0))}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "14px 18px", background: "var(--surface-2)" }}>
              <Row label={t("subtotal")} value={money(subtotal)} mono />
              <Row label={t("vat")} value={money(vat)} mono />
              <div style={{ height: 1, background: "var(--line-2)", margin: "6px 0" }} />
              <Row label={t("total")} value={money(total) + " " + t("soum")} mono strong />
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
        </div>
      </div>

      {/* sticky action bar */}
      {(forwardTargets.length > 0 || canCancel || state === "ready" || state === "invoiced") && (
        <div style={{ position: "fixed", bottom: 0, left: isMobile ? 0 : 260, right: 0, zIndex: 50, padding: 14, paddingBottom: isMobile ? "calc(14px + env(safe-area-inset-bottom))" : 14, background: "color-mix(in oklch, var(--bg), transparent 8%)", borderTop: "1px solid var(--line)", backdropFilter: "blur(8px)" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
            {canCancel && <Btn variant="ghost" size={isMobile ? "sm" : "md"} disabled={busy} onClick={() => doTransition("canceled")} style={{ color: "var(--danger)", marginRight: "auto" }}>{t("cancel_wo")}</Btn>}
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
    </div>
  );
}

/* ── add line item ── */
function AddLineItemModal({ open, onClose, onAdd, shopId, lang, busy }: {
  open: boolean; onClose: () => void; onAdd: (i: { kind: LineItemKind; description: string; unitPrice: number; quantity: number }) => void; shopId: string; lang: string; busy: boolean;
}) {
  const { t } = useLang();
  const [mode, setMode] = useState<"menu" | "custom">("menu");
  const [kind, setKind] = useState<LineItemKind>("labor");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [menu, setMenu] = useState<MenuItem[]>([]);

  useEffect(() => {
    if (!open) return;
    setMode("menu"); setKind("labor"); setDesc(""); setPrice(""); setQty("1");
    api.listMenuItems(shopId).then((m) => setMenu(m.filter((x) => x.active))).catch(() => {});
  }, [open, shopId]);

  const pickMenu = (m: MenuItem) => onAdd({ kind: "labor", description: menuName(m, lang), unitPrice: num(m.defaultPrice), quantity: 1 });
  const addCustom = () => {
    if (!desc.trim() || !price) return;
    onAdd({ kind, description: desc.trim(), unitPrice: parseInt(price, 10) || 0, quantity: parseInt(qty, 10) || 1 });
  };

  return (
    <Modal open={open} onClose={onClose} title={t("add_item")} maxWidth={460}
      footer={mode === "custom" ? <><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" icon="plus" disabled={busy} onClick={addCustom}>{t("add")}</Btn></> : undefined}>
      <Segmented options={[{ value: "menu", label: t("from_menu") }, { value: "custom", label: t("custom_item") }]} value={mode} onChange={(v) => setMode(v as "menu" | "custom")} style={{ marginBottom: 16, width: "100%" }} />
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
          <Segmented options={[{ value: "labor", label: t("labor") }, { value: "part", label: t("part") }]} value={kind} onChange={(v) => setKind(v as LineItemKind)} style={{ width: "100%" }} />
          <Field label={t("description")}><TextInput value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("description")} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 12 }}>
            <Field label={t("unit_price") + " (" + t("soum") + ")"}><TextInput value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" style={{ fontFamily: "var(--font-mono)" }} /></Field>
            <Field label={t("qty")}><TextInput value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ fontFamily: "var(--font-mono)", textAlign: "center" }} /></Field>
          </div>
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
        if (!existing) existing = await api.generateInvoice(shopId, wo.id, total);
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
            <Row label={t("work_order")} value={wo.id.slice(0, 8)} mono />
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
