"use client";
// Create-work-order flow. Search vehicles by plate via the live backend; pick one to create
// the WO. If no vehicle matches, create a customer + vehicle inline, then the WO.
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Car } from "lucide-react";
import { Empty } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Button } from "@/components/ui-kit/button";
import { Spinner, Separator } from "@/components/ui-kit/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { LANGS, type Lang } from "@/lib/i18n";
import type { Vehicle } from "@/lib/types";
import { MakeModelPicker, PlateField, PhoneField } from "@/components/catalog-fields";
import { PlatePreview } from "@/components/plate";
import { isValidPlateFor } from "@/lib/plate";
import { orderLabel } from "@/lib/format";
import { PLATE_TYPES, plateTypeToProto, plateTypeFromProto, type PlateType } from "@/lib/enums";
import { isValidUzPhone, toE164 } from "@/lib/phone";
import { ReminderRows, saveReminders, type ReminderDraft } from "@/components/reminder-rows";

export function CreateWOModal({ open, onClose, basePath = "/work-orders" }: { open: boolean; onClose: () => void; basePath?: string }) {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();
  const router = useRouter();

  const [mode, setMode] = useState<"search" | "new">("search");
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Vehicle[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  const [cf, setCf] = useState({ name: "", phone: "", telegram: "", language: "uz" as Lang });
  const [vf, setVf] = useState({ plate: "", make: "", model: "", year: "", vin: "", mileage: "", plateType: "standard" as PlateType });
  const [reminders, setReminders] = useState<ReminderDraft[]>([]);
  // The reading on the dash when the car came in. Optional — a shop that does not take it
  // gets a gap in the book rather than a made-up number — but asked for here, because the
  // car is standing in front of whoever is typing and never will be again.
  const [odo, setOdo] = useState("");

  React.useEffect(() => {
    if (open) { setMode("search"); setQ(""); setMatches([]); setCf({ name: "", phone: "", telegram: "", language: "uz" }); setVf({ plate: "", make: "", model: "", year: "", vin: "", mileage: "", plateType: "standard" as PlateType }); setReminders([]); setOdo(""); }
  }, [open]);

  React.useEffect(() => {
    if (mode !== "search") return;
    const plate = q.trim();
    if (!plate) { setMatches([]); return; }
    setSearching(true);
    const h = setTimeout(async () => {
      try { setMatches(await api.searchVehicles(shopId, plate)); }
      catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(h);
  }, [q, mode, shopId, t, toast]);

  const createFor = async (vehicleId: string, odometer = 0) => {
    if (busy) return;
    setBusy(true);
    try {
      // No odometer here: for a car the shop already knows, the reading is recorded on the
      // order itself, where the car is identified and somebody can actually see the dash.
      // Asking for it in the plate search meant asking before the car had been chosen.
      const wo = await api.createWorkOrder(shopId, vehicleId, odometer);
      toast(t("create_wo") + " · " + orderLabel(wo), { icon: "clipboard" });
      onClose();
      router.push(`${basePath}/${wo.id}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      setBusy(false);
    }
  };

  const createNew = async () => {
    if (busy) return;
    if (!cf.phone.trim() || !vf.plate.trim()) { toast(t("error"), { icon: "alert", tone: "danger" }); return; }
    if (!isValidUzPhone(cf.phone)) { toast(t("bad_phone"), { icon: "alert", tone: "danger" }); return; }
    if (!isValidPlateFor(vf.plate, vf.plateType)) { toast("Noto'g'ri davlat raqami", { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      const cust = await api.createCustomer(shopId, { phone: toE164(cf.phone), name: cf.name.trim(), language: cf.language, telegramHandle: cf.telegram.trim(), walkIn: false });
      const veh = await api.createVehicle({ customerId: cust.id, plate: vf.plate.trim(), vin: vf.vin.trim(), make: vf.make.trim(), model: vf.model.trim(), year: parseInt(vf.year, 10) || 0, mileage: parseInt(odo, 10) || 0, plateType: plateTypeToProto(vf.plateType) });
      // Attach the requested recurring service reminders to the new client + vehicle (best-effort;
      // never blocks opening the work order).
      try { await saveReminders(shopId, reminders, { customerName: cust.name, phone: cust.phone, vehicleId: veh.id, plate: veh.plate }); } catch { /* non-fatal */ }
      await createFor(veh.id, parseInt(odo, 10) || 0);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader><DialogTitle>{t("new_wo")}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "search" | "new")} className="mb-4">
            <TabsList className="w-full">
              <TabsTrigger value="search" className="flex-1">{t("search_plate")}</TabsTrigger>
              <TabsTrigger value="new" className="flex-1">{t("new_customer")}</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "search" ? (
            <div className="flex flex-col gap-3.5">
              <Field label={t("search_plate")}>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input autoFocus value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} placeholder="01 A 777 AB" className="pl-9 font-mono" />
                </div>
              </Field>
              <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto">
                {searching && <div className="flex justify-center py-4"><Spinner /></div>}
                {!searching && q.trim() && matches.length === 0 && <Empty icon="car" text={t("empty")} />}
                {matches.map((v) => (
                  <button key={v.id} disabled={busy} onClick={() => createFor(v.id)} className="flex items-center gap-3 rounded-[10px] border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-secondary">
                    <div className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-secondary text-ink-2"><Car className="size-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-bold text-foreground">{[v.make, v.model].filter(Boolean).join(" ") || t("vehicle")} {v.year ? <span className="font-medium text-muted-foreground">· {v.year}</span> : null}</div>
                      <div className="font-mono text-[12.5px] text-muted-foreground">{v.vin || ""}</div>
                    </div>
                    <PlatePreview plate={v.plate} type={plateTypeFromProto(v.plateType)} size="sm" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <Field label={t("name")}><Input value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <PhoneField label={t("phone")} value={cf.phone} onChange={(p) => setCf({ ...cf, phone: p })} invalidHint={t("bad_phone")} />
                <Field label={t("language")}>
                  <Select value={cf.language} onValueChange={(v) => setCf({ ...cf, language: v as Lang })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGS.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <Separator />
              <Field label={t("plate_type")}>
                <Tabs value={vf.plateType} onValueChange={(v) => setVf((s) => ({ ...s, plateType: v as PlateType }))}>
                  <TabsList className="w-full flex-wrap">
                    {PLATE_TYPES.map((p) => <TabsTrigger key={p} value={p} className="flex-1">{t("pt_" + p)}</TabsTrigger>)}
                  </TabsList>
                </Tabs>
              </Field>
              <PlateField value={vf.plate} onChange={(p) => setVf((s) => ({ ...s, plate: p }))} label={t("plate")} type={vf.plateType} />
              <div className="grid grid-cols-2 gap-3">
                <MakeModelPicker make={vf.make} model={vf.model} onChange={(mk, md) => setVf((s) => ({ ...s, make: mk, model: md }))} labels={{ make: t("make"), model: t("model") }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("year")}><Input value={vf.year} onChange={(e) => setVf({ ...vf, year: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className="font-mono" /></Field>
                {/* For a car the shop is seeing for the first time this one reading is both
                    its current mileage and the first line of its service book. */}
                <Field label={t("odometer")}><Input value={odo} onChange={(e) => setOdo(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="font-mono" placeholder="82000" /></Field>
              </div>
              <Separator />
              <ReminderRows value={reminders} onChange={setReminders} />
            </div>
          )}
        </DialogBody>
        {mode === "new" && (
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
            <Button onClick={createNew} disabled={busy}><Plus /> {busy ? <Spinner /> : t("create_wo")}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
