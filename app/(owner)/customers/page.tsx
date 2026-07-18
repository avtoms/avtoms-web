"use client";
// Customers (owner-pages.jsx CustomersPage): searchable customer directory, new-customer modal,
// detail modal with add-vehicle. Wired to api.listCustomers / createCustomer / createVehicle.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Clock, ChevronRight, Car } from "lucide-react";
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
import { Empty, Segmented } from "@/components/ui";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { LANGS, type Lang } from "@/lib/i18n";
import { PLATE_TYPES, plateTypeToProto, plateTypeFromProto, langFromProto, type PlateType } from "@/lib/enums";
import type { Customer, Vehicle } from "@/lib/types";
import { SecTitle } from "../_shared";
import { MakeModelPicker, PlateField, PhoneField } from "@/components/catalog-fields";
import { PlatePreview } from "@/components/plate";
import { VehicleHistoryModal } from "@/components/vehicle-history";
import { EditVehicleModal, VehiclePhoto } from "@/components/vehicle-edit";
import { isValidPlateFor } from "@/lib/plate";
import { isValidUzPhone, toE164 } from "@/lib/phone";

export default function CustomersPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<Customer | null>(null);

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

  // Deep link from the Cars view (?focus=<customerId>) opens that customer's detail.
  // Read from window (not useSearchParams) to avoid a Suspense boundary at prerender.
  useEffect(() => {
    const focusId = new URLSearchParams(window.location.search).get("focus");
    if (!focusId) return;
    let on = true;
    api.getCustomer(focusId).then((c) => { if (on) setSel(c); }).catch(() => {});
    return () => { on = false; };
  }, []);

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
      id: "actions",
      enableHiding: false,
      header: () => null,
      cell: () => <div className="flex justify-end"><ChevronRight className="size-4 text-muted-foreground" /></div>,
    },
  ], [t, platesByCustomer]);

  return (
    <div className="flex flex-col gap-4">
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
          columnLabels={{ customer: t("name"), vehicles: t("vehicles") }}
          pageSize={12}
          onRowClick={(c) => setSel(c)}
          toolbar={<Button onClick={() => setAdding(true)}><Plus /> {t("new_customer")}</Button>}
        />
      )}
      <AddCustomerModal open={adding} onClose={() => setAdding(false)} shopId={shopId} onCreated={() => load()} />
      <CustomerDetailModal customer={sel} onClose={() => setSel(null)} onChanged={() => { load(); loadVehicles(); }} />
    </div>
  );
}

function AddCustomerModal({ open, onClose, shopId, onCreated }: { open: boolean; onClose: () => void; shopId: string; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", phone: "", telegram: "", language: "uz" as Lang, walkIn: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ name: "", phone: "", telegram: "", language: "uz", walkIn: false }); }, [open]);

  const save = async () => {
    if (!f.phone.trim() || busy) return;
    if (!isValidUzPhone(f.phone)) { toast(t("bad_phone"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      await api.createCustomer(shopId, { phone: toE164(f.phone), name: f.name.trim(), language: f.language, telegramHandle: f.telegram.trim(), walkIn: f.walkIn });
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
          <div className="flex items-center justify-between rounded-[9px] border border-border bg-card px-3 py-2.5">
            <span className="text-[14px] font-semibold text-foreground">{t("walk_in")}</span>
            <Switch checked={f.walkIn} onCheckedChange={(v) => setF({ ...f, walkIn: v })} />
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

function CustomerDetailModal({ customer, onClose, onChanged }: { customer: Customer | null; onClose: () => void; onChanged: () => void }) {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();
  const [cust, setCust] = useState<Customer | null>(customer);
  const [addV, setAddV] = useState(false);
  const [editCust, setEditCust] = useState(false);
  const [editVeh, setEditVeh] = useState<Vehicle | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vloading, setVloading] = useState(false);
  const [histVehicle, setHistVehicle] = useState<Vehicle | null>(null);

  useEffect(() => { setCust(customer); }, [customer]);

  const loadVehicles = useCallback(async (id: string) => {
    setVloading(true);
    try { setVehicles(await api.listVehicles(id)); }
    catch { /* surfaced as empty */ }
    finally { setVloading(false); }
  }, []);

  // (Re)load when the modal is showing the detail view (also after sub-modals close).
  useEffect(() => { if (customer && !addV && !editVeh) loadVehicles(customer.id); }, [customer, addV, editVeh, loadVehicles]);

  if (!customer || !cust) return null;
  const detailOpen = !!customer && !addV && !editCust && !editVeh;
  return (
    <>
      <Dialog open={detailOpen} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader><DialogTitle>{cust.walkIn ? t("walk_in") : cust.name}</DialogTitle></DialogHeader>
          <DialogBody className="flex flex-col gap-4 pt-1 pb-5">
            <div className="flex items-center gap-3">
              <UserAvatar name={cust.walkIn ? "?" : cust.name} className="size-11" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[17px] font-extrabold tracking-[-0.02em] text-foreground">{cust.walkIn ? t("walk_in") : cust.name}</div>
                <div className="truncate font-mono text-[13px] text-muted-foreground">{cust.phone}{cust.telegramHandle ? " · " + cust.telegramHandle : ""}{cust.telegramChatId ? " · TG ✓" : ""}</div>
                {(cust.email || cust.address) && <div className="truncate text-[12px] text-muted-foreground">{[cust.email, cust.address].filter(Boolean).join(" · ")}</div>}
                {cust.notes && <div className="mt-0.5 truncate text-[12px] italic text-muted-foreground">{cust.notes}</div>}
              </div>
              <Button variant="soft" size="sm" onClick={() => setEditCust(true)}><Pencil /> {t("edit")}</Button>
            </div>
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <SecTitle>{t("vehicles")}</SecTitle>
                <Button variant="soft" size="sm" onClick={() => setAddV(true)}><Plus /> {t("add_vehicle")}</Button>
              </div>
              {vloading ? (
                <div className="flex justify-center py-5"><Spinner className="size-5" /></div>
              ) : vehicles.length === 0 ? (
                <div className="p-5"><Empty icon="car" text={t("empty")} /></div>
              ) : vehicles.map((v) => (
                <div key={v.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                  <div className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary-emphasis"><Car className="size-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-foreground">{[v.make, v.model].filter(Boolean).join(" ") || t("vehicle")}{v.year ? " · " + v.year : ""}{v.color ? " · " + v.color : ""}</div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[12.5px] text-muted-foreground">
                      <PlatePreview plate={v.plate} type={plateTypeFromProto(v.plateType)} size="sm" />
                      {Number(v.mileage) > 0 && <span>· {v.mileage} km</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={t("edit")} onClick={() => setEditVeh(v)}><Pencil /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setHistVehicle(v)}><Clock /> {t("history")}</Button>
                </div>
              ))}
            </Card>
          </DialogBody>
        </DialogContent>
      </Dialog>
      <EditCustomerModal customer={editCust ? cust : null} onClose={() => setEditCust(false)} onSaved={(updated) => { setCust(updated); setEditCust(false); onChanged(); }} />
      <EditVehicleModal vehicle={editVeh} onClose={() => setEditVeh(null)} onDone={() => { setEditVeh(null); }} />
      <AddVehicleModal open={addV} onClose={() => setAddV(false)} customerId={customer.id} onCreated={() => { toast(t("save"), { icon: "check" }); setAddV(false); }} />
      <VehicleHistoryModal vehicle={histVehicle} shopId={shopId} onClose={() => setHistVehicle(null)} />
    </>
  );
}

function EditCustomerModal({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: (c: Customer) => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", phone: "", telegram: "", language: "uz" as Lang, notes: "", email: "", address: "", birthday: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (customer) setF({
      name: customer.name, phone: customer.phone, telegram: customer.telegramHandle ?? "",
      language: langFromProto(customer.language), notes: customer.notes ?? "", email: customer.email ?? "",
      address: customer.address ?? "", birthday: customer.birthday ?? "",
    });
  }, [customer]);
  if (!customer) return null;

  const save = async () => {
    if (!f.phone.trim() || busy) return;
    if (!isValidUzPhone(f.phone)) { toast(t("bad_phone"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      const updated = await api.updateCustomer(customer.id, {
        name: f.name.trim(), phone: toE164(f.phone), language: f.language, telegramHandle: f.telegram.trim(),
        notes: f.notes.trim(), email: f.email.trim(), address: f.address.trim(), birthday: f.birthday,
      });
      toast(t("save"), { icon: "check" }); onSaved(updated);
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader><DialogTitle>{t("edit")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          <Field label={t("name")}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <PhoneField label={t("phone")} value={f.phone} onChange={(p) => setF({ ...f, phone: p })} invalidHint={t("bad_phone")} />
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t("telegram")}><Input value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} placeholder="@username" /></Field>
            <Field label={t("language")}>
              <Select value={f.language} onValueChange={(v) => setF({ ...f, language: v as Lang })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LANGS.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t("email")}><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} inputMode="email" /></Field>
            <Field label={t("birthday")}><Input type="date" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} /></Field>
          </div>
          <Field label={t("address")}><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label={t("notes")}><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function AddVehicleModal({ open, onClose, customerId, onCreated }: { open: boolean; onClose: () => void; customerId: string; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ plate: "", make: "", model: "", year: "", vin: "", mileage: "", plateType: "standard" as PlateType, image: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ plate: "", make: "", model: "", year: "", vin: "", mileage: "", plateType: "standard", image: "" }); }, [open]);

  const save = async () => {
    if (!f.plate.trim() || busy) return;
    if (!isValidPlateFor(f.plate, f.plateType)) { toast("Noto'g'ri davlat raqami", { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      await api.createVehicle({ customerId, plate: f.plate.trim(), vin: f.vin.trim(), make: f.make.trim(), model: f.model.trim(), year: parseInt(f.year, 10) || 0, mileage: parseInt(f.mileage, 10) || 0, plateType: plateTypeToProto(f.plateType), imageUrl: f.image });
      onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader><DialogTitle>{t("add_vehicle")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <VehiclePhoto url={f.image} make={f.make} onChange={(u) => setF((s) => ({ ...s, image: u }))} />
          <Field label={t("plate_type")}>
            <Segmented options={PLATE_TYPES.map((p) => ({ value: p, label: t("pt_" + p) }))} value={f.plateType} onChange={(v) => setF((s) => ({ ...s, plateType: v as PlateType }))} style={{ width: "100%" }} />
          </Field>
          <PlateField value={f.plate} onChange={(p) => setF((s) => ({ ...s, plate: p }))} label={t("plate")} type={f.plateType} />
          <div className="grid grid-cols-[1fr_1fr_90px] gap-3">
            <MakeModelPicker make={f.make} model={f.model} onChange={(mk, md) => setF((s) => ({ ...s, make: mk, model: md }))} labels={{ make: t("make"), model: t("model") }} />
            <Field label={t("year")}><Input value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className="font-mono" /></Field>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <Field label={t("vin")}><Input value={f.vin} onChange={(e) => setF({ ...f, vin: e.target.value.toUpperCase() })} className="font-mono" /></Field>
            <Field label={t("mileage")}><Input value={f.mileage} onChange={(e) => setF({ ...f, mileage: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className="font-mono" /></Field>
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
