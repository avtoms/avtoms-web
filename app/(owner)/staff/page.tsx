"use client";
// Staff (owner-pages.jsx StaffPage): list staff, invite-mechanic modal, deactivate.
// Wired to api.listStaff / inviteMechanic / deactivateStaff.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, Send } from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { UserAvatar } from "@/components/ui-kit/avatar";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner, Switch } from "@/components/ui-kit/misc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
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

  const deactivate = useCallback(async (s: Staff) => {
    try { await api.deactivateStaff(s.id); toast(t("deactivate"), { icon: "check" }); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
  }, [t, toast, load]);

  const columns = useMemo<ColumnDef<Staff>[]>(() => [
    {
      id: "name",
      accessorFn: (s) => `${s.name || ""} ${s.phone || ""}`,
      header: ({ column }) => <SortHeader column={column}>{t("name")}</SortHeader>,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center gap-3">
            <UserAvatar name={s.name || "?"} src={s.avatarUrl || undefined} className="size-9" />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-bold text-foreground">{s.name || "—"}</div>
              <div className="truncate font-mono text-[12px] text-muted-foreground">{s.phone}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: "role",
      accessorFn: (s) => roleFromProto(s.role),
      header: ({ column }) => <SortHeader column={column}>{t("role")}</SortHeader>,
      cell: ({ row }) => {
        const role = roleFromProto(row.original.role);
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={role === "owner" ? "accent" : "info"}>{t(role === "owner" ? "role_owner" : "role_mechanic")}</Badge>
            {role === "mechanic" && row.original.canCreateOrders && <Badge tone="neutral">{t("perm_create_orders")}</Badge>}
          </div>
        );
      },
    },
    {
      id: "status",
      accessorFn: (s) => (s.active ? "active" : "inactive"),
      header: ({ column }) => <SortHeader column={column}>{t("status")}</SortHeader>,
      cell: ({ row }) => (
        <Badge tone={row.original.active ? "ok" : "danger"} dot>{row.original.active ? t("active") : t("inactive")}</Badge>
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      header: () => <span className="sr-only">{t("edit")}</span>,
      cell: ({ row }) => {
        const s = row.original;
        const role = roleFromProto(s.role);
        return (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing(s)} aria-label={t("edit")}><Pencil /></Button>
            {role !== "owner" && s.active && (
              <Button variant="ghost" size="icon-sm" onClick={() => deactivate(s)} aria-label={t("deactivate")} className="text-destructive hover:bg-destructive-soft"><Trash2 /></Button>
            )}
          </div>
        );
      },
    },
  ], [t, deactivate]);

  return (
    <div className="flex flex-col gap-4">
      {loading && list.length === 0 ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="an-skel h-12 w-full rounded-[8px]" />)}</Card>
      ) : (
        <DataTable
          columns={columns}
          data={list}
          searchPlaceholder={t("search") + "…"}
          emptyText={t("empty")}
          toolbar={<Button onClick={() => setInviting(true)}><Plus /> {t("invite_mechanic")}</Button>}
          columnLabels={{ name: t("name"), role: t("role"), status: t("status") }}
          pageSize={12}
        />
      )}
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
  const isMechanic = staff ? roleFromProto(staff.role) === "mechanic" : false;

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
    if (!staff || !f.phone.trim() || busy) return;
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
    <Dialog open={!!staff} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader><DialogTitle>{t("edit")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} aria-label={t("change_photo")} className="rounded-full">
              {uploading ? (
                <div className="grid size-[72px] place-items-center rounded-full bg-secondary"><Spinner className="size-6" /></div>
              ) : (
                <UserAvatar name={f.name} src={avatar || undefined} className="size-[72px] text-[24px]" />
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pickPhoto} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} className="text-[12.5px] font-semibold text-primary-emphasis">{t("change_photo")}</button>
          </div>
          <Field label={t("name")}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <PhoneField label={t("phone")} value={f.phone} onChange={(p) => setF({ ...f, phone: p })} invalidHint={t("bad_phone")} />
          {isMechanic && (
            <Field label={t("perm_create_orders")} hint={t("perm_create_orders_hint")}>
              <div className="flex h-10 items-center">
                <Switch checked={canCreate} onCheckedChange={setCanCreate} />
              </div>
            </Field>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy || uploading} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader><DialogTitle>{t("invite_mechanic")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <Field label={t("name")}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <PhoneField label={t("phone")} hint="SMS" value={f.phone} onChange={(p) => setF({ ...f, phone: p })} invalidHint={t("bad_phone")} />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : <><Send /> {t("invite")}</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
