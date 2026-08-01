"use client";
// Staff and the roles they hold. Two tabs, because they are two halves of one question: a role
// says what a job is, and the staff list says who does it.
//
// The old page could invite a mechanic by SMS and toggle one capability. A shop hires somebody
// on Monday and wants them working on Monday, with the access their job needs and no more —
// which means creating an account with a password here, and saying what the job is here too.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, Send, KeyRound, ShieldCheck } from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { UserAvatar } from "@/components/ui-kit/avatar";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError, optional } from "@/lib/api";
import { roleFromProto } from "@/lib/enums";
import { PermMatrix } from "@/components/perm-matrix";
import { permLabel } from "@/lib/perms";
import { PhoneField } from "@/components/catalog-fields";
import { isValidUzPhone, toE164 } from "@/lib/phone";
import type { Staff, ShopRole } from "@/lib/types";

// The shortest password worth calling one. Mirrors the auth service, which refuses anything
// shorter — checked here too so the answer arrives before the round trip.
const MIN_PASSWORD = 6;

export default function StaffPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [tab, setTab] = useState<"people" | "roles">("people");
  const [list, setList] = useState<Staff[]>([]);
  const [roles, setRoles] = useState<ShopRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [access, setAccess] = useState<Staff | null>(null);
  const [password, setPassword] = useState<Staff | null>(null);
  const [role, setRole] = useState<Partial<ShopRole> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [staff, rs] = await Promise.all([
        api.listStaff(shopId),
        // A gateway that predates roles answers 404 rather than failing the whole page.
        optional(api.listRoles(shopId), [] as ShopRole[]),
      ]);
      setList(staff); setRoles(rs);
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);

  const deactivate = useCallback(async (s: Staff) => {
    try { await api.deactivateStaff(s.id); toast(t("deactivate"), { icon: "check" }); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
  }, [t, toast, load]);

  const removeRole = useCallback(async (r: ShopRole) => {
    if (!window.confirm(t("role_delete_confirm"))) return;
    try { await api.deleteRole(r.id); toast(t("delete"), { icon: "check" }); load(); }
    catch (e) {
      // The server refuses while anybody holds it — moving them first is the point, so say so
      // rather than showing the raw refusal.
      const msg = e instanceof ApiError && e.status === 400 ? t("role_in_use") : e instanceof ApiError ? e.message : t("error");
      toast(msg, { icon: "alert", tone: "danger" });
    }
  }, [t, toast, load]);

  const columns = useMemo<ColumnDef<Staff>[]>(() => [
    {
      id: "name",
      accessorFn: (s) => `${s.name || ""} ${s.phone || ""} ${s.login || ""}`,
      header: ({ column }) => <SortHeader column={column}>{t("name")}</SortHeader>,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center gap-3">
            <UserAvatar name={s.name || "?"} src={s.avatarUrl || undefined} className="size-9" />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-bold text-foreground">{s.name || "—"}</div>
              <div className="flex flex-wrap gap-x-2 truncate font-mono text-[12px] text-muted-foreground">
                {s.phone && <span>{s.phone}</span>}
                {/* The login is what they type to get in, so it belongs next to who they are. */}
                {s.login && <span className="text-primary-emphasis">@{s.login}</span>}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: "role",
      accessorFn: (s) => s.roleName || roleFromProto(s.role),
      header: ({ column }) => <SortHeader column={column}>{t("role")}</SortHeader>,
      cell: ({ row }) => {
        const s = row.original;
        const base = roleFromProto(s.role);
        if (base === "owner") return <Badge tone="accent">{t("role_owner")}</Badge>;
        const extra = (s.permissions ?? []).length;
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {s.roleName
              ? <Badge tone="info">{s.roleName}</Badge>
              : <Badge tone="neutral">{t("role_none")}</Badge>}
            {/* Grants sitting on top of the role. The count, not the list: the detail belongs
                on the form, and a row of fourteen chips tells nobody anything. */}
            {extra > 0 && <Badge tone="neutral">+{extra}</Badge>}
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
        const isOwner = roleFromProto(s.role) === "owner";
        return (
          <div className="flex items-center justify-end gap-1">
            {!isOwner && (
              <Button variant="ghost" size="icon-sm" onClick={() => setAccess(s)} aria-label={t("staff_access")}><ShieldCheck /></Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => setPassword(s)} aria-label={t("staff_password")}><KeyRound /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing(s)} aria-label={t("edit")}><Pencil /></Button>
            {!isOwner && s.active && (
              <Button variant="ghost" size="icon-sm" onClick={() => deactivate(s)} aria-label={t("deactivate")} className="text-destructive hover:bg-destructive-soft"><Trash2 /></Button>
            )}
          </div>
        );
      },
    },
  ], [t, deactivate]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "people" | "roles")}>
          <TabsList>
            <TabsTrigger value="people">{t("nav_staff")} · {list.length}</TabsTrigger>
            <TabsTrigger value="roles">{t("roles")} · {roles.length}</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "roles" && <Button onClick={() => setRole({ name: "", permissions: [] })}><Plus /> {t("role_add")}</Button>}
      </div>

      {tab === "people" ? (
        loading && list.length === 0 ? (
          <Card className="gap-2.5 p-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="an-skel h-12 w-full rounded-[8px]" />)}</Card>
        ) : (
          <DataTable
            columns={columns}
            data={list}
            searchPlaceholder={t("search") + "…"}
            emptyText={t("empty")}
            toolbar={
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setCreating(true)}><Plus /> {t("staff_add")}</Button>
                {/* The SMS invite still exists: some shops would rather the person set their
                    own way in than be handed a password over the counter. */}
                <Button variant="secondary" onClick={() => setInviting(true)}><Send /> {t("invite_mechanic")}</Button>
              </div>
            }
            columnLabels={{ name: t("name"), role: t("role"), status: t("status") }}
            pageSize={12}
          />
        )
      ) : (
        <RoleList roles={roles} loading={loading} onOpen={setRole} onRemove={removeRole} t={t} />
      )}

      <CreateStaffModal open={creating} roles={roles} onClose={() => setCreating(false)} onCreated={load} />
      <InviteModal open={inviting} onClose={() => setInviting(false)} shopId={shopId} onCreated={load} />
      <EditModal staff={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      <AccessModal staff={access} roles={roles} onClose={() => setAccess(null)} onSaved={() => { setAccess(null); load(); }} />
      <PasswordModal staff={password} onClose={() => setPassword(null)} onSaved={() => { setPassword(null); load(); }} />
      <RoleModal role={role} onClose={() => setRole(null)} onSaved={() => { setRole(null); load(); }} />
    </div>
  );
}

// ── roles ──

function RoleList({ roles, loading, onOpen, onRemove, t }: {
  roles: ShopRole[]; loading: boolean; onOpen: (r: ShopRole) => void; onRemove: (r: ShopRole) => void; t: (k: string) => string;
}) {
  if (loading && roles.length === 0) {
    return <Card className="gap-2.5 p-5">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="an-skel h-12 w-full rounded-[8px]" />)}</Card>;
  }
  if (roles.length === 0) {
    return (
      <Card className="items-center gap-1 px-5 py-10 text-center">
        <div className="text-[14.5px] font-bold text-foreground">{t("roles_empty")}</div>
        <div className="max-w-[420px] text-[13px] text-muted-foreground">{t("roles_empty_hint")}</div>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      {roles.map((r, i) => (
        <div key={r.id} className={cnRow(i, roles.length)}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14.5px] font-bold text-foreground">{r.name}</span>
              {/* How many people stop being able to work if this goes. */}
              <Badge tone={r.members ? "info" : "neutral"}>{r.members ?? 0} {t("people")}</Badge>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-1 text-[12px] text-muted-foreground">
              {(r.permissions ?? []).length === 0
                ? <span>{t("role_no_perms")}</span>
                : (r.permissions ?? []).map((p) => <span key={p} className="rounded-full bg-secondary px-2 py-[1px]">{t(permLabel(p))}</span>)}
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => onOpen(r)} aria-label={t("edit")}><Pencil /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onRemove(r)} aria-label={t("delete")} className="text-destructive hover:bg-destructive-soft"><Trash2 /></Button>
        </div>
      ))}
    </Card>
  );
}

const cnRow = (i: number, n: number) =>
  "flex items-center gap-3 px-4 py-3 sm:px-5" + (i !== n - 1 ? " border-b border-border" : "");

function RoleModal({ role, onClose, onSaved }: { role: Partial<ShopRole> | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (role) { setName(role.name ?? ""); setPerms(role.permissions ?? []); } }, [role]);
  const isEdit = !!role?.id;

  const save = async () => {
    if (!name.trim()) { toast(t("role_need_name"), { icon: "alert", tone: "danger" }); return; }
    if (busy) return;
    setBusy(true);
    try {
      if (isEdit && role?.id) await api.updateRole(role.id, name.trim(), perms);
      else await api.createRole(name.trim(), perms);
      toast(t("save"), { icon: "check" }); onSaved();
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 409 ? t("role_name_taken") : e instanceof ApiError ? e.message : t("error");
      toast(msg, { icon: "alert", tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!role} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader><DialogTitle>{isEdit ? t("role_edit") : t("role_add")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <Field label={t("role_name")} hint={t("role_name_hint")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("role_name_ph")} />
          </Field>
          <PermMatrix value={perms} onChange={setPerms} />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── people ──

// RolePicker is shared by the create and access forms: pick a job, or none.
function RolePicker({ roles, value, onChange }: { roles: ShopRole[]; value: string; onChange: (v: string) => void }) {
  const { t } = useLang();
  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("role_none")}</SelectItem>
        {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function CreateStaffModal({ open, roles, onClose, onCreated }: {
  open: boolean; roles: ShopRole[]; onClose: () => void; onCreated: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", phone: "", login: "", password: "" });
  const [roleId, setRoleId] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF({ name: "", phone: "", login: "", password: "" }); setRoleId(""); setPerms([]); } }, [open]);

  const rolePerms = roles.find((r) => r.id === roleId)?.permissions ?? [];

  const save = async () => {
    if (busy) return;
    if (!f.login.trim() || !f.password) { toast(t("staff_need_login"), { icon: "alert", tone: "danger" }); return; }
    if (f.password.length < MIN_PASSWORD) { toast(t("password_too_short"), { icon: "alert", tone: "danger" }); return; }
    if (f.phone.trim() && !isValidUzPhone(f.phone)) { toast(t("bad_phone"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      await api.createStaff({
        name: f.name.trim(), phone: f.phone.trim() ? toE164(f.phone) : "",
        login: f.login.trim().toLowerCase(), password: f.password,
        roleId, permissions: perms,
      });
      toast(t("save"), { icon: "check" }); onClose(); onCreated();
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 409 ? t("login_taken") : e instanceof ApiError ? e.message : t("error");
      toast(msg, { icon: "alert", tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader><DialogTitle>{t("staff_add")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Field label={t("name")}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <PhoneField label={t("phone")} value={f.phone} onChange={(p) => setF({ ...f, phone: p })} invalidHint={t("bad_phone")} />
            <Field label={t("login")} hint={t("login_hint")}>
              <Input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} autoComplete="off" className="font-mono" />
            </Field>
            <Field label={t("password")} hint={t("password_hint")}>
              <Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" className="font-mono" />
            </Field>
          </div>
          <Field label={t("role")} hint={t("staff_role_hint")}>
            <RolePicker roles={roles} value={roleId} onChange={setRoleId} />
          </Field>
          <div>
            <div className="pb-1.5 text-[12.5px] font-semibold text-foreground">{t("perm_extra")}</div>
            <div className="pb-2 text-[12px] text-muted-foreground">{t("perm_extra_hint")}</div>
            <PermMatrix value={perms} onChange={setPerms} locked={rolePerms} />
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

// AccessModal is the same two controls for somebody who already exists.
function AccessModal({ staff, roles, onClose, onSaved }: {
  staff: Staff | null; roles: ShopRole[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [roleId, setRoleId] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (staff) { setRoleId(staff.roleId ?? ""); setPerms(staff.permissions ?? []); } }, [staff]);

  const rolePerms = roles.find((r) => r.id === roleId)?.permissions ?? [];

  const save = async () => {
    if (!staff || busy) return;
    setBusy(true);
    try {
      // The role's own permissions are never sent as grants — they belong to the role, and
      // storing a copy on the person would survive the role being edited.
      await api.setStaffAccess(staff.id, roleId, perms.filter((p) => !rolePerms.includes(p)));
      toast(t("save"), { icon: "check" }); onSaved();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!staff} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader><DialogTitle>{t("staff_access")}{staff?.name ? ` · ${staff.name}` : ""}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <Field label={t("role")} hint={t("staff_role_hint")}>
            <RolePicker roles={roles} value={roleId} onChange={setRoleId} />
          </Field>
          <div>
            <div className="pb-1.5 text-[12.5px] font-semibold text-foreground">{t("perm_extra")}</div>
            <div className="pb-2 text-[12px] text-muted-foreground">{t("perm_extra_hint")}</div>
            <PermMatrix value={perms} onChange={setPerms} locked={rolePerms} />
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

// PasswordModal replaces a password. Nothing can read one back, so this is also the answer to
// "they have forgotten it" — there is nothing to recover, only something to replace.
function PasswordModal({ staff, onClose, onSaved }: { staff: Staff | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (staff) { setLogin(staff.login ?? ""); setPassword(""); } }, [staff]);

  const save = async () => {
    if (!staff || busy) return;
    if (password.length < MIN_PASSWORD) { toast(t("password_too_short"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      // An unchanged login is sent as empty, which the auth service reads as "keep it" — so a
      // password can be reset without renaming the account.
      await api.setWorkerPassword(staff.id, login.trim().toLowerCase() === (staff.login ?? "") ? "" : login.trim().toLowerCase(), password);
      toast(t("save"), { icon: "check" }); onSaved();
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 409 ? t("login_taken") : e instanceof ApiError ? e.message : t("error");
      toast(msg, { icon: "alert", tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!staff} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader><DialogTitle>{t("staff_password")}{staff?.name ? ` · ${staff.name}` : ""}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <Field label={t("login")} hint={t("login_hint")}>
            <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" className="font-mono" />
          </Field>
          <Field label={t("password_new")} hint={t("password_hint")}>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="font-mono" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditModal({ staff, onClose, onSaved }: { staff: Staff | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", phone: "" });
  const [avatar, setAvatar] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (staff) { setF({ name: staff.name, phone: staff.phone }); setAvatar(staff.avatarUrl ?? ""); } }, [staff]);

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
          {/* An invited person arrives with no role at all, which is a safe place to start and
              an obvious one to fix — the access button on their row is where. */}
          <div className="rounded-[9px] bg-secondary px-3 py-2 text-[12.5px] text-muted-foreground">{t("invite_no_access_hint")}</div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : <><Send /> {t("invite")}</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
