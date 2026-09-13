"use client";
// The client dialogs shared by the client list and a client's own page: editing the client,
// adding a car, and adding a service reminder for one of their cars.
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Field } from "@/components/ui-kit/label";
import { Spinner } from "@/components/ui-kit/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { Segmented } from "@/components/ui";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { LANGS, type Lang } from "@/lib/i18n";
import { PLATE_TYPES, plateTypeToProto, langFromProto, type PlateType } from "@/lib/enums";
import type { Customer, Vehicle } from "@/lib/types";
import { MakeModelPicker, PlateField, PhoneField } from "@/components/catalog-fields";
import { VehiclePhoto } from "@/components/vehicle-edit";
import { isValidPlateFor } from "@/lib/plate";
import { isValidUzPhone, toE164 } from "@/lib/phone";
import { ReminderRows, saveReminders, emptyReminder, type ReminderDraft } from "@/components/reminder-rows";

// Quick "add service reminder" for an existing client, prefilled with a specific vehicle.
export function AddReminderModal({ open, onClose, shopId, customerName, phone, vehicle }: { open: boolean; onClose: () => void; shopId: string; customerName: string; phone: string; vehicle: Vehicle | null }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [reminders, setReminders] = useState<ReminderDraft[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setReminders([emptyReminder()]); }, [open]);

  const save = async () => {
    if (busy) return;
    if (!reminders.some((r) => r.title.trim())) { onClose(); return; }
    setBusy(true);
    try {
      await saveReminders(shopId, reminders, { customerName, phone, vehicleId: vehicle?.id, plate: vehicle?.plate });
      toast(t("save"), { icon: "check" }); onClose();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("add_reminder")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          <div className="rounded-[9px] border border-border bg-secondary/40 px-3 py-2 text-[12.5px] text-muted-foreground">
            {customerName || t("walk_in")}
            {vehicle ? ` · ${[vehicle.make, vehicle.model].filter(Boolean).join(" ")} · ${vehicle.plate}` : ""}
          </div>
          <ReminderRows value={reminders} onChange={setReminders} />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditCustomerModal({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: (c: Customer) => void }) {
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


export function AddVehicleModal({ open, onClose, customerId, onCreated }: { open: boolean; onClose: () => void; customerId: string; onCreated: () => void }) {
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
