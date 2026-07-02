"use client";
// Super-admin sales CRM: potential customers (leads) managed by hand — full contact + company
// + photo, the pipeline status and the deal price actually negotiated. Add / edit / delete.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, Avatar, Badge, Btn, Modal, Field, TextInput, SelectInput, Segmented, Spinner, Empty, SkeletonRows, useIsMobile } from "@/components/ui";
import { Icon } from "@/components/icons";
import { MoneyInput } from "@/components/catalog-fields";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";
import type { Lead } from "@/lib/types";

const STATUSES = ["new", "contacted", "qualified", "negotiating", "won", "lost"] as const;
const SOURCES = ["landing", "referral", "cold", "telegram", "instagram", "walk_in", "other"] as const;
type StatusTone = "neutral" | "info" | "accent" | "warn" | "ok" | "danger";
const STATUS_TONE: Record<string, StatusTone> = {
  new: "neutral", contacted: "info", qualified: "accent", negotiating: "warn", won: "ok", lost: "danger",
};
// Board column colours per pipeline status.
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
  const { toast } = useToast();
  const [list, setList] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Lead> | null>(null);
  const [view, setView] = useState<"list" | "board">("board");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listLeads()); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [t, toast]);

  useEffect(() => { load(); }, [load]);

  const remove = async (l: Lead) => {
    if (!window.confirm(t("lead_delete_confirm"))) return;
    try { await api.deleteLead(l.id); toast(t("deleted"), { icon: "check" }); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
  };

  // Change a lead's pipeline status (board drag or per-card menu). Optimistic; the whole lead
  // is sent because the API is a full overwrite.
  const move = async (id: string, status: string) => {
    const lead = list.find((l) => l.id === id);
    if (!lead || lead.status === status || busyId) return;
    setBusyId(id);
    setList((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try { await api.updateLead(id, { ...lead, status }); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); load(); }
    finally { setBusyId(null); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Segmented options={[{ value: "board", label: t("view_board") }, { value: "list", label: t("view_list") }]} value={view} onChange={(v) => setView(v as "list" | "board")} />
        <Btn variant="primary" icon="plus" onClick={() => setEditing({ ...empty })}>{t("lead_add")}</Btn>
      </div>

      {loading && list.length === 0 ? <Card pad={0}><SkeletonRows rows={6} /></Card>
        : list.length === 0 ? <Card pad={24}><Empty icon="users" text={t("no_leads")} /></Card>
        : view === "board" ? <LeadBoard leads={list} busyId={busyId} onMove={move} onOpen={setEditing} />
        : (
      <Card pad={0}>
        {list.map((l) => {
            const st = l.status || "new";
            const deal = num(l.dealPrice);
            return (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 18px", borderBottom: "1px solid var(--line)" }}>
                <Avatar name={l.name || l.company || "?"} size={42} src={l.imageUrl || undefined} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.name || "—"}{l.company && <span style={{ color: "var(--ink-3)", fontWeight: 500 }}> · {l.company}</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {l.phone && <span style={{ fontFamily: "var(--font-mono)" }}>{l.phone}</span>}
                    {l.city && <span>· {l.city}</span>}
                    {l.source && <span>· {t("src_" + l.source)}</span>}
                  </div>
                </div>
                {deal > 0 && <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>{money(deal)}</span>}
                <Badge tone={STATUS_TONE[st] || "neutral"} dot>{t("lead_" + st)}</Badge>
                <button onClick={() => setEditing(l)} className="an-btn" style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", padding: 4, display: "flex" }} aria-label={t("edit")}><Icon name="edit" size={16} /></button>
                <button onClick={() => remove(l)} className="an-btn an-hide-sm" style={{ border: "none", background: "transparent", color: "var(--danger)", cursor: "pointer", padding: 4, display: "flex" }} aria-label={t("delete")}><Icon name="trash" size={16} /></button>
              </div>
            );
          })}
      </Card>
      )}
      <LeadModal lead={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function LeadModal({ lead, onClose, onSaved }: { lead: Partial<Lead> | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState<Partial<Lead>>({ ...empty });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (lead) setF({ ...empty, ...lead, dealPrice: lead.dealPrice ? String(num(lead.dealPrice)) : "" }); }, [lead]);
  if (!lead) return null;
  const isEdit = !!lead.id;
  const set = (k: keyof Lead, v: string) => setF((s) => ({ ...s, [k]: v }));

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast(t("file_too_large"), { icon: "alert", tone: "danger" }); return; }
    setUploading(true);
    try { set("imageUrl", await api.uploadImage(file)); }
    catch (err) { toast(err instanceof ApiError ? err.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!(f.name || "").trim() && !(f.phone || "").trim()) { toast(t("lead_need_name_phone"), { icon: "alert", tone: "danger" }); return; }
    if (busy) return;
    setBusy(true);
    const payload: Partial<Lead> = { ...f, dealPrice: parseInt(String(f.dealPrice || "0"), 10) || 0 };
    try {
      if (isEdit && lead.id) await api.updateLead(lead.id, payload);
      else await api.createLead(payload);
      toast(t("save"), { icon: "check" }); onSaved();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={!!lead} onClose={onClose} title={isEdit ? t("lead_edit") : t("lead_add")} maxWidth={560}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy || uploading} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }} aria-label={t("change_photo")}>
            {uploading ? <div style={{ width: 72, height: 72, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)" }}><Spinner size={22} /></div>
              : <Avatar name={f.name || f.company || "?"} size={72} src={f.imageUrl || undefined} />}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pickPhoto} style={{ display: "none" }} />
          <button type="button" onClick={() => fileRef.current?.click()} style={{ border: "none", background: "transparent", color: "var(--accent-2)", fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "var(--font-sans)" }}>{t("change_photo")}</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("name")}><TextInput value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label={t("phone")}><TextInput value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} inputMode="tel" style={{ fontFamily: "var(--font-mono)" }} /></Field>
          <Field label={t("email")}><TextInput value={f.email || ""} onChange={(e) => set("email", e.target.value)} inputMode="email" /></Field>
          <Field label={t("lead_company")}><TextInput value={f.company || ""} onChange={(e) => set("company", e.target.value)} /></Field>
          <Field label={t("city")}><TextInput value={f.city || ""} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label={t("address")}><TextInput value={f.address || ""} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label={t("lead_source")}>
            <SelectInput value={f.source || "landing"} onChange={(e) => set("source", e.target.value)}>
              {SOURCES.map((s) => <option key={s} value={s}>{t("src_" + s)}</option>)}
            </SelectInput>
          </Field>
          <Field label={t("lead_status")}>
            <SelectInput value={f.status || "new"} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{t("lead_" + s)}</option>)}
            </SelectInput>
          </Field>
        </div>

        <Field label={t("lead_deal_price")}><MoneyInput value={String(f.dealPrice || "")} onChange={(v) => set("dealPrice", v)} /></Field>
        <Field label={t("notes")}>
          <textarea className="an-input" value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={3}
            style={{ width: "100%", resize: "vertical", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontFamily: "var(--font-sans)", fontSize: "calc(14.5px * var(--scale))" }} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Jira-style pipeline board: drag a lead card between status columns, or change its status
// from the per-card menu (works on mobile / without dragging). ──
function LeadBoard({ leads, busyId, onMove, onOpen }: {
  leads: Lead[]; busyId: string | null; onMove: (id: string, status: string) => void; onOpen: (l: Lead) => void;
}) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<string>("new");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  const byStatus = (s: string) => leads.filter((l) => (l.status || "new") === s);
  const start = (id: string) => { dragRef.current = id; setDragId(id); };
  const end = () => { dragRef.current = null; setDragId(null); setOverCol(null); };
  const drop = (s: string) => { const id = dragRef.current; setOverCol(null); if (id) onMove(id, s); };

  if (isMobile) {
    const active = (STATUSES as readonly string[]).includes(tab) ? tab : "new";
    const items = byStatus(active);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ overflowX: "auto" }}>
          <Segmented options={STATUSES.map((s) => ({ value: s, label: `${t("lead_" + s)} · ${byStatus(s).length}` }))} value={active} onChange={setTab} size="sm" style={{ flexWrap: "nowrap" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {items.length === 0 ? <div style={{ padding: "28px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>{t("no_leads")}</div>
            : items.map((l) => <LeadCard key={l.id} l={l} busy={busyId === l.id} dragging={false} onOpen={() => onOpen(l)} onMove={(s) => onMove(l.id, s)} onDragStart={() => {}} onDragEnd={() => {}} t={t} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${STATUSES.length}, minmax(230px, 300px))`, gap: 14, alignItems: "start", justifyContent: "start" }}>
        {STATUSES.map((s) => {
          const c = COL_COLOR[s]; const items = byStatus(s); const isOver = overCol === s;
          return (
            <div key={s}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overCol !== s) setOverCol(s); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol(null); }}
              onDrop={(e) => { e.preventDefault(); drop(s); }}
              style={{ display: "flex", flexDirection: "column", gap: 11 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: "var(--radius-sm)", background: c.soft, color: c.accent }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: "currentColor" }} /> {t("lead_" + s)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 12.5, minWidth: 22, height: 22, borderRadius: 999, background: "var(--surface)", color: c.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 7px" }}>{items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, minHeight: 120, borderRadius: "var(--radius)", padding: 11, background: isOver ? c.soft : "var(--surface-2)", outline: isOver ? `2px dashed ${c.accent}` : "2px dashed transparent", transition: "background .12s, outline-color .12s" }}>
                {items.length === 0 ? <div style={{ padding: "26px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 12.5 }}>{isOver ? t("drop_here") : "—"}</div>
                  : items.map((l) => <LeadCard key={l.id} l={l} busy={busyId === l.id} dragging={dragId === l.id} onOpen={() => onOpen(l)} onMove={(st) => onMove(l.id, st)} onDragStart={() => start(l.id)} onDragEnd={end} t={t} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadCard({ l, busy, dragging, onOpen, onMove, onDragStart, onDragEnd, t }: {
  l: Lead; busy: boolean; dragging: boolean; onOpen: () => void; onMove: (s: string) => void;
  onDragStart: () => void; onDragEnd: () => void; t: (k: string) => string;
}) {
  const deal = num(l.dealPrice);
  const c = COL_COLOR[l.status || "new"];
  return (
    <div draggable={!busy}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", l.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      className="an-card-hover"
      style={{ position: "relative", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", boxShadow: dragging ? "var(--shadow-lg)" : "var(--shadow)", padding: "12px 13px 12px 15px", cursor: busy ? "wait" : "grab", opacity: dragging ? 0.5 : busy ? 0.7 : 1, transition: "box-shadow .12s, opacity .12s" }}
    >
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: c.accent, borderTopLeftRadius: "var(--radius)", borderBottomLeftRadius: "var(--radius)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Avatar name={l.name || l.company || "?"} size={38} src={l.imageUrl || undefined} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(14px * var(--scale))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name || "—"}</div>
          {l.company && <div style={{ fontSize: 12, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.company}</div>}
        </div>
      </div>
      {(l.phone || l.city) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
          {l.phone && <span style={{ fontFamily: "var(--font-mono)" }}>{l.phone}</span>}
          {l.city && <span>· {l.city}</span>}
        </div>
      )}
      {deal > 0 && <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: 14, marginBottom: 10 }}>{money(deal)} <span style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-3)" }}>{t("soum")}</span></div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SelectInput value={l.status || "new"} onChange={(e) => onMove(e.target.value)} disabled={busy} style={{ flex: 1, fontSize: 12.5, padding: "5px 8px" }}>
          {STATUSES.map((s) => <option key={s} value={s}>{t("lead_" + s)}</option>)}
        </SelectInput>
        <button onClick={onOpen} className="an-btn" style={{ border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", padding: "6px 8px", borderRadius: "var(--radius-sm)", display: "flex" }} aria-label={t("edit")}><Icon name="edit" size={14} /></button>
      </div>
    </div>
  );
}
