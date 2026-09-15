"use client";
// Staff and the roles they hold, after the redesign. Two tabs, because they are two halves of
// one question: a role says what a job is, and the staff list says who does it.
//
// The staff table says who each person is and how they get in, the job they hold, whether they
// are on a job right now, and what they did this month (orders, takings, hours). Roles are
// cards with what each one allows; the three jobs nearly every shop has — mechanic, cashier,
// manager — are offered as ready-made templates until the shop has made them.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, Send, KeyRound, ShieldCheck, Check, Minus } from "lucide-react";
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
import { PageHeader } from "@/components/page-header";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError, optional } from "@/lib/api";
import { roleFromProto, woStateFromProto } from "@/lib/enums";
import { PermMatrix } from "@/components/perm-matrix";
import { ALL_PERMS, can, permLabel, type Permission } from "@/lib/perms";
import { PhoneField } from "@/components/catalog-fields";
import { isValidUzPhone, toE164 } from "@/lib/phone";
import { compactMln, num } from "@/lib/format";
import { currentMonth, monthRange } from "@/lib/range";
import { cn } from "@/lib/utils";
import type { Staff, ShopRole, MechanicStat } from "@/lib/types";
import { staffColor } from "../_shared";

// The shortest password worth calling one. Mirrors the auth service, which refuses anything
// shorter — checked here too so the answer arrives before the round trip.
const MIN_PASSWORD = 6;

// Permissions that move money or change who can do what. Marked on every role card, because
// ticking one of these is a different kind of decision from letting somebody see the board.
const DANGEROUS: Permission[] = ["finance.manage", "staff.manage", "settings.manage"];

// The three jobs nearly every shop has, as starting points. A template is only a prefilled
// role form — the shop names and adjusts it before anything is saved.
const TEMPLATES: { nameKey: string; hintKey: string; perms: Permission[] }[] = [
  { nameKey: "tpl_mechanic", hintKey: "tpl_mechanic_hint", perms: ["orders.view", "orders.edit"] },
  { nameKey: "tpl_cashier", hintKey: "tpl_cashier_hint", perms: ["orders.view", "sales.view", "sales.manage", "finance.manage", "customers.manage"] },
  {
    nameKey: "tpl_manager", hintKey: "tpl_manager_hint",
    perms: ["orders.view", "orders.create", "orders.edit", "orders.assign", "customers.manage", "warehouse.view", "warehouse.manage", "catalog.manage", "sales.view", "sales.manage", "finance.view"],
  },
];

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
  // This month per person, and who has a job running right now — both best-effort.
  const [month, setMonth] = useState<Record<string, MechanicStat>>({});
  const [working, setWorking] = useState<Set<string>>(new Set());

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
    const r = monthRange(currentMonth());
    if (can(session, "finance.view")) {
      api.getStatistics(shopId, r.from, r.to).then((st) => {
        const m: Record<string, MechanicStat> = {};
        for (const x of st.mechanics ?? []) m[x.mechanicId] = x;
        setMonth(m);
      }).catch(() => {});
    }
    if (can(session, "orders.view")) {
      api.listWorkOrders(shopId).then((wos) => setWorking(new Set(
        wos.filter((w) => woStateFromProto(w.state) === "in_progress" && w.activeTimerStartedAt && w.assignedMechanicId).map((w) => w.assignedMechanicId!),
      ))).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const topRevenue = Math.max(1, ...Object.values(month).map((m) => num(m.revenue)));

  const columns = useMemo<ColumnDef<Staff>[]>(() => [
    {
      id: "name",
      accessorFn: (s) => `${s.name || ""} ${s.phone || ""} ${s.login || ""}`,
      header: ({ column }) => <SortHeader column={column}>{t("name")}</SortHeader>,
      cell: ({ row }) => {
        const s = row.original;
        const initials = (s.name || "?").split(" ").map((x) => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
        return (
          <div className="flex items-center gap-3">
            {s.avatarUrl
              ? <UserAvatar name={s.name || "?"} src={s.avatarUrl} className="size-9" />
              : <span className="grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: roleFromProto(s.role) === "owner" ? "var(--accent)" : staffColor(s.id) }}>{initials}</span>}
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
              ? <Badge tone="warn">{s.roleName}</Badge>
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
      accessorFn: (s) => (!s.active ? "inactive" : working.has(s.id) ? "working" : "active"),
      header: ({ column }) => <SortHeader column={column}>{t("status")}</SortHeader>,
      cell: ({ row }) => {
        const s = row.original;
        if (!s.active) return <Badge tone="danger" dot>{t("inactive")}</Badge>;
        return working.has(s.id) ? <Badge tone="ok" dot>{t("staff_working")}</Badge> : <Badge tone="info" dot>{t("active")}</Badge>;
      },
    },
    {
      id: "month",
      accessorFn: (s) => num(month[s.id]?.revenue),
      header: ({ column }) => <SortHeader column={column}>{t("staff_this_month")}</SortHeader>,
      cell: ({ row }) => {
        const m = month[row.original.id];
        if (!m || (!m.jobs && !num(m.revenue))) return <span className="text-[13px] text-muted-foreground">—</span>;
        return (
          <div className="flex w-[220px] flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
              <span className="text-foreground">{m.jobs ?? 0} {t("orders").toLowerCase()} · {compactMln(num(m.revenue), t("mln"))}</span>
              {!!m.hours && <span className="font-mono text-muted-foreground">{Math.round(m.hours)} {t("hours_short")}</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full" style={{ width: `${Math.max(4, (num(m.revenue) / topRevenue) * 100)}%`, background: staffColor(row.original.id) }} />
            </div>
          </div>
        );
      },
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
              <Button variant="ghost" size="icon-sm" onClick={() => setAccess(s)} aria-label={t("staff_access")} title={t("staff_access")}><ShieldCheck /></Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => setPassword(s)} aria-label={t("staff_password")} title={t("staff_password")}><KeyRound /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing(s)} aria-label={t("edit")} title={t("edit")}><Pencil /></Button>
            {!isOwner && s.active && (
              <Button variant="ghost" size="icon-sm" onClick={() => deactivate(s)} aria-label={t("deactivate")} title={t("deactivate")} className="text-destructive hover:bg-destructive-soft"><Trash2 /></Button>
            )}
          </div>
        );
      },
    },
  ], [t, deactivate, working, month, topRevenue]);

  const tabs = (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "people" | "roles")}>
      <TabsList>
        <TabsTrigger value="people">{t("nav_staff")} · {list.length}</TabsTrigger>
        <TabsTrigger value="roles">{t("roles")} · {roles.length}</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* On a phone the tabs take a row under the header; beside the title they ran under
          the header's own buttons. (The header is portalled, so this still lands below it.) */}
      <div className="min-[860px]:hidden">{tabs}</div>
      <PageHeader
        title={
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="shrink-0 text-[19px] font-bold tracking-[-0.025em] text-foreground touch:text-[16px]">{t("nav_staff")}</h1>
            <div className="max-[859px]:hidden">{tabs}</div>
          </div>
        }
        actions={
          tab === "people" ? (
            <>
              {/* The SMS invite still exists: some shops would rather the person set their
                  own way in than be handed a password over the counter. */}
              <Button variant="secondary" onClick={() => setInviting(true)}><Send /> {t("staff_invite_sms")}</Button>
              <Button onClick={() => setCreating(true)}><Plus /> {t("staff_add")}</Button>
            </>
          ) : <Button onClick={() => setRole({ name: "", permissions: [] })}><Plus /> {t("role_add")}</Button>
        }
      />

      {tab === "people" ? (
        loading && list.length === 0 ? (
          <Card className="gap-2.5 p-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="an-skel h-12 w-full rounded-[8px]" />)}</Card>
        ) : (
          <DataTable
            columns={columns}
            data={list}
            searchPlaceholder={t("search") + "…"}
            emptyText={t("empty")}
            columnLabels={{ name: t("name"), role: t("role"), status: t("status"), month: t("staff_this_month") }}
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

// A role as a card: its name and how many people hold it, then what it allows and what it
// does not — the dangerous permissions always shown, ticked or not, so their absence is read.
function RoleList({ roles, loading, onOpen, onRemove, t }: {
  roles: ShopRole[]; loading: boolean; onOpen: (r: Partial<ShopRole>) => void; onRemove: (r: ShopRole) => void; t: (k: string) => string;
}) {
  if (loading && roles.length === 0) {
    return <Card className="gap-2.5 p-5">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="an-skel h-12 w-full rounded-[8px]" />)}</Card>;
  }
  const names = new Set(roles.map((r) => r.name.trim().toLowerCase()));
  const templates = TEMPLATES.filter((tp) => !names.has(t(tp.nameKey).toLowerCase()));
  return (
    <div className="flex flex-col gap-3">
      {roles.length === 0 && (
        <div className="px-1">
          <div className="text-[14.5px] font-bold text-foreground">{t("roles_empty")}</div>
          <div className="max-w-[520px] text-[13px] text-muted-foreground">{t("roles_empty_hint")}</div>
        </div>
      )}
      <div className="text-[15px] font-bold tracking-[-0.02em] text-foreground">{t("tpl_title")}</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {roles.map((r) => {
          const perms = r.permissions ?? [];
          const shown = [...perms.filter((p) => !DANGEROUS.includes(p as Permission)).slice(0, 4), ...DANGEROUS];
          return (
            <Card key={r.id} className="gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[15px] font-bold text-foreground">{r.name}</span>
                <Badge tone={r.members ? "info" : "neutral"}>{r.members ?? 0} {t("people")}</Badge>
              </div>
              <div className="flex flex-col gap-1.5">
                {perms.length === 0 && <span className="text-[12.5px] text-muted-foreground">{t("role_no_perms")}</span>}
                {shown.map((p) => {
                  const on = perms.includes(p);
                  const danger = DANGEROUS.includes(p as Permission);
                  return (
                    <div key={p} className={cn("flex items-center gap-2 text-[13px]", on ? "text-foreground" : "text-muted-foreground")}>
                      {on ? <Check className={cn("size-3.5 shrink-0", danger ? "text-destructive" : "text-success")} /> : <Minus className="size-3.5 shrink-0" />}
                      <span className="truncate">{t(permLabel(p))}</span>
                      {danger && <span className="ml-auto shrink-0 rounded-full bg-destructive-soft px-1.5 text-[10.5px] font-semibold text-destructive">{t("perm_danger")}</span>}
                    </div>
                  );
                })}
                {perms.filter((p) => !DANGEROUS.includes(p as Permission)).length > 4 && (
                  <span className="text-[12px] text-muted-foreground">+{perms.filter((p) => !DANGEROUS.includes(p as Permission)).length - 4}</span>
                )}
              </div>
              <div className="mt-auto flex items-center gap-1 border-t border-border pt-2">
                <Button variant="ghost" size="sm" onClick={() => onOpen(r)}><Pencil /> {t("edit")}</Button>
                <Button variant="ghost" size="icon-sm" onClick={() => onRemove(r)} aria-label={t("delete")} className="ml-auto text-destructive hover:bg-destructive-soft"><Trash2 /></Button>
              </div>
            </Card>
          );
        })}
        {templates.map((tp) => (
          <Card key={tp.nameKey} className="gap-2.5 border-dashed p-4 shadow-none">
            <span className="text-[15px] font-bold text-foreground">{t(tp.nameKey)}</span>
            <p className="text-[12.5px] leading-snug text-muted-foreground">{t(tp.hintKey)}</p>
            <div className="flex flex-wrap gap-1">
              {tp.perms.slice(0, 5).map((p) => <span key={p} className="rounded-full bg-secondary px-2 py-[1px] text-[11.5px] text-ink-2">{t(permLabel(p))}</span>)}
              {tp.perms.length > 5 && <span className="text-[11.5px] text-muted-foreground">+{tp.perms.length - 5}</span>}
            </div>
            <Button variant="soft" size="sm" className="mt-auto self-start" onClick={() => onOpen({ name: t(tp.nameKey), permissions: tp.perms })}><Plus /> {t("tpl_create")}</Button>
          </Card>
        ))}
        <Card className="gap-2.5 border-dashed p-4 shadow-none">
          <span className="text-[15px] font-bold text-foreground">{t("custom_role")}</span>
          <p className="text-[12.5px] leading-snug text-muted-foreground">{t("custom_role_hint")} ({ALL_PERMS.length})</p>
          <Button variant="soft" size="sm" className="mt-auto self-start" onClick={() => onOpen({ name: "", permissions: [] })}><Plus /> {t("role_add")}</Button>
        </Card>
      </div>
    </div>
  );
}

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
