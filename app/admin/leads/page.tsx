"use client";
// Super-admin sales CRM: potential customers (leads) managed by hand — full contact + company
// + photo, the pipeline status and the deal price actually negotiated. Add / edit / delete.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, Avatar, Badge, Btn, Modal, Field, TextInput, SelectInput, Spinner, Empty, SkeletonRows } from "@/components/ui";
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

const empty: Partial<Lead> = { name: "", phone: "", email: "", company: "", imageUrl: "", city: "", address: "", source: "landing", status: "new", dealPrice: "", notes: "" };

export default function AdminLeadsPage() {
  const { t } = useLang();
  const { toast } = useToast();
  const [list, setList] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Lead> | null>(null);

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn variant="primary" icon="plus" onClick={() => setEditing({ ...empty })}>{t("lead_add")}</Btn>
      </div>
      <Card pad={0}>
        {loading && list.length === 0 ? <SkeletonRows rows={6} />
          : list.length === 0 ? <div style={{ padding: 24 }}><Empty icon="users" text={t("no_leads")} /></div>
          : list.map((l) => {
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
