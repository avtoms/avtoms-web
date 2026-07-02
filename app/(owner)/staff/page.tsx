"use client";
// Staff (owner-pages.jsx StaffPage): list staff, invite-mechanic modal, deactivate.
// Wired to api.listStaff / inviteMechanic / deactivateStaff.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, Badge, Avatar, Btn, Modal, Field, TextInput, Spinner, Empty, SkeletonRows, Segmented } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { roleFromProto } from "@/lib/enums";
import { PhoneField } from "@/components/catalog-fields";
import { isValidUzPhone, toE164 } from "@/lib/phone";
import type { Staff } from "@/lib/types";

export default function StaffPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [list, setList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listStaff(shopId)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);

  const deactivate = async (s: Staff) => {
    try { await api.deactivateStaff(s.id); toast(t("deactivate"), { icon: "check" }); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}><Btn variant="primary" icon="plus" onClick={() => setInviting(true)}>{t("invite_mechanic")}</Btn></div>
      <Card pad={0}>
        {loading && list.length === 0 ? <SkeletonRows rows={5} />
          : list.length === 0 ? <div style={{ padding: 24 }}><Empty icon="team" /></div>
          : list.map((s) => {
            const role = roleFromProto(s.role);
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 18px", borderBottom: "1px solid var(--line)" }}>
                <Avatar name={s.name} size={40} color={role === "mechanic" ? "var(--info)" : undefined} src={s.avatarUrl} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{s.name}</div><div style={{ fontSize: 12.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{s.phone}</div></div>
                <Badge tone={role === "owner" ? "accent" : "neutral"}>{t(role === "owner" ? "role_owner" : "role_mechanic")}</Badge>
                {role === "mechanic" && s.canCreateOrders && <span className="an-hide-sm"><Badge tone="info">{t("perm_create_orders")}</Badge></span>}
                <Badge tone={s.active ? "ok" : "danger"} dot>{s.active ? t("active") : t("inactive")}</Badge>
                <button onClick={() => setEditing(s)} className="an-btn" style={{ border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", padding: 4, display: "flex" }} aria-label={t("edit")}><Icon name="edit" size={16} /></button>
                {role !== "owner" && s.active && (
                  <button onClick={() => deactivate(s)} className="an-btn an-hide-sm" style={{ border: "none", background: "transparent", color: "var(--danger)", cursor: "pointer", padding: 4, display: "flex" }}><Icon name="trash" size={16} /></button>
                )}
              </div>
            );
          })}
      </Card>
      <InviteModal open={inviting} onClose={() => setInviting(false)} shopId={shopId} onCreated={() => load()} />
      <EditModal staff={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function EditModal({ staff, onClose, onSaved }: { staff: Staff | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", phone: "" });
  const [avatar, setAvatar] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (staff) { setF({ name: staff.name, phone: staff.phone }); setAvatar(staff.avatarUrl ?? ""); setCanCreate(!!staff.canCreateOrders); } }, [staff]);
  if (!staff) return null;
  const isMechanic = roleFromProto(staff.role) === "mechanic";

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast(t("file_too_large"), { icon: "alert", tone: "danger" }); return; }
    setUploading(true);
    try { setAvatar(await api.uploadImage(file)); }
    catch (err) { toast(err instanceof ApiError ? err.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!f.phone.trim() || busy) return;
    if (!isValidUzPhone(f.phone)) { toast(t("bad_phone"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      await api.updateStaff(staff.id, { name: f.name.trim(), phone: toE164(f.phone), avatarUrl: avatar });
      // Persist the permission only for mechanics and only when it actually changed.
      if (isMechanic && canCreate !== !!staff.canCreateOrders) await api.setStaffPermissions(staff.id, canCreate);
      toast(t("save"), { icon: "check" }); onSaved();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={!!staff} onClose={onClose} title={t("edit")} maxWidth={400}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy || uploading} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, position: "relative" }} aria-label={t("change_photo")}>
            {uploading ? <div style={{ width: 72, height: 72, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)" }}><Spinner size={22} /></div>
              : <Avatar name={f.name} size={72} src={avatar} />}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pickPhoto} style={{ display: "none" }} />
          <button type="button" onClick={() => fileRef.current?.click()} style={{ border: "none", background: "transparent", color: "var(--accent-2)", fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "var(--font-sans)" }}>{t("change_photo")}</button>
        </div>
        <Field label={t("name")}><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <PhoneField label={t("phone")} value={f.phone} onChange={(p) => setF({ ...f, phone: p })} invalidHint={t("bad_phone")} />
        {isMechanic && (
          <Field label={t("perm_create_orders")}>
            <Segmented options={[{ value: "off", label: t("no") }, { value: "on", label: t("yes") }]} value={canCreate ? "on" : "off"} onChange={(v) => setCanCreate(v === "on")} style={{ width: "100%" }} />
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>{t("perm_create_orders_hint")}</div>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function InviteModal({ open, onClose, shopId, onCreated }: { open: boolean; onClose: () => void; shopId: string; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ name: "", phone: "" }); }, [open]);

  const save = async () => {
    if (!f.phone.trim() || busy) return;
    if (!isValidUzPhone(f.phone)) { toast(t("bad_phone"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      await api.inviteMechanic(shopId, toE164(f.phone), f.name.trim());
      toast(t("invite") + " · SMS", { icon: "send" }); onClose(); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("invite_mechanic")} maxWidth={400}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" icon="send" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("invite")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label={t("name")}><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <PhoneField label={t("phone")} hint="SMS" value={f.phone} onChange={(p) => setF({ ...f, phone: p })} invalidHint={t("bad_phone")} />
      </div>
    </Modal>
  );
}
