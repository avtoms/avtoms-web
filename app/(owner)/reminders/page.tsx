"use client";
// Service reminders: upcoming maintenance due per vehicle (oil change, inspection, ...).
// Grouped into overdue / upcoming / no-date; add, mark done, dismiss.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, History, Plus, Send } from "lucide-react";
import { Empty } from "@/components/ui";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Separator, Spinner } from "@/components/ui-kit/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { SuggestInput } from "@/components/suggest-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { cn } from "@/lib/utils";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { reminderStateFromProto, reminderStateToProto } from "@/lib/enums";
import { useServiceNames } from "@/lib/use-services";
import { PlatePreview } from "@/components/plate";
import type { ServiceReminder, Customer, Vehicle } from "@/lib/types";

const dateStr = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "");
const isRecurring = (m: ServiceReminder) => !!(m.repeatMonths || m.repeatKm);

export default function RemindersPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [list, setList] = useState<ServiceReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listReminders(shopId)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);

  // Anything already written on a past reminder, which is offered after the price list — a
  // reminder can be for something this shop does not bill for, and once written it should not
  // have to be typed again.
  const titles = useMemo(() => list.map((m) => m.title).filter(Boolean), [list]);

  const setState = async (m: ServiceReminder, state: "done" | "dismissed") => {
    if (busy) return; setBusy(true);
    try { await api.setReminderState(m.id, reminderStateToProto(state)); toast(t("save"), { icon: "check" }); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  // Pending reminders are actionable (overdue / upcoming / undated); completed ones (done or
  // dismissed) are kept as history so nothing silently vanishes after it's handled.
  const { overdue, upcoming, undated, done } = useMemo(() => {
    const now = Date.now();
    const pending = list.filter((m) => reminderStateFromProto(m.state) === "pending");
    return {
      overdue: pending.filter((m) => m.dueDate && new Date(m.dueDate).getTime() < now),
      upcoming: pending.filter((m) => m.dueDate && new Date(m.dueDate).getTime() >= now),
      undated: pending.filter((m) => !m.dueDate),
      done: list.filter((m) => reminderStateFromProto(m.state) !== "pending"),
    };
  }, [list]);

  const section = (key: string, items: ServiceReminder[], tone: "danger" | "accent" | "neutral", completed = false) =>
    items.length === 0 ? null : (
      <div className="flex flex-col gap-2">
        <div className={cn("px-1 text-[12px] font-bold uppercase tracking-[0.05em]", tone === "danger" ? "text-destructive" : "text-muted-foreground")}>{t(key)} · {items.length}</div>
        <Card className="overflow-hidden">
          {items.map((m) => {
            const st = reminderStateFromProto(m.state);
            return (
            <div key={m.id} className={cn("flex items-center gap-3.5 border-b border-border px-4 py-3 last:border-0 sm:px-5", completed && "opacity-60")}>
              <div className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", completed ? "bg-secondary text-muted-foreground" : "bg-primary-soft text-primary-emphasis")}>
                {completed ? <Check className="size-[18px]" /> : <Bell className="size-[18px]" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn("text-[14.5px] font-semibold text-foreground", completed && "line-through")}>{m.title}</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                  {m.dueDate ? <span>{dateStr(m.dueDate)}</span> : <span>{t("no_due_date")}</span>}
                  {!!m.dueMileage && <span className="font-mono">· {m.dueMileage.toLocaleString()} km</span>}
                  {isRecurring(m) && (
                    <span className="inline-flex items-center gap-1 font-semibold text-primary-emphasis">
                      <History className="size-3" /> {t("rem_every")} {[m.repeatMonths ? `${m.repeatMonths} ${t("rem_months_n")}` : "", m.repeatKm ? `${m.repeatKm.toLocaleString()} km` : ""].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {m.customerName && <span>· {m.customerName}</span>}
                  {m.plate && <PlatePreview plate={m.plate} size="sm" />}
                </div>
              </div>
              {completed ? (
                <Badge tone={st === "done" ? "ok" : "neutral"} dot>{st === "done" ? t("st_done") : t("st_dismissed")}</Badge>
              ) : (
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="soft" size="sm" disabled={busy} onClick={() => setState(m, "done")}><Check /> {t("mark_done")}</Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setState(m, "dismissed")}>{t("dismiss")}</Button>
                </div>
              )}
            </div>
          ); })}
        </Card>
      </div>
    );

  const empty = overdue.length === 0 && upcoming.length === 0 && undated.length === 0 && done.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}><Plus /> {t("add_reminder")}</Button>
      </div>
      {loading && empty ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="an-skel h-12 w-full rounded-[8px]" />)}</Card>
      ) : empty ? (
        <Card className="p-6"><Empty icon="bell" text={t("no_reminders")} /></Card>
      ) : (
        <>
          {section("overdue", overdue, "danger")}
          {section("upcoming", upcoming, "accent")}
          {section("no_due_date", undated, "neutral")}
          {section("reminders_done", done, "neutral", true)}
        </>
      )}
      <AddModal open={adding} onClose={() => setAdding(false)} shopId={shopId} titles={titles} onCreated={load} />
    </div>
  );
}

function AddModal({ open, onClose, shopId, titles, onCreated }: { open: boolean; onClose: () => void; shopId: string; titles: string[]; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ title: "", customerId: "", customerName: "", phone: "", vehicleId: "", plate: "", due: "", mileage: "", repeat: false, repMonths: "", repKm: "" });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [busy, setBusy] = useState(false);
  const services = useServiceNames(titles);

  useEffect(() => {
    if (!open) return;
    setF({ title: "", customerId: "", customerName: "", phone: "", vehicleId: "", plate: "", due: "", mileage: "", repeat: false, repMonths: "", repKm: "" });
    setVehicles([]);
    api.listCustomers(shopId).then((c) => setCustomers(c.filter((x) => !x.walkIn))).catch(() => {});
  }, [open, shopId]);

  // Picking a real client carries their name + phone (so the due-date Telegram reminder
  // reaches them) and loads their cars to pick the plate from.
  const pickCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id);
    setF((s) => ({ ...s, customerId: id, customerName: c?.name ?? "", phone: c?.phone ?? "", vehicleId: "", plate: "" }));
    if (id) api.listVehicles(id).then(setVehicles).catch(() => setVehicles([]));
    else setVehicles([]);
  };
  const pickVehicle = (vid: string) => {
    const v = vehicles.find((x) => x.id === vid);
    setF((s) => ({ ...s, vehicleId: vid, plate: v?.plate ?? "" }));
  };

  const repMonths = parseInt(f.repMonths, 10) || 0;
  const repKm = parseInt(f.repKm, 10) || 0;

  const save = async () => {
    if (!f.title.trim() || busy) return;
    // A recurring reminder needs an interval, otherwise there is nothing to advance by.
    if (f.repeat && repMonths <= 0 && repKm <= 0) { toast(t("rem_interval_hint"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      await api.createReminder(shopId, {
        title: f.title.trim(), vehicleId: f.vehicleId || undefined,
        customerName: f.customerName.trim(), phone: f.phone.trim(), plate: f.plate.trim(),
        dueDate: f.due ? new Date(f.due + "T12:00:00").toISOString() : undefined,
        dueMileage: parseInt(f.mileage, 10) || 0, notes: "",
        repeatMonths: f.repeat ? repMonths : 0, repeatKm: f.repeat ? repKm : 0,
      });
      toast(t("save"), { icon: "check" }); onClose(); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader><DialogTitle>{t("add_reminder")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          {/* The shop's own price list, so the reminder is named the way the shop names the
              job — and so a shop that has never written a reminder is still offered something. */}
          <Field label={t("reminder_title")} hint={services.length > 0 ? t("from_price_list") : undefined}>
            <SuggestInput value={f.title} options={services} max={20} onChange={(v) => setF({ ...f, title: v })} placeholder={t("reminder_title")} />
          </Field>
          <Field label={t("nav_customers")}>
            <SearchSelect
              value={f.customerId}
              onChange={pickCustomer}
              options={customers.map((c) => ({ value: c.id, label: c.name + (c.phone ? " · " + c.phone : "") }))}
              placeholder="—"
              searchPlaceholder={t("search") + "…"}
              emptyLabel={t("empty")}
            />
          </Field>
          {f.customerId && (
            <Field label={t("vehicle")}>
              <SearchSelect
                value={f.vehicleId}
                onChange={pickVehicle}
                options={vehicles.map((v) => ({ value: v.id, label: [v.make, v.model].filter(Boolean).join(" ") + " · " + v.plate }))}
                placeholder="—"
                searchPlaceholder={t("search") + "…"}
                emptyLabel={t("empty")}
              />
            </Field>
          )}
          {f.plate && <span className="inline-block"><PlatePreview plate={f.plate} size="sm" /></span>}
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t("due_date")}><Input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
            <Field label={t("due_mileage")}><Input value={f.mileage} onChange={(e) => setF({ ...f, mileage: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className="font-mono" /></Field>
          </div>

          {/* Recurrence: optional. When on, completing the reminder auto-creates the next one. */}
          <Separator className="mt-1" />
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-semibold text-foreground">{t("rem_repeat")}</span>
              <Tabs value={f.repeat ? "on" : "off"} onValueChange={(v) => setF({ ...f, repeat: v === "on" })}>
                <TabsList>
                  <TabsTrigger value="off">{t("no")}</TabsTrigger>
                  <TabsTrigger value="on">{t("yes")}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {f.repeat && (
              <>
                <div className="text-[12px] text-muted-foreground">{t("rem_repeat_hint")}</div>
                <div className="flex gap-1.5">
                  {[3, 6, 12].map((n) => (
                    <Button key={n} type="button" variant={repMonths === n ? "soft" : "secondary"} size="sm" onClick={() => setF((s) => ({ ...s, repMonths: String(n) }))}>{n} {t("rem_months_n")}</Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label={t("rem_interval_months")}><Input value={f.repMonths} onChange={(e) => setF({ ...f, repMonths: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="6" className="font-mono" /></Field>
                  <Field label={t("rem_interval_km")}><Input value={f.repKm} onChange={(e) => setF({ ...f, repKm: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="10000" className="font-mono" /></Field>
                </div>
                <div className="text-[11.5px] text-muted-foreground">{t("rem_interval_hint")}</div>
              </>
            )}
          </div>

          <div className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Send className="size-3.5" /> {t("reminder_tg_hint")}
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
