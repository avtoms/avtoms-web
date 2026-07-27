"use client";
// Work order detail wired to the live backend. Loads api.getWorkOrder; line items, assign
// mechanic, state transitions, invoice generation + fiscal QR + mark-paid. Re-fetches after
// every mutation. Rebuilt on the shadcn kit; all data/logic preserved.
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Pencil, Users, Send, Receipt, Printer, Check } from "lucide-react";
import { StateBadge, QR, Empty, useIsMobile } from "@/components/ui";
import { Card, CardContent } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { UserAvatar } from "@/components/ui-kit/avatar";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner, Separator, Skeleton } from "@/components/ui-kit/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { ProductForm } from "@/components/product-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { cn } from "@/lib/utils";
import { useLang, useToast, useAuth } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num, vatBreakdown, orderLabel } from "@/lib/format";
import {
  woStateFromProto, kindFromProto, kindIsMaterial, lineStatusFromProto,
  TRANSITIONS, STATE_LABEL, LINE_ITEM_KINDS, type WoState, type LineItemKind, type PaymentMethod,
} from "@/lib/enums";
import type { WorkOrder, Staff, MenuItem, AuditEntry, Product, PropertyDefinition, CatalogTerm, Contragent, LineItem } from "@/lib/types";

// A single stocked variant, flattened with its product context, for the material picker.
type PickVariant = { id: string; name: string; unit?: string; unitPrice?: string; unitCost?: string; quantityOnHand: number };

// Flatten a product list to its active variants; each row's name combines the
// product name with the variant's property values (e.g. "T-Shirt · M · Red").
function flattenVariants(products: Product[]): PickVariant[] {
  const out: PickVariant[] = [];
  for (const p of products) {
    for (const v of p.variants ?? []) {
      if (!v.active || !v.id) continue;
      const label = (v.attributes ?? []).map((a) => a.value).join(" · ");
      out.push({
        id: v.id,
        name: label ? `${p.name} · ${label}` : p.name,
        unit: p.unit,
        unitPrice: v.unitPrice,
        unitCost: v.unitCost,
        quantityOnHand: v.quantityOnHand,
      });
    }
  }
  return out;
}
import { MoneyInput, UnitSelect } from "@/components/catalog-fields";
import { PlatePreview } from "@/components/plate";
import { CarImage } from "@/components/car-image";
import { FiscalCheck } from "@/components/fiscal-check";
import { loadShopProfile } from "@/lib/shop";
import { SecTitle, Row } from "../../_shared";

const NONE = "__none"; // Radix Select forbids empty item values; sentinel for "unassigned".

function menuName(m: MenuItem, lang: string): string {
  return lang === "uzc" ? m.nameUzCyrl : lang === "ru" ? m.nameRu : m.nameUzLatn;
}

type LineItemInput = {
  kind: LineItemKind; description: string; unitPrice: number; quantity: number;
  cost?: number; menuItemId?: string; defaultPrice?: number; variantId?: string; consumedQty?: number;
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
  const [editItem, setEditItem] = useState<LineItem | null>(null);
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
  const total = subtotal; // VAT (QQS/НДС) disabled: total equals subtotal
  const totalCost = num(wo.totalCost);
  const totalMargin = wo.totalMargin != null ? num(wo.totalMargin) : subtotal - totalCost;
  const grossSubtotal = items.reduce((s, it) => {
    const qty = it.quantity || 0;
    const actualUnit = num(it.unitPrice);
    const listUnit = num(it.defaultPrice) > actualUnit ? num(it.defaultPrice) : actualUnit;
    return s + listUnit * qty;
  }, 0);
  const totalDiscount = Math.max(0, grossSubtotal - subtotal);
  const discountPct = grossSubtotal > 0 ? Math.round((totalDiscount / grossSubtotal) * 100) : 0;
  const editable = ["draft", "estimated", "approved", "in_progress", "ready"].includes(state);
  const mech = mechanics.find((m) => m.id === wo.assignedMechanicId);

  const allowed = TRANSITIONS[state] || [];
  const canCancel = allowed.includes("canceled");
  const forwardTargets = allowed.filter((x) => x !== "canceled");
  const hasBar = forwardTargets.length > 0 || canCancel || state === "ready" || state === "invoiced";

  return (
    <div className="flex flex-col gap-4" style={{ paddingBottom: hasBar ? 90 : 16 }}>
      {/* header */}
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="icon" onClick={() => router.push("/work-orders")} aria-label={t("back") || "Back"}><ArrowLeft /></Button>
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-[22px] font-extrabold tracking-[-0.02em] text-foreground">{orderLabel(wo)}</h1>
            <StateBadge state={state} />
          </div>
        </div>
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3.5">
            <CarImage src={wo.vehicleImageUrl} make={wo.make} size={52} />
            <div className="min-w-[140px] flex-1">
              <div className="text-[16px] font-bold text-foreground">{[wo.make, wo.model].filter(Boolean).join(" ") || t("vehicle")}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2.5">
                {wo.plate ? <PlatePreview plate={wo.plate} size="sm" /> : <span className="font-mono text-[12.5px] text-muted-foreground">{wo.vehicleId.slice(0, 8)}</span>}
                {wo.customerName && <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><Users className="size-3.5" />{wo.customerName}</span>}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          {/* line items */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <SecTitle>{t("line_items")}</SecTitle>
              {editable && <Button variant="soft" size="sm" onClick={() => setAddItem(true)}><Plus /> {t("add_item")}</Button>}
            </div>
            <div>
              {items.length === 0 && <div className="p-5"><Empty icon="list" text={t("empty")} /></div>}
              {items.map((it, i) => {
                const kind = kindFromProto(it.kind);
                const defPrice = num(it.defaultPrice);
                const discount = defPrice > num(it.unitPrice) ? (defPrice - num(it.unitPrice)) * (it.quantity || 0) : 0;
                return (
                  <div key={it.id ?? i} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0">
                    <Badge tone={kindIsMaterial(kind) ? "info" : "neutral"}>{t(kind)}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-semibold text-foreground">{it.description}</div>
                      <div className="font-mono text-[12.5px] text-muted-foreground">
                        {money(it.unitPrice)} × {it.quantity}
                        {discount > 0 && <span className="ml-1.5 text-muted-foreground line-through">{money(defPrice)}</span>}
                      </div>
                      {kind === "service" && (editable ? (
                        <div className="mt-1.5 max-w-[220px]">
                          <Select value={it.assignedMechanicId || NONE} disabled={busy} onValueChange={(v) => it.id && doAssignLine(it.id, v === NONE ? "" : v)}>
                            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>{t("unassigned")}</SelectItem>
                              {mechanics.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : it.assignedMechanicId ? (
                        <div className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground"><Users className="size-3.5" />{mechanics.find((m) => m.id === it.assignedMechanicId)?.name ?? "—"}</div>
                      ) : null)}
                      {kind === "service" && (() => {
                        const ls = lineStatusFromProto(it.status);
                        const m = ls === "done" ? { tone: "ok" as const, label: t("ln_done") }
                          : ls === "in_progress" ? { tone: "warn" as const, label: t("ln_inprogress") }
                          : { tone: "neutral" as const, label: t("ln_pending") };
                        return <div className="mt-1.5"><Badge tone={m.tone} dot>{m.label}</Badge></div>;
                      })()}
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-[14.5px] font-bold text-foreground">{money(num(it.unitPrice) * (it.quantity || 0))}</span>
                      {discount > 0 && <div className="font-mono text-[11px] text-success">−{money(discount)} {t("discount").toLowerCase()}</div>}
                    </div>
                    {editable && it.id && <Button variant="ghost" size="icon-sm" onClick={() => setEditItem(it)} aria-label={t("edit")} disabled={busy}><Pencil /></Button>}
                    {editable && <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive-soft" onClick={() => doRemoveItem(it.id)} aria-label={t("remove")} disabled={busy}><Trash2 /></Button>}
                  </div>
                );
              })}
            </div>
            <div className="bg-secondary/60 px-5 py-3.5">
              {totalDiscount > 0 && (
                <>
                  <Row label={t("before_discount")} value={money(grossSubtotal)} mono />
                  <Row label={`${t("discount")} · ${discountPct}%`} value={<span className="text-success">−{money(totalDiscount)}</span>} mono />
                  <Separator className="my-1.5" />
                </>
              )}
              <Row label={t("total")} value={money(total) + " " + t("soum")} mono strong />
              {totalCost > 0 && (
                <>
                  <Separator className="my-1.5" />
                  <Row label={t("expense")} value={money(totalCost)} mono />
                  <Row label={t("margin")} value={money(totalMargin)} mono />
                </>
              )}
            </div>
          </Card>

          {wo.notes && (
            <Card className="p-4">
              <SecTitle>{t("notes")}</SecTitle>
              <div className="whitespace-pre-wrap text-[14px] text-ink-2">{wo.notes}</div>
            </Card>
          )}
        </div>

        {/* side column */}
        <div className="flex flex-col gap-3.5">
          <Card className="p-4">
            <SecTitle right={state !== "closed" && state !== "canceled" ? <button onClick={() => setAssigning(true)} className="text-[13px] font-semibold text-primary-emphasis hover:underline">{t("assign")}</button> : undefined}>{t("mechanic")}</SecTitle>
            {mech ? (
              <div className="flex items-center gap-2.5">
                <UserAvatar name={mech.name} className="size-9" />
                <div><div className="text-[14px] font-semibold text-foreground">{mech.name}</div><div className="font-mono text-[12px] text-muted-foreground">{mech.phone}</div></div>
              </div>
            ) : <span className="text-[14px] text-muted-foreground">{t("unassigned")}</span>}
          </Card>
          <AuditCard woId={id} refresh={`${state}|${items.length}|${wo.assignedMechanicId ?? ""}`} mechanics={mechanics} />
        </div>
      </div>

      {/* sticky action bar */}
      {hasBar && (
        <div
          className="fixed bottom-0 right-0 z-50 border-t border-border bg-[color-mix(in_oklch,var(--bg),transparent_8%)] p-3.5 backdrop-blur-md"
          style={{ left: isMobile ? 0 : 260, paddingBottom: isMobile ? "calc(14px + env(safe-area-inset-bottom))" : 14 }}
        >
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-end gap-2.5">
            {canCancel && <Button variant="ghost" size={isMobile ? "sm" : "default"} disabled={busy} onClick={() => setConfirmCancel(true)} className="mr-auto text-destructive hover:bg-destructive-soft">{t("cancel_wo")}</Button>}
            {state === "estimated" && <Button variant="soft" size={isMobile ? "sm" : "default"} disabled={busy} onClick={requestApproval}><Send /> {t("request_approval")}</Button>}
            {(state === "ready" || state === "invoiced") && <Button size={isMobile ? "default" : "lg"} disabled={busy} onClick={() => setInvoice(true)}><Receipt /> {state === "ready" ? t("generate_invoice") : t("invoice")}</Button>}
            {forwardTargets.map((target) => {
              if (state === "ready" && target === "invoiced") return null;
              return <Button key={target} size={isMobile ? "default" : "lg"} disabled={busy} onClick={() => doTransition(target)}>{t(STATE_LABEL[target])}</Button>;
            })}
          </div>
        </div>
      )}

      <AddLineItemModal open={addItem} onClose={() => setAddItem(false)} onAdd={doAddItems} shopId={shopId} lang={lang} busy={busy} />
      <EditLineItemModal item={editItem} onClose={() => setEditItem(null)} onSave={doUpdateItem} busy={busy} />
      <AssignModal open={assigning} onClose={() => setAssigning(false)} mechanics={mechanics} current={wo.assignedMechanicId} onPick={doAssign} />
      <InvoiceModal open={invoice} onClose={() => setInvoice(false)} wo={wo} shopId={shopId} total={total} onChange={load} />
      <ApprovalModal approval={approval} onClose={() => setApproval(null)} />
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
    <Card className="p-4">
      <SecTitle>{t("audit_log")}</SecTitle>
      <div className="mt-1 flex flex-col gap-2.5">
        {entries.map((e) => (
          <div key={e.id} className="flex gap-2.5">
            <div className="mt-1.5 size-[7px] shrink-0 rounded-full bg-primary-emphasis" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-foreground">
                {t(AUDIT_LABEL[e.action] ?? "history")}{e.detail ? <span className="font-normal text-ink-2"> · {e.detail}</span> : null}
              </div>
              <div className="font-mono text-[11.5px] text-muted-foreground">
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
  const configured = !!approval?.deepLink;
  const copy = () => { if (approval?.deepLink) { navigator.clipboard?.writeText(approval.deepLink); toast(t("copied"), { icon: "check" }); } };
  return (
    <Dialog open={!!approval} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader><DialogTitle>{t("request_approval")}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          {!configured ? (
            <div className="text-[13.5px] leading-relaxed text-ink-2">{t("telegram_not_configured")}</div>
          ) : (
            <div className="flex flex-col items-center gap-3.5 pb-1">
              <div className="text-center text-[13.5px] leading-relaxed text-ink-2">{t("approval_share_hint")}</div>
              <div className="rounded-[12px] border border-border bg-white p-3"><QR data={approval!.deepLink} size={180} /></div>
              <div className="flex w-full gap-2">
                <Input value={approval!.deepLink} readOnly className="flex-1 font-mono text-[12px]" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="soft" onClick={copy}><Check /> {t("copy")}</Button>
              </div>
              <a href={approval!.deepLink} target="_blank" rel="noreferrer" className="w-full">
                <Button className="w-full"><Send /> {t("open_in_telegram")}</Button>
              </a>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/* ── add line item ── */
// Edit an existing line item in place (draft/editable states). Changes description, agreed
// price, unit cost and quantity; stock for a material line is reconciled by the backend.
function EditLineItemModal({ item, onClose, onSave, busy }: {
  item: LineItem | null; onClose: () => void; onSave: (lineItemId: string, fields: { description: string; unitPrice: number; quantity: number; cost: number; consumedQty: number }) => void; busy: boolean;
}) {
  const { t } = useLang();
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState("1");
  useEffect(() => {
    if (item) { setDesc(item.description); setPrice(String(num(item.unitPrice))); setCost(String(num(item.cost))); setQty(String(item.quantity || 1)); }
  }, [item]);
  if (!item) return null;

  const save = () => {
    if (!desc.trim() || !price) return;
    const quantity = parseInt(qty, 10) || 1;
    // Keep the exact stock draw unless it tracked the billing quantity (a directly-picked
    // material), in which case follow the new quantity. Bundled recipe amounts stay fixed.
    const oldQty = item.quantity || 0;
    const oldConsumed = item.consumedQty ?? 0;
    const consumedQty = item.variantId ? (oldConsumed === oldQty ? quantity : oldConsumed) : 0;
    onSave(item.id!, { description: desc.trim(), unitPrice: parseInt(price, 10) || 0, quantity, cost: parseInt(cost, 10) || 0, consumedQty });
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader><DialogTitle>{t("edit")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <Field label={t("description")}><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("description")} /></Field>
          <div className="grid grid-cols-[1fr_1fr_76px] gap-2.5">
            <Field label={t("agreed_price")}><MoneyInput value={price} onChange={setPrice} /></Field>
            <Field label={t("unit_cost")}><MoneyInput value={cost} onChange={setCost} /></Field>
            <Field label={t("qty")}><Input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="text-center font-mono" /></Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddLineItemModal({ open, onClose, onAdd, shopId, lang, busy }: {
  open: boolean; onClose: () => void; onAdd: (items: LineItemInput[]) => void; shopId: string; lang: string; busy: boolean;
}) {
  const { t } = useLang();
  const [mode, setMode] = useState<"menu" | "custom">("menu");
  const [catalog, setCatalog] = useState<"services" | "materials">("services");
  const [picked, setPicked] = useState(false);
  const [kind, setKind] = useState<LineItemKind>("service");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [qty, setQty] = useState("1");
  const [from, setFrom] = useState<{ menuItemId: string; defaultPrice: number }>({ menuItemId: "", defaultPrice: 0 });
  const [fromVariant, setFromVariant] = useState(""); // warehouse variant to consume, if picked from stock
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [parts, setParts] = useState<PickVariant[]>([]);
  const [mats, setMats] = useState<{ on: boolean; mat: import("@/lib/types").MenuMaterial }[]>([]);
  type Extra = { name: string; qty: string; unit: string; cost: string; price: string; variantId: string };
  const [extras, setExtras] = useState<Extra[]>([]);
  const addExtra = () => setExtras((s) => [...s, { name: "", qty: "1", unit: "pcs", cost: "", price: "", variantId: "" }]);
  const setExtra = (i: number, patch: Partial<Extra>) => setExtras((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const delExtra = (i: number) => setExtras((s) => s.filter((_, j) => j !== i));
  // Warehouse catalog: extra materials can be picked from (or created in) the warehouse.
  const [defs, setDefs] = useState<PropertyDefinition[]>([]);
  const [brands, setBrands] = useState<CatalogTerm[]>([]);
  const [categories, setCategories] = useState<CatalogTerm[]>([]);
  const [contragents, setContragents] = useState<Contragent[]>([]);
  const [creating, setCreating] = useState(false);
  const variantOptions = parts.map((p) => ({ value: p.id, label: p.name }));

  const reset = () => { setPicked(false); setKind("service"); setDesc(""); setPrice(""); setCost(""); setQty("1"); setFrom({ menuItemId: "", defaultPrice: 0 }); setFromVariant(""); setMats([]); setExtras([]); };

  const loadProducts = useCallback(() => { api.listProducts(shopId).then((ps) => setParts(flattenVariants(ps))).catch(() => {}); }, [shopId]);
  const loadContragents = useCallback(() => { api.listContragents().then(setContragents).catch(() => {}); }, []);

  useEffect(() => {
    if (!open) return;
    setMode("menu"); setCatalog("services"); reset();
    api.listMenuItems(shopId).then((m) => setMenu(m.filter((x) => x.active))).catch(() => {});
    loadProducts();
    api.listPropertyDefinitions().then(setDefs).catch(() => {});
    api.listCatalogTerms("brand").then(setBrands).catch(() => {});
    api.listCatalogTerms("category").then(setCategories).catch(() => {});
    loadContragents();
  }, [open, shopId, loadProducts, loadContragents]);

  // Pick a warehouse variant for an extra material row: fill name/unit/cost/price and link it.
  const pickExtraVariant = (i: number, variantId: string) => {
    const v = parts.find((x) => x.id === variantId);
    if (!v) { setExtra(i, { variantId: "" }); return; }
    setExtra(i, { variantId: v.id, name: v.unit ? `${v.name} (${v.unit})` : v.name, unit: v.unit || "pcs", cost: String(num(v.unitCost)), price: String(num(v.unitPrice)) });
  };

  const pickMenu = (m: MenuItem) => {
    setPicked(true); setKind("service"); setDesc(menuName(m, lang));
    setPrice(String(num(m.defaultPrice))); setCost(String(num(m.defaultCost)));
    setFrom({ menuItemId: m.id, defaultPrice: num(m.defaultPrice) }); setFromVariant("");
    setMats((m.materials ?? []).map((mat) => ({ on: true, mat }))); setExtras([]); setMode("custom");
  };
  const pickPart = (p: PickVariant) => {
    setPicked(true); setKind("material"); setDesc(p.unit ? `${p.name} (${p.unit})` : p.name);
    setPrice(String(num(p.unitPrice))); setCost(String(num(p.unitCost)));
    setFrom({ menuItemId: "", defaultPrice: num(p.unitPrice) }); setFromVariant(p.id); setMats([]); setExtras([]); setMode("custom");
  };
  const matLine = (mat: import("@/lib/types").MenuMaterial): LineItemInput => {
    const q = mat.quantity || 1;
    const label = mat.name + (mat.unit ? ` · ${mat.quantity} ${mat.unit}` : mat.quantity > 1 ? ` ×${mat.quantity}` : "");
    const unitPrice = Math.round(num(mat.unitPrice) * q);
    // Bundled recipe material: billed as one line but drawn from stock at its exact (possibly
    // fractional) recipe amount, so tie the variant and pass consumed_qty = the recipe quantity.
    return {
      kind: "material", description: label, unitPrice, quantity: 1,
      cost: Math.round(num(mat.unitCost) * q), defaultPrice: unitPrice,
      variantId: mat.variantId || undefined,
      consumedQty: mat.variantId ? q : undefined,
    };
  };
  const addCustom = () => {
    if (!desc.trim() || !price) return;
    const items: LineItemInput[] = [{
      kind, description: desc.trim(),
      unitPrice: parseInt(price, 10) || 0, quantity: parseInt(qty, 10) || 1, cost: parseInt(cost, 10) || 0,
      menuItemId: from.menuItemId || undefined, defaultPrice: from.defaultPrice || undefined,
      // When picked from stock, tie the material to its warehouse variant so it's deducted by
      // exactly the quantity billed on this line.
      variantId: kind === "material" && fromVariant ? fromVariant : undefined,
      consumedQty: kind === "material" && fromVariant ? (parseInt(qty, 10) || 1) : undefined,
    }];
    if (kind === "service") {
      for (const m of mats) if (m.on) items.push(matLine(m.mat));
      for (const e of extras) {
        if (!e.name.trim()) continue;
        const label = e.name.trim() + (e.unit ? ` · ${e.qty} ${e.unit}` : "");
        // When picked from stock, tie the material to its warehouse variant so it's deducted by
        // exactly the quantity billed on this line.
        const eqty = parseInt(e.qty, 10) || 1;
        items.push({ kind: "material", description: label, unitPrice: parseInt(e.price, 10) || 0, quantity: eqty, cost: parseInt(e.cost, 10) || 0, variantId: e.variantId || undefined, consumedQty: e.variantId ? eqty : undefined });
      }
    }
    onAdd(items);
  };

  const agreed = parseInt(price, 10) || 0;
  const discount = from.defaultPrice > agreed ? from.defaultPrice - agreed : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader><DialogTitle>{t("add_item")}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          <Tabs value={mode} onValueChange={(v) => { const nv = v as "menu" | "custom"; if (nv === "custom" && mode === "menu") reset(); setMode(nv); }} className="mb-4">
            <TabsList className="w-full"><TabsTrigger value="menu" className="flex-1">{t("from_menu")}</TabsTrigger><TabsTrigger value="custom" className="flex-1">{t("custom_item")}</TabsTrigger></TabsList>
          </Tabs>
          {mode === "menu" ? (
            <div className="flex flex-col gap-2.5">
              <Tabs value={catalog} onValueChange={(v) => setCatalog(v as "services" | "materials")}>
                <TabsList className="w-full"><TabsTrigger value="services" className="flex-1">{t("services")}</TabsTrigger><TabsTrigger value="materials" className="flex-1">{t("materials")}</TabsTrigger></TabsList>
              </Tabs>
              <div className="flex max-h-[340px] flex-col gap-1.5 overflow-y-auto">
                {catalog === "services" ? (
                  menu.length === 0 ? <Empty icon="list" text={t("empty")} /> :
                  menu.map((m) => (
                    <button key={m.id} disabled={busy} onClick={() => pickMenu(m)} className="flex items-center justify-between rounded-[9px] border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-secondary">
                      <span className="text-[14.5px] font-semibold text-foreground">{menuName(m, lang)}</span>
                      <span className="font-mono text-[14px] font-bold text-ink-2">{money(m.defaultPrice)}</span>
                    </button>
                  ))
                ) : (
                  parts.length === 0 ? <Empty icon="wrench" text={t("empty")} /> :
                  parts.map((p) => (
                    <button key={p.id} disabled={busy} onClick={() => pickPart(p)} className="flex items-center justify-between gap-2.5 rounded-[9px] border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-secondary">
                      <span className="min-w-0">
                        <span className="block truncate text-[14.5px] font-semibold text-foreground">{p.name}</span>
                        <span className="font-mono text-[11.5px] text-muted-foreground">{t("in_stock")}: {p.quantityOnHand}{p.unit ? " " + p.unit : ""}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[14px] font-bold text-ink-2">{money(num(p.unitPrice))}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {!picked && (
                <Tabs value={kind} onValueChange={(v) => setKind(v as LineItemKind)}>
                  <TabsList className="w-full">{LINE_ITEM_KINDS.map((k) => <TabsTrigger key={k} value={k} className="flex-1">{t(k)}</TabsTrigger>)}</TabsList>
                </Tabs>
              )}
              <Field label={t("description")}><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("description")} /></Field>
              <div className="grid grid-cols-[1fr_1fr_76px] gap-2.5">
                <Field label={t("agreed_price")}><MoneyInput value={price} onChange={setPrice} /></Field>
                <Field label={t("unit_cost")}><MoneyInput value={cost} onChange={setCost} /></Field>
                <Field label={t("qty")}><Input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="text-center font-mono" /></Field>
              </div>
              {from.defaultPrice > 0 && (
                <div className="flex justify-between gap-2 text-[12.5px] text-muted-foreground">
                  <span>{t("menu_price")}: <span className="font-mono">{money(from.defaultPrice)}</span></span>
                  {discount > 0 && <span className="text-primary-emphasis">{t("discount")}: −{money(discount)}</span>}
                </div>
              )}
              {kind === "service" && (
                <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{t("materials_needed")}</span>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setCreating(true)}><Plus /> {t("new_product")}</Button>
                      <Button variant="soft" size="sm" onClick={addExtra}><Plus /> {t("add_material")}</Button>
                    </div>
                  </div>
                  {mats.map((m, i) => (
                    <button key={i} type="button" onClick={() => setMats((s) => s.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                      className={cn("flex items-center gap-2.5 rounded-[9px] border px-2.5 py-2 text-left transition-colors", m.on ? "border-primary bg-primary-soft" : "border-border bg-card")}>
                      <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px]", m.on ? "border-primary-emphasis bg-primary-emphasis" : "border-input")}>{m.on && <Check className="size-3 text-white" />}</span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">{m.mat.name}{m.mat.unit ? ` · ${m.mat.quantity} ${m.mat.unit}` : m.mat.quantity > 1 ? ` ×${m.mat.quantity}` : ""}</span>
                      <span className="font-mono text-[12.5px] font-bold text-ink-2">{money(Math.round(num(m.mat.unitPrice) * (m.mat.quantity || 1)))}</span>
                    </button>
                  ))}
                  {extras.map((e, i) => (
                    <div key={i} className="flex flex-col gap-2.5 rounded-[10px] border border-border bg-secondary/30 p-2.5">
                      {/* warehouse picker + remove */}
                      <div className="flex items-end gap-2">
                        <Field label={t("from_warehouse")} className="flex-1">
                          <SearchSelect
                            value={e.variantId}
                            options={variantOptions}
                            placeholder={t("choose_from_warehouse")}
                            onChange={(v) => pickExtraVariant(i, v)}
                          />
                        </Field>
                        <Button variant="ghost" size="icon" onClick={() => delExtra(i)} aria-label="remove" className="mb-0.5 shrink-0 text-destructive hover:bg-destructive-soft"><Trash2 /></Button>
                      </div>
                      {/* material name (auto-filled from the warehouse; editable for ad-hoc) */}
                      <Field label={t("material_name")}>
                        <Input value={e.name} placeholder={t("material_name")} onChange={(ev) => setExtra(i, { name: ev.target.value, variantId: "" })} />
                      </Field>
                      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
                        <Field label={t("qty")}>
                          <Input value={e.qty} inputMode="numeric" onChange={(ev) => setExtra(i, { qty: ev.target.value.replace(/\D/g, "") })} className="h-10 text-center font-mono" />
                        </Field>
                        <Field label={t("unit")}>
                          <UnitSelect value={e.unit} onChange={(v) => setExtra(i, { unit: v })} style={{ height: 40, paddingTop: 0, paddingBottom: 0 }} />
                        </Field>
                        <Field label={t("unit_cost")}>
                          <MoneyInput value={e.cost} onChange={(v) => setExtra(i, { cost: v })} placeholder={t("unit_cost")} hideHint style={{ height: 40, paddingTop: 0, paddingBottom: 0 }} />
                        </Field>
                        <Field label={t("price")}>
                          <MoneyInput value={e.price} onChange={(v) => setExtra(i, { price: v })} placeholder={t("price")} hideHint style={{ height: 40, paddingTop: 0, paddingBottom: 0 }} />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogBody>
        {mode === "custom" && (
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
            <Button disabled={busy} onClick={addCustom}><Plus /> {t("add")}</Button>
          </DialogFooter>
        )}
      </DialogContent>

      {/* Create a warehouse product without leaving the line-item editor. */}
      <ProductForm
        open={creating}
        mode="new"
        product={null}
        shopId={shopId}
        definitions={defs}
        brands={brands}
        categories={categories}
        contragents={contragents}
        onContragentsChange={loadContragents}
        onClose={() => setCreating(false)}
        onSaved={loadProducts}
      />
    </Dialog>
  );
}

/* ── assign mechanic ── */
function AssignModal({ open, onClose, mechanics, current, onPick }: { open: boolean; onClose: () => void; mechanics: Staff[]; current?: string; onPick: (id: string) => void }) {
  const { t } = useLang();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader><DialogTitle>{t("assign")}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          <div className="flex flex-col gap-2 pb-1">
            {mechanics.length === 0 && <Empty icon="team" text={t("empty")} />}
            {mechanics.map((m) => (
              <button key={m.id} onClick={() => onPick(m.id)} className={cn("flex items-center gap-3 rounded-[9px] border bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary", current === m.id ? "border-primary" : "border-border")}>
                <UserAvatar name={m.name} className="size-9" />
                <div className="flex-1"><div className="text-[14.5px] font-semibold text-foreground">{m.name}</div><div className="font-mono text-[12px] text-muted-foreground">{m.phone}</div></div>
                {current === m.id && <Check className="size-[18px] text-primary-emphasis" />}
              </button>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/* ── invoice / fiscalize / pay ── */
function InvoiceModal({ open, onClose, wo, shopId, total, onChange }: { open: boolean; onClose: () => void; wo: WorkOrder; shopId: string; total: number; onChange: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [inv, setInv] = useState<import("@/lib/types").Invoice | null>(null);
  const [busy, setBusy] = useState(false);

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
    return () => { cancelled = true; };
  }, [open, wo.id, shopId, total, onChange, t, toast]);

  const pay = async (method: PaymentMethod) => {
    if (!inv || busy) return;
    setBusy(true);
    try { const updated = await api.markPaid(inv.id, method); setInv(updated); toast(t("paid"), { icon: "money" }); onChange(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[620px]">
        <DialogHeader><DialogTitle>{t("invoice") + (inv ? " · " + inv.id.slice(0, 8) : "")}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          {!inv ? (
            <div className="flex justify-center py-8"><Spinner className="size-6" /></div>
          ) : (
            <div className="flex flex-col gap-4 pb-1">
              <FiscalCheck invoice={inv} wo={wo} shop={loadShopProfile()} />
              {!inv.paid && (
                <div>
                  <div className="mb-2 text-[12.5px] font-semibold text-muted-foreground">{t("mark_paid")} · {t("payment_method")}</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Button variant="soft" disabled={busy} onClick={() => pay("cash")}>{t("pay_cash")}</Button>
                    <Button variant="soft" disabled={busy} onClick={() => pay("other")}>{t("pay_other")}</Button>
                  </div>
                </div>
              )}
              <div className="flex gap-2.5">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => toast(t("sent"), { icon: "send" })}><Send /> {t("notify_customer")}</Button>
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => window.open(`/print-invoice/${inv.id}`, "_blank")}><Printer /> {t("print")}</Button>
              </div>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
