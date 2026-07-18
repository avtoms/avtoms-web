"use client";
// Appointments / scheduling: upcoming bookings grouped by day; add, mark done, cancel.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Empty } from "@/components/ui";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { cn } from "@/lib/utils";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { apptStateFromProto, apptStateToProto } from "@/lib/enums";
import { PhoneField, PlateField } from "@/components/catalog-fields";
import { PlatePreview } from "@/components/plate";
import type { Appointment, Staff, Customer, Vehicle } from "@/lib/types";

// Radix Select forbids an empty-string item value, so "" (unset / reset) is represented by
// this sentinel in the Select only and mapped back to "" at the state boundary.
const NONE = "__none";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
const timeStr = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function SchedulePage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [list, setList] = useState<Appointment[]>([]);
  const [mechanics, setMechanics] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const from = new Date(); from.setHours(0, 0, 0, 0);
    try { setList(await api.listAppointments(shopId, from.toISOString())); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.listStaff(shopId).then((s) => setMechanics(s.filter((x) => x.role === "ROLE_MECHANIC" && x.active))).catch(() => {}); }, [shopId]);

  const mechName = (id?: string) => mechanics.find((m) => m.id === id)?.name;

  const setState = async (a: Appointment, state: "done" | "canceled") => {
    if (busy) return; setBusy(true);
    try { await api.setAppointmentState(a.id, apptStateToProto(state)); toast(t("save"), { icon: "check" }); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  const groups = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of list) { const k = dayKey(a.scheduledAt); (m.get(k) ?? m.set(k, []).get(k)!).push(a); }
    return [...m.entries()];
  }, [list]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}><Plus /> {t("add_appointment")}</Button>
      </div>
      {loading && list.length === 0 ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="an-skel h-12 w-full rounded-[8px]" />)}</Card>
      ) : list.length === 0 ? (
        <Card className="p-6"><Empty icon="clock" text={t("no_appointments")} /></Card>
      ) : (
        groups.map(([day, items]) => (
          <div key={day} className="flex flex-col gap-2">
            <div className="px-1 text-[12px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{day}</div>
            <Card className="overflow-hidden">
              {items.map((a) => {
                const st = apptStateFromProto(a.state);
                return (
                  <div key={a.id} className={cn("flex items-center gap-3.5 border-b border-border px-4 py-3 last:border-0 sm:px-5", st === "canceled" && "opacity-50")}>
                    <div className="min-w-[52px] font-mono text-[15px] font-extrabold text-foreground">{timeStr(a.scheduledAt)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-semibold text-foreground">{a.title || t("vehicle")}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                        {a.customerName && <span>{a.customerName}</span>}
                        {a.plate && <PlatePreview plate={a.plate} size="sm" />}
                        {mechName(a.mechanicId) && <span>· {mechName(a.mechanicId)}</span>}
                        {!!a.durationMinutes && <span>· {a.durationMinutes}m</span>}
                      </div>
                    </div>
                    {st === "scheduled" ? (
                      <div className="flex shrink-0 gap-1.5">
                        <Button variant="soft" size="sm" disabled={busy} onClick={() => setState(a, "done")}><Check /> {t("mark_done")}</Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setState(a, "canceled")} className="text-destructive hover:text-destructive">{t("cancel")}</Button>
                      </div>
                    ) : <Badge tone={st === "done" ? "ok" : "neutral"} dot>{st === "done" ? t("st_done") : t("cancel")}</Badge>}
                  </div>
                );
              })}
            </Card>
          </div>
        ))
      )}
      <AddModal open={adding} onClose={() => setAdding(false)} shopId={shopId} mechanics={mechanics} onCreated={load} />
    </div>
  );
}

function defaultWhen(): string {
  const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AddModal({ open, onClose, shopId, mechanics, onCreated }: { open: boolean; onClose: () => void; shopId: string; mechanics: Staff[]; onCreated: () => void }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ title: "", customerId: "", customer: "", phone: "", vehicleId: "", plate: "", when: defaultWhen(), duration: "60", mechanicId: "", notes: "" });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({ title: "", customerId: "", customer: "", phone: "", vehicleId: "", plate: "", when: defaultWhen(), duration: "60", mechanicId: "", notes: "" });
    setVehicles([]);
    api.listCustomers(shopId).then((c) => setCustomers(c.filter((x) => !x.walkIn))).catch(() => {});
  }, [open, shopId]);

  // Pick an existing client → carry their name + phone and load their cars to pick a plate.
  // Leaving the picker empty and typing the name/phone manually still creates a fresh walk-in.
  const pickCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id);
    setF((s) => ({ ...s, customerId: id, customer: c?.name ?? "", phone: c?.phone ?? "", vehicleId: "", plate: "" }));
    if (id) api.listVehicles(id).then(setVehicles).catch(() => setVehicles([]));
    else setVehicles([]);
  };
  const pickVehicle = (vid: string) => {
    const v = vehicles.find((x) => x.id === vid);
    setF((s) => ({ ...s, vehicleId: vid, plate: v?.plate ?? "" }));
  };

  const save = async () => {
    if (!f.title.trim() || !f.when || busy) return;
    setBusy(true);
    const name = f.customer.trim();
    const phone = f.phone.trim();
    try {
      // A booking for a NEW person (not picked from existing) also registers them in the
      // clients list — so a scheduled visit means the client exists, just reserved for that
      // time. Reuse an existing client when the phone already matches; never block the
      // booking if client creation fails.
      if (!f.customerId && name) {
        const digits = (s: string) => s.replace(/\D/g, "");
        const dupe = phone ? customers.find((c) => c.phone && digits(c.phone) === digits(phone)) : undefined;
        if (!dupe) {
          try { await api.createCustomer(shopId, { name, phone, language: lang }); }
          catch { /* non-fatal — still create the appointment */ }
        }
      }
      await api.createAppointment(shopId, {
        title: f.title.trim(), customerName: name, phone, plate: f.plate.trim(),
        mechanicId: f.mechanicId || undefined, scheduledAt: new Date(f.when).toISOString(),
        durationMinutes: parseInt(f.duration, 10) || 0, notes: f.notes.trim(),
      });
      toast(t("save"), { icon: "check" }); onClose(); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader><DialogTitle>{t("add_appointment")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          <Field label={t("description")}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("service")} /></Field>
          <div className="grid grid-cols-[1fr_90px] gap-2.5">
            <Field label={t("appt_when")}><Input type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} /></Field>
            <Field label={t("duration_min")}><Input value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className="font-mono" /></Field>
          </div>
          <Field label={t("nav_customers")}>
            <Select value={f.customerId || NONE} onValueChange={(v) => pickCustomer(v === NONE ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("appt_new_client")}</SelectItem>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? " · " + c.phone : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {f.customerId && vehicles.length > 0 && (
            <Field label={t("vehicle")}>
              <Select value={f.vehicleId || NONE} onValueChange={(v) => pickVehicle(v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{[v.make, v.model].filter(Boolean).join(" ")} · {v.plate}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t("name")}><Input value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} /></Field>
            <PhoneField label={t("phone")} value={f.phone} onChange={(p) => setF({ ...f, phone: p })} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <PlateField label={t("plate")} value={f.plate} onChange={(p) => setF({ ...f, plate: p })} />
            <Field label={t("mechanic")}>
              <Select value={f.mechanicId || NONE} onValueChange={(v) => setF({ ...f, mechanicId: v === NONE ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {mechanics.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
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
