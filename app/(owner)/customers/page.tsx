"use client";
// Customers (owner-pages.jsx CustomersPage): searchable customer directory, new-customer modal,
// detail modal with add-vehicle. Wired to api.listCustomers / createCustomer / createVehicle.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, ChevronRight } from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { UserAvatar } from "@/components/ui-kit/avatar";
import { Field } from "@/components/ui-kit/label";
import { Spinner, Skeleton, Switch } from "@/components/ui-kit/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { PageHeader } from "@/components/page-header";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { LANGS, type Lang } from "@/lib/i18n";
import { plateTypeFromProto } from "@/lib/enums";
import type { Customer, CustomerBalance, Vehicle } from "@/lib/types";
import { money, num } from "@/lib/format";
import { CustomerAccount, DebtLine } from "./_debt";
import { PhoneField } from "@/components/catalog-fields";
import { PlatePreview } from "@/components/plate";
import { isValidUzPhone, toE164 } from "@/lib/phone";
import { ReminderRows, saveReminders, type ReminderDraft } from "@/components/reminder-rows";

export default function CustomersPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listCustomers(shopId)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);

  // Plates per customer for the little plate chips in the list — one shop-wide vehicle fetch.
  const [platesByCustomer, setPlatesByCustomer] = useState<Record<string, Vehicle[]>>({});
  const loadVehicles = useCallback(() => {
    api.listShopVehicles(shopId).then((vs) => {
      const map: Record<string, Vehicle[]> = {};
      for (const v of vs) (map[v.customerId] ||= []).push(v);
      setPlatesByCustomer(map);
    }).catch(() => {});
  }, [shopId]);
  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  // Who owes what. Owner-only on the server, so a mechanic simply sees the directory without
  // a debt column rather than an error — and the sheet is only reachable from that column.
  const [debts, setDebts] = useState<Record<string, CustomerBalance>>({});
  const [totalDebt, setTotalDebt] = useState(0);
  const [account, setAccount] = useState<Customer | null>(null);
  const loadDebts = useCallback(async () => {
    try {
      const r = await api.customerBalances();
      const m: Record<string, CustomerBalance> = {};
      for (const b of r.balances ?? []) m[b.customerId] = b;
      setDebts(m);
      setTotalDebt(num(r.totalReceivable));
    } catch { /* the directory is still useful without it */ }
  }, []);
  useEffect(() => { void loadDebts(); }, [loadDebts]);

  // A client has their own page now. Older links (?focus=<customerId>, from the Cars view and
  // the header search) still land there. Read from window (not useSearchParams) to avoid a
  // Suspense boundary at prerender.
  useEffect(() => {
    const focusId = new URLSearchParams(window.location.search).get("focus");
    if (focusId) router.replace(`/customers/${focusId}`);
  }, [router]);

  const columns = useMemo<ColumnDef<Customer>[]>(() => [
    {
      id: "customer",
      accessorFn: (c) => `${c.walkIn ? t("walk_in") : c.name} ${c.phone} ${c.telegramHandle ?? ""}`,
      header: ({ column }) => <SortHeader column={column}>{t("name")}</SortHeader>,
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center gap-3">
            <UserAvatar name={c.walkIn ? "?" : c.name} className="size-10" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 truncate text-[14px] font-bold text-foreground">
                {c.walkIn ? t("walk_in") : c.name}
                {c.walkIn && <Badge tone="neutral">{t("walk_in")}</Badge>}
              </div>
              <div className="truncate font-mono text-[12.5px] text-muted-foreground">
                {c.phone}{c.telegramHandle ? " · " + c.telegramHandle : ""}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: "vehicles",
      enableSorting: false,
      accessorFn: (c) => (platesByCustomer[c.id] ?? []).map((v) => v.plate).join(" "),
      header: () => <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground">{t("vehicles")}</span>,
      cell: ({ row }) => {
        const vs = platesByCustomer[row.original.id];
        if (!vs?.length) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {vs.slice(0, 4).map((v) => (
              <PlatePreview key={v.id} plate={v.plate} type={plateTypeFromProto(v.plateType)} size="sm" />
            ))}
            {vs.length > 4 && <span className="text-[11.5px] text-muted-foreground">+{vs.length - 4}</span>}
          </div>
        );
      },
    },
    {
      id: "debt",
      accessorFn: (c) => num(debts[c.id]?.balance),
      header: ({ column }) => <SortHeader column={column}>{t("cl_debt")}</SortHeader>,
      cell: ({ row }) => {
        const b = debts[row.original.id];
        if (!b || num(b.balance) === 0) return <span className="text-[13px] text-muted-foreground">—</span>;
        // Clicking the money opens the debt book rather than the customer card: someone who
        // taps a debt figure wants to settle it, not read a phone number.
        return (
          <button onClick={(e) => { e.stopPropagation(); setAccount(row.original); }} className="text-left hover:underline">
            <DebtLine balance={num(b.balance)} />
          </button>
        );
      },
    },
    {
      id: "actions",
      enableHiding: false,
      header: () => null,
      cell: () => <div className="flex justify-end"><ChevronRight className="size-4 text-muted-foreground" /></div>,
    },
  ], [t, platesByCustomer, debts]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        meta={list.length > 0 ? <span>{list.length} {t("nav_customers").toLowerCase()}</span> : undefined}
        actions={<Button onClick={() => setAdding(true)}><Plus /> {t("new_customer")}</Button>}
      />
      {totalDebt > 0 && (
        <Card className="flex-row items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <span className="text-[12px] font-semibold text-muted-foreground">{t("cl_debts")}</span>
            <p className="text-[11.5px] text-muted-foreground">{t("cg_all_time")}</p>
          </div>
          <span className="font-mono text-[20px] font-extrabold tracking-[-0.02em] text-destructive">{money(totalDebt)}</span>
        </Card>
      )}
      {loading && list.length === 0 ? (
        <Card className="gap-3 p-5">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={list}
          searchPlaceholder={t("search") + "…"}
          emptyText={t("empty")}
          columnLabels={{ customer: t("name"), vehicles: t("vehicles"), debt: t("cl_debt") }}
          pageSize={12}
          onRowClick={(c) => router.push(`/customers/${c.id}`)}
        />
      )}
      <AddCustomerModal open={adding} onClose={() => setAdding(false)} shopId={shopId} onCreated={() => { load(); loadVehicles(); }} />
      <CustomerAccount customer={account} onClose={() => setAccount(null)} onChanged={loadDebts} />
    </div>
  );
}

function AddCustomerModal({ open, onClose, shopId, onCreated }: { open: boolean; onClose: () => void; shopId: string; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", phone: "", telegram: "", language: "uz" as Lang, walkIn: false });
  const [reminders, setReminders] = useState<ReminderDraft[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF({ name: "", phone: "", telegram: "", language: "uz", walkIn: false }); setReminders([]); } }, [open]);

  const save = async () => {
    if (!f.phone.trim() || busy) return;
    if (!isValidUzPhone(f.phone)) { toast(t("bad_phone"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      const cust = await api.createCustomer(shopId, { phone: toE164(f.phone), name: f.name.trim(), language: f.language, telegramHandle: f.telegram.trim(), walkIn: f.walkIn });
      // Set up the requested recurring service reminders for the new client (best-effort: the
      // client is already saved, so a reminder hiccup only warns rather than failing the create).
      try { await saveReminders(shopId, reminders, { customerName: cust.name, phone: cust.phone }); }
      catch { toast(t("error"), { icon: "alert", tone: "danger" }); }
      toast(t("save"), { icon: "check" }); onClose(); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader><DialogTitle>{t("new_customer")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <Field label={t("name")}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <PhoneField label={t("phone")} value={f.phone} onChange={(p) => setF({ ...f, phone: p })} invalidHint={t("bad_phone")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("telegram")}><Input value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} placeholder="@username" /></Field>
            <Field label={t("language")}>
              <Select value={f.language} onValueChange={(v) => setF({ ...f, language: v as Lang })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LANGS.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[9px] border border-border bg-card px-3 py-2.5">
            <div className="min-w-0">
              <span className="text-[14px] font-semibold text-foreground">{t("walk_in")}</span>
              <p className="text-[11.5px] text-muted-foreground">{t("walk_in_hint")}</p>
            </div>
            <Switch checked={f.walkIn} onCheckedChange={(v) => setF({ ...f, walkIn: v })} />
          </div>
          <div className="border-t border-border pt-3">
            <ReminderRows value={reminders} onChange={setReminders} />
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
