"use client";
// Service reminders, after the redesign: bringing clients back for the oil, the inspection, the
// insurance. Four figures on top — overdue, due this week, due in the next thirty days, done —
// then the reminders as a table: when (and how far off, or the odometer target), whose car,
// what and how often, and what to do about it now: call, book them in, mark it done, drop it.
// Filters by when it is due and by what it is for.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, History, Plus, Send, Phone, CalendarPlus } from "lucide-react";
import { Empty, useIsMobile } from "@/components/ui";
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
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { reminderStateFromProto, reminderStateToProto } from "@/lib/enums";
import { useServiceNames } from "@/lib/use-services";
import { shortDate } from "@/lib/format";
import { PlatePreview } from "@/components/plate";
import type { ServiceReminder, Customer, Vehicle } from "@/lib/types";
import { KpiCard, staffColor } from "../_shared";

const isRecurring = (m: ServiceReminder) => !!(m.repeatMonths || m.repeatKm);
type Bucket = "all" | "overdue" | "week" | "future" | "undated" | "done";
const ALL = "__all";

export default function RemindersPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t, lang } = useLang();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [list, setList] = useState<ServiceReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bucket, setBucket] = useState<Bucket>("all");
  const [kind, setKind] = useState(ALL);

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

  // Days from today to the due date; negative is overdue. Undated reminders have none.
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const daysTo = useCallback((m: ServiceReminder) => {
    if (!m.dueDate) return null;
    const d = new Date(m.dueDate); d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today) / 86400000);
  }, [today]);

  const groups = useMemo(() => {
    const pending = list.filter((m) => reminderStateFromProto(m.state) === "pending");
    const at = (m: ServiceReminder) => daysTo(m);
    return {
      pending,
      overdue: pending.filter((m) => (at(m) ?? 0) < 0 && m.dueDate),
      week: pending.filter((m) => { const d = at(m); return d !== null && d >= 0 && d < 7; }),
      next30: pending.filter((m) => { const d = at(m); return d !== null && d >= 0 && d < 30; }),
      future: pending.filter((m) => { const d = at(m); return d !== null && d >= 7; }),
      undated: pending.filter((m) => !m.dueDate),
      done: list.filter((m) => reminderStateFromProto(m.state) !== "pending"),
    };
  }, [list, daysTo]);

  // What reminders are for, by how often each is written — the titles are the shop's own words.
  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of groups.pending) { const k = r.title.trim(); if (k) m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
  }, [groups.pending]);

  const rows = useMemo(() => {
    const src = bucket === "all" ? [...groups.pending, ...groups.done]
      : bucket === "overdue" ? groups.overdue
      : bucket === "week" ? groups.week
      : bucket === "future" ? groups.future
      : bucket === "undated" ? groups.undated
      : groups.done;
    return src
      .filter((m) => kind === ALL || m.title.trim() === kind)
      .sort((a, b) => {
        const pa = reminderStateFromProto(a.state) === "pending" ? 0 : 1;
        const pb = reminderStateFromProto(b.state) === "pending" ? 0 : 1;
        return pa - pb || (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
      });
  }, [bucket, kind, groups]);

  const relative = (d: number) => {
    if (d === 0) return t("today");
    if (d < 0) return `${-d} ${t("rem_days_ago")}`;
    return lang === "ru" ? `через ${d} ${t("rem_in_days")}` : `${d} ${t("rem_in_days")}`;
  };
  const rule = (m: ServiceReminder) => isRecurring(m)
    ? `${t("rem_every")} ${[m.repeatMonths ? `${m.repeatMonths} ${t("rem_months_n")}` : "", m.repeatKm ? `${m.repeatKm.toLocaleString("ru-RU")} km` : ""].filter(Boolean).join(" / ")}`
    : t("rem_once");

  const BUCKETS: [Bucket, string, number][] = [
    ["all", t("all"), groups.pending.length + groups.done.length],
    ["overdue", t("overdue"), groups.overdue.length],
    ["week", t("rem_this_week"), groups.week.length],
    ["future", t("rem_future"), groups.future.length],
    ["undated", t("no_due_date"), groups.undated.length],
    ["done", t("reminders_done"), groups.done.length],
  ];

  const row = (m: ServiceReminder) => {
    const st = reminderStateFromProto(m.state);
    const done = st !== "pending";
    const d = daysTo(m);
    const tone = done ? "text-muted-foreground" : d !== null && d < 0 ? "text-destructive" : d !== null && d < 7 ? "text-warning" : "text-foreground";
    const name = m.customerName || "—";
    const initials = name.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
    const due = (
      <div className="min-w-0">
        <div className={cn("font-mono text-[14px] font-bold", tone)}>{m.dueDate ? shortDate(m.dueDate) : "—"}</div>
        <div className="truncate text-[12px] text-muted-foreground">
          {d !== null && !done ? relative(d) : ""}
          {m.dueMileage ? `${d !== null && !done ? " · " : ""}${m.dueDate ? `${t("next_or")} ` : ""}${m.dueMileage.toLocaleString("ru-RU")} km` : ""}
          {!m.dueDate && !m.dueMileage ? t("no_due_date") : ""}
        </div>
      </div>
    );
    const who = (
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full text-[11.5px] font-bold text-white" style={{ background: staffColor(m.phone || m.customerName || m.id) }}>{initials}</span>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-foreground">{name}</div>
          {m.plate && <div className="mt-0.5"><PlatePreview plate={m.plate} size="sm" /></div>}
        </div>
      </div>
    );
    const what = (
      <div className="min-w-0">
        <div className={cn("truncate text-[14px] font-semibold text-foreground", done && "line-through opacity-70")}>{m.title}</div>
        <div className="flex items-center gap-1 truncate text-[12px] text-muted-foreground">
          {isRecurring(m) && <History className="size-3 shrink-0" />}{rule(m)}
        </div>
      </div>
    );
    const actions = done ? (
      <Badge tone={st === "done" ? "ok" : "neutral"} dot>{st === "done" ? t("st_done") : t("st_dismissed")}</Badge>
    ) : (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {m.phone && <Button variant={d !== null && d < 0 ? "default" : "secondary"} size="sm" asChild><a href={`tel:${m.phone}`}><Phone /> {t("call")}</a></Button>}
        <Button variant="secondary" size="sm" asChild><Link href="/schedule"><CalendarPlus /> {t("rem_book")}</Link></Button>
        <Button variant="soft" size="sm" disabled={busy} onClick={() => setState(m, "done")}><Check /> {t("mark_done")}</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setState(m, "dismissed")}>{t("dismiss")}</Button>
      </div>
    );
    const overdue = !done && d !== null && d < 0;
    if (isMobile) {
      return (
        <div key={m.id} className={cn("flex flex-col gap-2.5 border-b border-border px-4 py-3 last:border-0", overdue && "bg-destructive-soft/40")}>
          <div className="flex items-start justify-between gap-3">{who}{due}</div>
          {what}
          {actions}
        </div>
      );
    }
    return (
      <div key={m.id} className={cn("grid grid-cols-[130px_minmax(0,1.1fr)_minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-5 py-3 last:border-0", overdue && "bg-destructive-soft/40", done && "opacity-70")}>
        {due}{who}{what}{actions}
      </div>
    );
  };

  const empty = list.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        meta={<span>{t("rem_sub")}</span>}
        actions={<Button onClick={() => setAdding(true)}><Plus /> {t("add_reminder")}</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("overdue")} value={groups.overdue.length} tone={groups.overdue.length ? "danger" : "neutral"}
          edge={groups.overdue.length ? "danger" : undefined} sub={t("rem_overdue_sub")} onClick={() => setBucket("overdue")} />
        <KpiCard label={t("rem_this_week")} value={groups.week.length} tone={groups.week.length ? "warn" : "neutral"}
          edge={groups.week.length ? "warn" : undefined} onClick={() => setBucket("week")} />
        <KpiCard label={t("rem_next30")} value={groups.next30.length} sub={t("rem_auto_tg")} onClick={() => setBucket("future")} />
        <KpiCard label={t("reminders_done")} value={groups.done.length} tone="ok" onClick={() => setBucket("done")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-[10px] bg-secondary p-1">
          {BUCKETS.map(([k, label, n]) => (
            <button key={k} onClick={() => setBucket(k)} aria-pressed={bucket === k}
              className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-semibold transition-colors touch:min-h-11",
                bucket === k ? "bg-card text-foreground shadow-[var(--shadow)]" : k === "overdue" && n ? "text-destructive" : "text-muted-foreground hover:text-foreground")}>
              {label}{n ? <span className="font-mono text-[11.5px] text-muted-foreground">{n}</span> : null}
            </button>
          ))}
        </div>
        {kinds.length > 1 && (
          <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-[10px] bg-secondary p-1">
            {[ALL, ...kinds].map((k) => (
              <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
                className={cn("min-h-8 max-w-[180px] truncate rounded-[8px] px-3 text-[13px] font-semibold transition-colors touch:min-h-11",
                  kind === k ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground hover:text-foreground")}>
                {k === ALL ? t("rem_all_types") : k}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-[12.5px] font-semibold text-success touch:ml-0">
          <Send className="size-3.5" /> {t("reminder_tg_hint")}
        </span>
      </div>

      {loading && empty ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="an-skel h-12 w-full rounded-[8px]" />)}</Card>
      ) : empty ? (
        <Card className="p-6"><Empty icon="bell" text={t("no_reminders")} /></Card>
      ) : (
        <Card className="overflow-hidden">
          {!isMobile && (
            <div className="grid grid-cols-[130px_minmax(0,1.1fr)_minmax(0,1fr)_auto] gap-4 border-b border-border bg-secondary/40 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              <span>{t("col_due")}</span><span>{t("col_client_car")}</span><span>{t("col_service")}</span><span className="text-right">{t("col_action")}</span>
            </div>
          )}
          {rows.length === 0 ? <div className="px-5 py-10 text-center text-[13.5px] text-muted-foreground">{t("empty")}</div> : rows.map(row)}
        </Card>
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
    // A reminder belongs to a car: two cars have two oil changes, and a mileage target means
    // nothing without the odometer it is read from. A client with cars has to say which.
    if (f.customerId && vehicles.length > 0 && !f.vehicleId) { toast(t("rem_pick_car"), { icon: "alert", tone: "danger" }); return; }
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
