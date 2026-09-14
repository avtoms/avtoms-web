"use client";
// Appointments, after the redesign. The day view is the workshop as a timetable: one column
// per mechanic (and one for bookings nobody has been given yet), the bookings as blocks at
// their time and length, a red line at the current minute, and a click on any empty slot to
// book that mechanic at that hour. Beside it: who still needs a mechanic today, tomorrow's
// bookings, and how many clients are due back this week. The week view lays seven days side
// by side; the list is the flat view the screen had before.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Plus, X, Bell, ClipboardList } from "lucide-react";
import { canWork } from "@/lib/use-staff";
import { Empty, useIsMobile } from "@/components/ui";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { SuggestInput } from "@/components/suggest-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui-kit/dropdown-menu";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { apptStateFromProto, apptStateToProto, reminderStateFromProto } from "@/lib/enums";
import { dayRange, shiftDay, spanRange, todayYMD } from "@/lib/range";
import { formatDayMonth, formatWeekday, weekdayShort } from "@/lib/i18n";
import { PhoneField, PlateField } from "@/components/catalog-fields";
import { toE164 } from "@/lib/phone";
import { PlatePreview } from "@/components/plate";
import type { Appointment, Staff, Customer, Vehicle } from "@/lib/types";
import { StaffDot, staffColor } from "../_shared";

// Radix Select forbids an empty-string item value, so "" (unset / reset) is represented by
// this sentinel in the Select only and mapped back to "" at the state boundary.
const NONE = "__none";
const pad2 = (n: number) => String(n).padStart(2, "0");
// Written out rather than left to the browser's locale, which put "Sun, Sep 13" and "03:00 PM"
// on an Uzbek screen.
const timeStr = (iso: string) => { const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const ymdOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// The day as drawn: 08:00 to 20:00, an hour to every 64 pixels.
const START = 8, END = 20, PX = 64;
type View = "day" | "week" | "list";
type Preset = { when?: string; mechanicId?: string };

export default function SchedulePage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t, lang } = useLang();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const router = useRouter();

  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState(todayYMD());
  const [list, setList] = useState<Appointment[]>([]);
  const [mechanics, setMechanics] = useState<Staff[]>([]);
  const [dueThisWeek, setDueThisWeek] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<Preset | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // The window each view reads: the day and the next (for "tomorrow"), seven days from the
  // chosen one, or everything from today on for the list.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "list") {
        const from = new Date(); from.setHours(0, 0, 0, 0);
        setList(await api.listAppointments(shopId, from.toISOString()));
      } else {
        const r = view === "day" ? spanRange(day, shiftDay(day, 1)) : spanRange(day, shiftDay(day, 6));
        setList(await api.listAppointments(shopId, r.from, r.to));
      }
    }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, view, day, t, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.listStaff(shopId).then((s) => setMechanics(s.filter(canWork))).catch(() => {}); }, [shopId]);
  useEffect(() => {
    api.listReminders(shopId).then((rs) => {
      const lim = Date.now() + 7 * 86400000;
      setDueThisWeek(rs.filter((r) => reminderStateFromProto(r.state) === "pending" && r.dueDate && new Date(r.dueDate).getTime() <= lim).length);
    }).catch(() => {});
  }, [shopId]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);

  const mechName = (id?: string) => mechanics.find((m) => m.id === id)?.name;

  // The jobs this shop actually books, offered when writing the next appointment.
  const titles = useMemo(() => list.flatMap((a) => (a.title ? [a.title] : [])), [list]);

  const setState = async (a: Appointment, state: "done" | "canceled") => {
    if (busy) return; setBusy(true);
    try { await api.setAppointmentState(a.id, apptStateToProto(state)); toast(t("save"), { icon: "check" }); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  // A booking made for somebody's car becomes that car's order when they arrive, without the
  // plate being looked up a second time; the booking itself is then done.
  const openOrder = async (a: Appointment) => {
    if (!a.vehicleId || busy) return;
    setBusy(true);
    try {
      const wo = await api.createWorkOrder(shopId, a.vehicleId);
      await api.setAppointmentState(a.id, apptStateToProto("done")).catch(() => {});
      router.push(`/work-orders/${wo.id}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      setBusy(false);
    }
  };

  const groups = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of list) {
      const d = ymdOf(a.scheduledAt);
      const k = `${formatWeekday(lang, d)}, ${formatDayMonth(lang, d)}`;
      (m.get(k) ?? m.set(k, []).get(k)!).push(a);
    }
    return [...m.entries()];
  }, [list, lang]);

  const onDay = useMemo(() => list.filter((a) => ymdOf(a.scheduledAt) === day).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [list, day]);
  const tomorrow = useMemo(() => list.filter((a) => ymdOf(a.scheduledAt) === shiftDay(day, 1) && apptStateFromProto(a.state) === "scheduled").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [list, day]);
  const known = new Set(mechanics.map((m) => m.id));
  const unassigned = onDay.filter((a) => apptStateFromProto(a.state) === "scheduled" && (!a.mechanicId || !known.has(a.mechanicId)));
  const bookedHours = (id: string) => onDay.filter((a) => a.mechanicId === id && apptStateFromProto(a.state) !== "canceled").reduce((s, a) => s + (a.durationMinutes || 60), 0) / 60;
  const cols = [...mechanics.map((m) => ({ id: m.id, name: m.name })), { id: "", name: t("sch_unassigned_col") }];
  const isToday = day === todayYMD();

  // A booking on the timetable: coloured by its mechanic, struck through when cancelled,
  // green once done. Clicking it offers the two things that can happen to it next.
  const block = (a: Appointment) => {
    const d = new Date(a.scheduledAt);
    const mins = (d.getHours() - START) * 60 + d.getMinutes();
    const dur = a.durationMinutes || 60;
    const st = apptStateFromProto(a.state);
    const color = a.mechanicId ? staffColor(a.mechanicId) : "var(--danger)";
    return (
      <DropdownMenu key={a.id}>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className={cn("absolute inset-x-1 overflow-hidden rounded-[8px] border-l-4 px-2 py-1 text-left shadow-[var(--shadow)] outline-none",
              st === "done" ? "bg-success-soft" : st === "canceled" ? "bg-secondary opacity-60" : a.mechanicId ? "bg-card" : "border-dashed bg-destructive-soft")}
            style={{ top: Math.max(0, (mins / 60) * PX), height: Math.max(26, (dur / 60) * PX - 2), borderLeftColor: color }}
          >
            <div className={cn("truncate text-[12.5px] font-bold text-foreground", st === "canceled" && "line-through")}>{a.title || t("vehicle")}</div>
            <div className="truncate text-[11.5px] text-muted-foreground">{[a.customerName, a.plate].filter(Boolean).join(" · ")}</div>
            {dur >= 50 && <div className="truncate font-mono text-[11px] text-muted-foreground">{timeStr(a.scheduledAt)} · {dur} {t("min_abbr")}</div>}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px]">
          <DropdownMenuLabel className="normal-case">{timeStr(a.scheduledAt)} · {a.title}</DropdownMenuLabel>
          {st === "scheduled" ? (
            <>
              {a.vehicleId && <DropdownMenuItem disabled={busy} onClick={() => void openOrder(a)}><ClipboardList /> {t("appt_open_order")}</DropdownMenuItem>}
              <DropdownMenuItem disabled={busy} onClick={() => setState(a, "done")}><Check /> {t("mark_done")}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => setState(a, "canceled")}><X /> {t("cancel")}</DropdownMenuItem>
            </>
          ) : <DropdownMenuItem disabled>{st === "done" ? t("st_done") : t("cancel")}</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const hours = Array.from({ length: END - START }, (_, i) => START + i);
  const nowTop = ((now.getHours() - START) * 60 + now.getMinutes()) / 60 * PX;

  const dayView = (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 60 + cols.length * 170 }}>
            {/* who each column is */}
            <div className="grid border-b border-border bg-secondary/40" style={{ gridTemplateColumns: `60px repeat(${cols.length}, minmax(170px, 1fr))` }}>
              <span />
              {cols.map((c) => (
                <div key={c.id || "none"} className="flex items-center gap-2.5 border-l border-border px-3 py-2.5">
                  {c.id ? <StaffDot id={c.id} name={c.name} size={28} /> : <span className="grid size-7 place-items-center rounded-full bg-destructive-soft text-[12px] font-bold text-destructive">?</span>}
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-bold text-foreground">{c.name}</div>
                    {c.id && <div className="text-[11.5px] text-muted-foreground">{bookedHours(c.id).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} {t("sch_booked_h")}</div>}
                  </div>
                </div>
              ))}
            </div>
            {/* the hours */}
            <div className="relative grid" style={{ gridTemplateColumns: `60px repeat(${cols.length}, minmax(170px, 1fr))`, height: (END - START) * PX }}>
              <div className="relative">
                {hours.map((h) => (
                  <span key={h} className="absolute right-2 -translate-y-1/2 font-mono text-[11px] text-muted-foreground" style={{ top: (h - START) * PX }}>{String(h).padStart(2, "0")}:00</span>
                ))}
              </div>
              {cols.map((c) => (
                <div key={c.id || "none"}
                  onClick={(e) => {
                    const y = e.clientY - (e.currentTarget as HTMLDivElement).getBoundingClientRect().top;
                    const h = Math.min(END - 1, Math.max(START, START + Math.floor(y / PX)));
                    setAdding({ when: `${day}T${String(h).padStart(2, "0")}:00`, mechanicId: c.id || undefined });
                  }}
                  className="relative cursor-copy border-l border-border"
                  style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${PX - 1}px, var(--line) ${PX - 1}px, var(--line) ${PX}px)` }}>
                  {onDay.filter((a) => (c.id ? a.mechanicId === c.id : !a.mechanicId || !known.has(a.mechanicId))).map(block)}
                </div>
              ))}
              {isToday && nowTop > 0 && nowTop < (END - START) * PX && (
                <div className="pointer-events-none absolute left-[52px] right-0 z-10 flex items-center" style={{ top: nowTop }}>
                  <span className="rounded-[4px] bg-destructive px-1 font-mono text-[10px] font-bold text-white">{`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`}</span>
                  <span className="h-0.5 flex-1 bg-destructive" />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-border px-4 py-2 text-[12px] text-muted-foreground">{t("sch_click_hint")}</div>
      </Card>

      <div className="flex flex-col gap-3.5">
        <Card className={cn("p-4", unassigned.length > 0 && "border-destructive/40")}>
          <div className={cn("mb-2 text-[11px] font-bold uppercase tracking-[0.06em]", unassigned.length ? "text-destructive" : "text-muted-foreground")}>
            {t("sch_unassigned_title")} · {unassigned.length}
          </div>
          {unassigned.length === 0 ? <div className="text-[13px] text-muted-foreground">—</div> : unassigned.map((a) => (
            <div key={a.id} className="border-b border-border py-2 last:border-0">
              <div className="text-[14px] font-bold text-foreground">{timeStr(a.scheduledAt)} · {a.title}</div>
              <div className="truncate text-[12.5px] text-muted-foreground">{[a.customerName, a.plate, a.durationMinutes ? `${a.durationMinutes} ${t("min_abbr")}` : ""].filter(Boolean).join(" · ")}</div>
            </div>
          ))}
        </Card>
        <Card className="p-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            {t("sch_tomorrow")} · {formatWeekday(lang, shiftDay(day, 1))}, {formatDayMonth(lang, shiftDay(day, 1))}
          </div>
          {tomorrow.length === 0 ? <div className="text-[13px] text-muted-foreground">{t("no_appointments")}</div> : tomorrow.map((a) => (
            <div key={a.id} className="flex items-start gap-3 py-1.5">
              <span className="w-11 shrink-0 font-mono text-[13px] font-bold text-foreground">{timeStr(a.scheduledAt)}</span>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold text-foreground">{[a.title, a.plate].filter(Boolean).join(" · ")}</div>
                <div className="truncate text-[12px] text-muted-foreground">{[a.customerName, mechName(a.mechanicId)].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          ))}
        </Card>
        {dueThisWeek > 0 && (
          <Card className="p-4">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("sch_rem_week")}</div>
            <div className="flex items-start gap-2.5">
              <Bell className="mt-0.5 size-4 shrink-0 text-primary-emphasis" />
              <span className="flex-1 text-[13.5px] text-foreground">{dueThisWeek} {t("sch_rem_week_text")}</span>
              <Link href="/reminders" className="shrink-0 text-[13px] font-semibold text-primary-emphasis hover:underline">{t("nav_reminders")}</Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );

  const weekView = (
    <div className="overflow-x-auto">
      <div className="grid min-w-[840px] grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => shiftDay(day, i)).map((d) => {
          const items = list.filter((a) => ymdOf(a.scheduledAt) === d).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
          const today = d === todayYMD();
          return (
            <Card key={d} className={cn("min-h-[220px] gap-1.5 p-2.5", today && "border-primary/50")}>
              <button onClick={() => { setDay(d); setView("day"); }} className="flex items-baseline justify-between px-0.5 text-left">
                <span className={cn("text-[13px] font-bold", today ? "text-primary-emphasis" : "text-foreground")}>{weekdayShort(lang, d)}, {formatDayMonth(lang, d)}</span>
                <span className="font-mono text-[11.5px] text-muted-foreground">{items.length}</span>
              </button>
              {items.map((a) => {
                const st = apptStateFromProto(a.state);
                return (
                  <div key={a.id} className={cn("rounded-[8px] border-l-4 bg-secondary/60 px-2 py-1.5", st === "canceled" && "opacity-50")} style={{ borderLeftColor: a.mechanicId ? staffColor(a.mechanicId) : "var(--danger)" }}>
                    <div className="font-mono text-[11.5px] font-bold text-foreground">{timeStr(a.scheduledAt)}</div>
                    <div className={cn("truncate text-[12.5px] font-semibold text-foreground", st === "canceled" && "line-through")}>{a.title}</div>
                    <div className="truncate text-[11.5px] text-muted-foreground">{[a.customerName, mechName(a.mechanicId)].filter(Boolean).join(" · ")}</div>
                  </div>
                );
              })}
              <button onClick={() => setAdding({ when: `${d}T10:00` })} className="mt-auto rounded-[8px] border border-dashed border-input py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-secondary">+</button>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const listView = list.length === 0 ? (
    <Card className="p-6"><Empty icon="clock" text={t("no_appointments")} /></Card>
  ) : (
    <div className="flex flex-col gap-4">
      {groups.map(([dk, items]) => (
        <div key={dk} className="flex flex-col gap-2">
          <div className="px-1 text-[12px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{dk}</div>
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
                      {!!a.durationMinutes && <span>· {a.durationMinutes} {t("min_abbr")}</span>}
                    </div>
                  </div>
                  {st === "scheduled" ? (
                    <div className="flex shrink-0 gap-1.5">
                      {a.vehicleId && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void openOrder(a)}><ClipboardList /> {t("appt_open_order")}</Button>}
                      <Button variant="soft" size="sm" disabled={busy} onClick={() => setState(a, "done")}><Check /> {t("mark_done")}</Button>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setState(a, "canceled")} className="text-destructive hover:text-destructive">{t("cancel")}</Button>
                    </div>
                  ) : <Badge tone={st === "done" ? "ok" : "neutral"} dot>{st === "done" ? t("st_done") : t("cancel")}</Badge>}
                </div>
              );
            })}
          </Card>
        </div>
      ))}
    </div>
  );

  const effective = isMobile && view === "day" ? "list" : view;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="shrink-0 text-[19px] font-bold tracking-[-0.025em] text-foreground touch:text-[16px]">{t("nav_schedule")}</h1>
            <Tabs value={view} onValueChange={(v) => setView(v as View)}>
              <TabsList>
                {!isMobile && <TabsTrigger value="day">{t("sch_day")}</TabsTrigger>}
                <TabsTrigger value="week">{t("sch_week")}</TabsTrigger>
                <TabsTrigger value="list">{t("view_list")}</TabsTrigger>
              </TabsList>
            </Tabs>
            {view !== "list" && (
              <div className="flex items-center gap-1.5">
                <Button variant="secondary" size="icon-sm" aria-label="‹" onClick={() => setDay(shiftDay(day, view === "week" ? -7 : -1))}><ChevronLeft /></Button>
                <span className="min-w-[150px] text-center text-[14px] font-semibold text-foreground">{formatWeekday(lang, day)}, {formatDayMonth(lang, day)}</span>
                <Button variant="secondary" size="icon-sm" aria-label="›" onClick={() => setDay(shiftDay(day, view === "week" ? 7 : 1))}><ChevronRight /></Button>
                {day !== todayYMD() && <button onClick={() => setDay(todayYMD())} className="text-[13px] font-semibold text-primary-emphasis hover:underline">{t("today")}</button>}
              </div>
            )}
          </div>
        }
        meta={<span>{mechanics.length} {t("sch_masters")} · {(view === "day" ? onDay : list).filter((a) => apptStateFromProto(a.state) !== "canceled").length} {t("sch_bookings")}</span>}
        actions={<Button onClick={() => setAdding({ when: view === "list" ? undefined : `${day}T${String(Math.min(END - 1, Math.max(START, new Date().getHours() + 1))).padStart(2, "0")}:00` })}><Plus /> {t("add_appointment")}</Button>}
      />
      {loading && list.length === 0 ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="an-skel h-12 w-full rounded-[8px]" />)}</Card>
      ) : effective === "day" ? dayView : effective === "week" ? weekView : listView}
      <AddModal open={!!adding} preset={adding ?? undefined} onClose={() => setAdding(null)} shopId={shopId} mechanics={mechanics} titles={titles} onCreated={load} />
    </div>
  );
}

function defaultWhen(): string {
  const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AddModal({ open, onClose, shopId, mechanics, titles, onCreated, preset }: {
  open: boolean; onClose: () => void; shopId: string; mechanics: Staff[]; titles: string[]; onCreated: () => void;
  // A click on an empty slot of the timetable books that mechanic at that hour.
  preset?: Preset;
}) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ title: "", customerId: "", customer: "", phone: "", vehicleId: "", plate: "", when: defaultWhen(), duration: "60", mechanicId: "", notes: "" });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({ title: "", customerId: "", customer: "", phone: "", vehicleId: "", plate: "", when: preset?.when || defaultWhen(), duration: "60", mechanicId: preset?.mechanicId || "", notes: "" });
    setVehicles([]);
    api.listCustomers(shopId).then((c) => setCustomers(c.filter((x) => !x.walkIn))).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // E.164, like every other screen that creates a client. PhoneField holds the readable
    // "+998 90 123 45 67", and storing that is what stopped these clients ever being matched
    // to their Telegram — the bot links on an exact string, and the spaces never matched.
    const phone = toE164(f.phone);
    try {
      // A booking for a NEW person (not picked from existing) also registers them in the
      // clients list — so a scheduled visit means the client exists, just reserved for that
      // time. Reuse an existing client when the phone already matches; never block the
      // booking if client creation fails.
      let vehicleId = f.vehicleId;
      // What the booking could not register, said once it has saved — otherwise it stands with
      // no client or no car and nobody knows.
      let missed: "" | "appt_saved_no_client" | "appt_saved_no_car" = "";
      if (!f.customerId && name) {
        const digits = (s: string) => s.replace(/\D/g, "");
        const dupe = phone ? customers.find((c) => c.phone && digits(c.phone) === digits(phone)) : undefined;
        if (!dupe) {
          try {
            const c = await api.createCustomer(shopId, { name, phone, language: lang });
            // Their car too, when a plate was given: a client created with no car could not
            // later be booked by plate, and the booking could not become an order.
            if (f.plate.trim()) {
              try { vehicleId = (await api.createVehicle({ customerId: c.id, plate: f.plate.trim() })).id; }
              catch { missed = "appt_saved_no_car"; /* the booking still stands on its plate */ }
            }
          }
          catch { missed = "appt_saved_no_client"; /* non-fatal — still create the appointment */ }
        }
      }
      // The car picked above goes with the booking. It used to be chosen and then dropped here,
      // leaving the appointment with a plate and no link to the car it was for.
      await api.createAppointment(shopId, {
        title: f.title.trim(), customerName: name, phone, plate: f.plate.trim(), vehicleId: vehicleId || undefined,
        mechanicId: f.mechanicId || undefined, scheduledAt: new Date(f.when).toISOString(),
        durationMinutes: parseInt(f.duration, 10) || 0, notes: f.notes.trim(),
      });
      if (missed) toast(t(missed), { icon: "alert", tone: "accent" });
      else toast(t("save"), { icon: "check" });
      onClose(); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader><DialogTitle>{t("add_appointment")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          <Field label={t("description")}>
            <SuggestInput value={f.title} options={titles} onChange={(v) => setF({ ...f, title: v })} placeholder={t("service")} />
          </Field>
          <div className="grid grid-cols-[1fr_90px] gap-2.5">
            <Field label={t("appt_when")}><Input type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} /></Field>
            <Field label={t("duration_min")}><Input value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className="font-mono" /></Field>
          </div>
          <Field label={t("nav_customers")}>
            <SearchSelect
              value={f.customerId}
              onChange={pickCustomer}
              options={customers.map((c) => ({ value: c.id, label: c.name + (c.phone ? " · " + c.phone : "") }))}
              placeholder={t("appt_new_client")}
              clearLabel={t("appt_new_client")}
              searchPlaceholder={t("search") + "…"}
              emptyLabel={t("empty")}
            />
          </Field>
          {f.customerId && vehicles.length > 0 && (
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
