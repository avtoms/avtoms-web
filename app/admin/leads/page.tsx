"use client";
// Super-admin sales CRM: potential customers (leads) managed by hand — full contact + company
// + photo, the pipeline status and the deal price actually negotiated. Add / edit / delete.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Phone, GripVertical, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { UserAvatar } from "@/components/ui-kit/avatar";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Textarea } from "@/components/ui-kit/textarea";
import { Spinner } from "@/components/ui-kit/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
import { MoneyInput } from "@/components/catalog-fields";
import { useLang } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";
import type { Lead } from "@/lib/types";

const STATUSES = ["new", "contacted", "qualified", "negotiating", "won", "lost"] as const;
// What the operator can say a lead came from. "registered" is deliberately absent: it is what
// the platform writes on a card it created itself when a service was registered, and offering
// it in the picker would let a hand-typed prospect claim to be a customer.
const SOURCES = ["landing", "referral", "cold", "telegram", "instagram", "walk_in", "other"] as const;
type StatusTone = "neutral" | "info" | "accent" | "warn" | "ok" | "danger";
const STATUS_TONE: Record<string, StatusTone> = {
  new: "neutral", contacted: "info", qualified: "accent", negotiating: "warn", won: "ok", lost: "danger",
};
// Board column colours per pipeline status (CSS vars, so they track the theme).
const COL_COLOR: Record<string, { accent: string; soft: string }> = {
  new: { accent: "var(--ink-3)", soft: "var(--surface-2)" },
  contacted: { accent: "var(--info)", soft: "var(--info-soft)" },
  qualified: { accent: "var(--accent-2)", soft: "var(--accent-soft)" },
  negotiating: { accent: "var(--warn)", soft: "var(--warn-soft)" },
  won: { accent: "var(--ok)", soft: "var(--ok-soft)" },
  lost: { accent: "var(--danger)", soft: "var(--danger-soft)" },
};

const empty: Partial<Lead> = { name: "", phone: "", email: "", company: "", imageUrl: "", city: "", address: "", source: "landing", status: "new", dealPrice: "", notes: "" };

export default function AdminLeadsPage() {
  const { t } = useLang();
  const [list, setList] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Lead> | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listLeads()); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : t("error")); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const remove = async (l: Lead) => {
    // Deleting the card of a live customer removes the card, not the service. Saying so is the
    // difference between tidying the board and believing you have just closed a shop down.
    if (!window.confirm(t(l.shopId ? "lead_delete_service_confirm" : "lead_delete_confirm"))) return;
    try { await api.deleteLead(l.id); toast.success(t("deleted")); load(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : t("error")); }
  };

  // Change a lead's pipeline status (board drag or per-card menu). Optimistic; the whole lead
  // is sent because the API is a full overwrite.
  const move = async (id: string, status: string) => {
    const lead = list.find((l) => l.id === id);
    if (!lead || lead.status === status || busyId) return;
    setBusyId(id);
    setList((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try { await api.updateLead(id, { ...lead, status }); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : t("error")); load(); }
    finally { setBusyId(null); }
  };

  return (
    <div className="flex flex-col gap-4">
      {list.length > 0 && <LeadStats leads={list} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as "board" | "list")}>
          <TabsList>
            <TabsTrigger value="board">{t("view_board")}</TabsTrigger>
            <TabsTrigger value="list">{t("view_list")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button onClick={() => setEditing({ ...empty })}><Plus /> {t("lead_add")}</Button>
      </div>

      {loading && list.length === 0 ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="an-skel h-12 w-full rounded-[8px]" />)}</Card>
      ) : list.length === 0 ? (
        <Card className="items-center gap-3 px-5 py-14 text-center">
          <div className="grid size-[52px] place-items-center rounded-[14px] bg-secondary text-muted-foreground"><Phone className="size-6" /></div>
          <span className="text-sm font-medium text-muted-foreground">{t("no_leads")}</span>
        </Card>
      ) : view === "board" ? (
        <LeadBoard leads={list} busyId={busyId} onMove={move} onOpen={setEditing} />
      ) : (
        <LeadList leads={list} onOpen={setEditing} onRemove={remove} t={t} />
      )}

      <LeadModal lead={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

// A card the platform wrote for itself the moment a service was registered. It marks a paying
// customer among prospects, which matters because the two look identical once a card sits in
// "won" — one is a deal somebody believes closed, the other is a service that exists and bills.
function ServiceMark({ t }: { t: (k: string) => string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-[3px] text-[11px] font-bold text-success">
      <Store className="size-3" /> {t("lead_is_service")}
    </span>
  );
}

const OPEN_STAGES = new Set(["new", "contacted", "qualified", "negotiating"]);
function LeadStats({ leads }: { leads: Lead[] }) {
  const { t } = useLang();
  const pipeline = leads.filter((l) => OPEN_STAGES.has(l.status || "new")).reduce((s, l) => s + num(l.dealPrice), 0);
  const won = leads.filter((l) => (l.status || "new") === "won");
  const wonValue = won.reduce((s, l) => s + num(l.dealPrice), 0);
  const decided = won.length + leads.filter((l) => l.status === "lost").length;
  const winRate = decided ? Math.round((won.length / decided) * 100) : 0;
  // How many of these are services that actually exist — the figure a "won" count cannot give,
  // since a card is dragged there by hand and a registration is not.
  const customers = leads.filter((l) => !!l.shopId).length;
  const items = [
    { label: t("a_total_leads"), value: String(leads.length), tone: "text-foreground" },
    { label: t("a_open_pipeline"), value: money(pipeline) + " " + t("soum"), tone: "text-info" },
    { label: t("a_won"), value: money(wonValue) + " " + t("soum"), tone: "text-success" },
    { label: t("a_lead_customers"), value: String(customers), tone: "text-success" },
    { label: t("a_conversion_t"), value: winRate + "%", tone: "text-primary-emphasis" },
  ];
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
      {items.map((it) => (
        <div key={it.label} className="rounded-[12px] border border-border bg-card px-4 py-3 shadow-[var(--shadow)]">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{it.label}</div>
          <div className={`mt-1 font-mono text-[18px] font-extrabold tracking-[-0.02em] ${it.tone}`}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function LeadList({ leads, onOpen, onRemove, t }: { leads: Lead[]; onOpen: (l: Lead) => void; onRemove: (l: Lead) => void; t: (k: string) => string }) {
  return (
    <Card className="overflow-hidden">
      {leads.map((l, i) => {
        const st = l.status || "new";
        const deal = num(l.dealPrice);
        return (
          <div key={l.id} className={cn("flex items-center gap-3.5 px-4 py-3 sm:px-5", i !== leads.length - 1 && "border-b border-border")}>
            <UserAvatar name={l.name || l.company || "?"} src={l.imageUrl || undefined} className="size-10" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14.5px] font-bold text-foreground">
                  {l.name || "—"}{l.company && <span className="font-medium text-muted-foreground"> · {l.company}</span>}
                </span>
                {l.shopId && <ServiceMark t={t} />}
              </div>
              <div className="flex flex-wrap gap-x-2 text-[12.5px] text-muted-foreground">
                {l.phone && <span className="font-mono">{l.phone}</span>}
                {l.city && <span>· {l.city}</span>}
                {l.source && <span>· {t("src_" + l.source)}</span>}
              </div>
            </div>
            {deal > 0 && <span className="font-mono text-[14px] font-bold text-foreground">{money(deal)}</span>}
            <Badge tone={STATUS_TONE[st] || "neutral"} dot>{t("lead_" + st)}</Badge>
            <Button variant="ghost" size="icon-sm" onClick={() => onOpen(l)} aria-label={t("edit")}><Pencil /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onRemove(l)} aria-label={t("delete")} className="hidden text-destructive hover:bg-destructive-soft sm:inline-flex"><Trash2 /></Button>
          </div>
        );
      })}
    </Card>
  );
}

function LeadModal({ lead, onClose, onSaved }: { lead: Partial<Lead> | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const [f, setF] = useState<Partial<Lead>>({ ...empty });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (lead) setF({ ...empty, ...lead, dealPrice: lead.dealPrice ? String(num(lead.dealPrice)) : "" }); }, [lead]);
  const isEdit = !!lead?.id;
  const set = (k: keyof Lead, v: string) => setF((s) => ({ ...s, [k]: v }));
  // A card written by the platform carries a source the picker does not offer. It is added to
  // the list for this one lead so opening the card shows what it is instead of an empty box,
  // and so saving cannot silently rewrite where it came from.
  const sources: readonly string[] =
    f.source && !(SOURCES as readonly string[]).includes(f.source) ? [...SOURCES, f.source] : SOURCES;

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error(t("file_too_large")); return; }
    setUploading(true);
    try { set("imageUrl", await api.uploadImage(file)); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : t("error")); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!(f.name || "").trim() && !(f.phone || "").trim()) { toast.error(t("lead_need_name_phone")); return; }
    if (busy) return;
    setBusy(true);
    const payload: Partial<Lead> = { ...f, dealPrice: parseInt(String(f.dealPrice || "0"), 10) || 0 };
    try {
      if (isEdit && lead?.id) await api.updateLead(lead.id, payload);
      else await api.createLead(payload);
      toast.success(t("save")); onSaved();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : t("error")); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? t("lead_edit") : t("lead_add")}
            {f.shopId && <ServiceMark t={t} />}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} aria-label={t("change_photo")} className="rounded-full">
              {uploading ? (
                <div className="grid size-[72px] place-items-center rounded-full bg-secondary"><Spinner className="size-6" /></div>
              ) : (
                <UserAvatar name={f.name || f.company || "?"} src={f.imageUrl || undefined} className="size-[72px] text-[24px]" />
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pickPhoto} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} className="text-[12.5px] font-semibold text-primary-emphasis">{t("change_photo")}</button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Field label={t("name")}><Input value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label={t("phone")}><Input value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} inputMode="tel" className="font-mono" /></Field>
            <Field label={t("email")}><Input value={f.email || ""} onChange={(e) => set("email", e.target.value)} inputMode="email" /></Field>
            <Field label={t("lead_company")}><Input value={f.company || ""} onChange={(e) => set("company", e.target.value)} /></Field>
            <Field label={t("city")}><Input value={f.city || ""} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label={t("address")}><Input value={f.address || ""} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field label={t("lead_source")}>
              <Select value={f.source || "landing"} onValueChange={(v) => set("source", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{sources.map((s) => <SelectItem key={s} value={s}>{t("src_" + s)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={t("lead_status")}>
              <Select value={f.status || "new"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{t("lead_" + s)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          <Field label={t("lead_deal_price")}><MoneyInput value={String(f.dealPrice || "")} onChange={(v) => set("dealPrice", v)} /></Field>
          <Field label={t("notes")}><Textarea value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={3} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy || uploading} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Jira-style pipeline board: drag a lead card between status columns, or change its status
// from the per-card menu (works on mobile / without dragging). ──
function LeadBoard({ leads, busyId, onMove, onOpen }: {
  leads: Lead[]; busyId: string | null; onMove: (id: string, status: string) => void; onOpen: (l: Lead) => void;
}) {
  const { t } = useLang();
  const [tab, setTab] = useState<string>("new");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  const byStatus = (s: string) => leads.filter((l) => (l.status || "new") === s);
  const start = (id: string) => { dragRef.current = id; setDragId(id); };
  const end = () => { dragRef.current = null; setDragId(null); setOverCol(null); };
  const drop = (s: string) => { const id = dragRef.current; setOverCol(null); if (id) onMove(id, s); };

  return (
    <>
      {/* Mobile: status tabs, one column at a time */}
      <div className="flex flex-col gap-3.5 md:hidden">
        <div className="overflow-x-auto pb-1">
          <Tabs value={(STATUSES as readonly string[]).includes(tab) ? tab : "new"} onValueChange={setTab}>
            <TabsList className="w-max">
              {STATUSES.map((s) => <TabsTrigger key={s} value={s}>{t("lead_" + s)} · {byStatus(s).length}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-col gap-2.5">
          {byStatus((STATUSES as readonly string[]).includes(tab) ? tab : "new").length === 0
            ? <div className="py-7 text-center text-[13px] text-muted-foreground">{t("no_leads")}</div>
            : byStatus((STATUSES as readonly string[]).includes(tab) ? tab : "new").map((l) => (
              <LeadCard key={l.id} l={l} busy={busyId === l.id} dragging={false} onOpen={() => onOpen(l)} onMove={(s) => onMove(l.id, s)} onDragStart={() => {}} onDragEnd={() => {}} t={t} draggable={false} />
            ))}
        </div>
      </div>

      {/* Desktop: horizontal Kanban */}
      <div className="hidden overflow-x-auto pb-1 md:block">
        <div className="grid items-start gap-3.5" style={{ gridTemplateColumns: `repeat(${STATUSES.length}, minmax(230px, 300px))` }}>
          {STATUSES.map((s) => {
            const c = COL_COLOR[s]; const items = byStatus(s); const isOver = overCol === s;
            return (
              <div key={s}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overCol !== s) setOverCol(s); }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null); }}
                onDrop={(e) => { e.preventDefault(); drop(s); }}
                className="flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between rounded-[9px] px-3 py-2" style={{ background: c.soft, color: c.accent }}>
                  <span className="inline-flex items-center gap-2 text-[13px] font-bold">
                    <span className="size-2 rounded-full bg-current" /> {t("lead_" + s)}
                  </span>
                  <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-card px-1.5 font-mono text-[12.5px] font-extrabold" style={{ color: c.accent }}>{items.length}</span>
                </div>
                <div
                  className="flex min-h-[120px] flex-col gap-2.5 rounded-[12px] p-2.5 transition-colors"
                  style={{ background: isOver ? c.soft : "var(--surface-2)", outline: isOver ? `2px dashed ${c.accent}` : "2px dashed transparent" }}
                >
                  {items.length === 0
                    ? <div className="py-6 text-center text-[12.5px] text-muted-foreground">{isOver ? t("drop_here") : "—"}</div>
                    : items.map((l) => <LeadCard key={l.id} l={l} busy={busyId === l.id} dragging={dragId === l.id} onOpen={() => onOpen(l)} onMove={(st) => onMove(l.id, st)} onDragStart={() => start(l.id)} onDragEnd={end} t={t} draggable />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function LeadCard({ l, busy, dragging, onOpen, onMove, onDragStart, onDragEnd, t, draggable }: {
  l: Lead; busy: boolean; dragging: boolean; onOpen: () => void; onMove: (s: string) => void;
  onDragStart: () => void; onDragEnd: () => void; t: (k: string) => string; draggable: boolean;
}) {
  const deal = num(l.dealPrice);
  const c = COL_COLOR[l.status || "new"];
  return (
    <div draggable={draggable && !busy}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", l.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      className={cn("relative rounded-[12px] border border-border bg-card p-3 pl-3.5 shadow-[var(--shadow)] transition-[box-shadow,opacity]", draggable && !busy && "cursor-grab", dragging && "opacity-50 shadow-[var(--shadow-lg)]", busy && "cursor-wait opacity-70")}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[12px]" style={{ background: c.accent }} />
      <div className="mb-2.5 flex items-center gap-2.5">
        <UserAvatar name={l.name || l.company || "?"} src={l.imageUrl || undefined} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-foreground">{l.name || "—"}</div>
          {l.company && <div className="truncate text-[12px] text-muted-foreground">{l.company}</div>}
        </div>
        {draggable && <GripVertical className="size-4 text-muted-foreground/50" />}
      </div>
      {l.shopId && <div className="mb-2.5"><ServiceMark t={t} /></div>}
      {(l.phone || l.city) && (
        <div className="mb-2.5 flex flex-wrap gap-x-2 text-[12px] text-muted-foreground">
          {l.phone && <span className="font-mono">{l.phone}</span>}
          {l.city && <span>· {l.city}</span>}
        </div>
      )}
      {deal > 0 && <div className="mb-2.5 font-mono text-[14px] font-bold text-foreground">{money(deal)} <span className="text-[11px] font-medium text-muted-foreground">{t("soum")}</span></div>}
      <div className="flex items-center gap-2">
        <Select value={l.status || "new"} onValueChange={onMove} disabled={busy}>
          <SelectTrigger size="sm" className="flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{t("lead_" + s)}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="secondary" size="icon-sm" onClick={onOpen} aria-label={t("edit")}><Pencil /></Button>
      </div>
    </div>
  );
}
