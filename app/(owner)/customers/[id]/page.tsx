"use client";
// A client's own page, after the redesign. Who they are and how to reach them, what they have
// spent and how often they come, whether they owe anything, when they are next due; then their
// orders across every car, their payments, their reminders and the shop's note on them. On the
// right: their cars, each with its visits and its next service, or a warning when one is overdue.
//
// Everything the old client card could do is here too: edit the client, add or edit a car, add
// a reminder for a car, open a car's service book and warranties, settle a debt.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Phone, MessageSquare, Pencil, Plus, ChevronRight, Bell, BookOpen, AlertTriangle } from "lucide-react";
import { StateBadge, Empty, useIsMobile } from "@/components/ui";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Textarea } from "@/components/ui-kit/textarea";
import { Spinner, Skeleton } from "@/components/ui-kit/misc";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui-kit/dropdown-menu";
import { PageHeader } from "@/components/page-header";
import { PlatePreview } from "@/components/plate";
import { VehicleHistoryModal } from "@/components/vehicle-history";
import { EditVehicleModal } from "@/components/vehicle-edit";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { can } from "@/lib/perms";
import { useStaffNames } from "@/lib/use-staff";
import { formatClientSince } from "@/lib/i18n";
import { money, num, orderLabel, shortDate } from "@/lib/format";
import { langFromProto, plateTypeFromProto, reminderStateFromProto, woStateFromProto, type WoState } from "@/lib/enums";
import type { Customer, CustomerLedgerEntry, ServiceBook, ServiceReminder, Vehicle, WorkOrder } from "@/lib/types";
import { CustomerAccount } from "../_debt";
import { AddReminderModal, AddVehicleModal, EditCustomerModal } from "../_modals";
import { StaffDot } from "../../_shared";
import { cn } from "@/lib/utils";

const EARNED: WoState[] = ["invoiced", "closed"];
const IN_SHOP: WoState[] = ["approved", "in_progress", "ready"];
type Tab = "orders" | "payments" | "reminders" | "notes";

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t, lang } = useLang();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const who = useStaffNames();
  const canCreate = can(session, "orders.create");

  const [cust, setCust] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [books, setBooks] = useState<Record<string, ServiceBook>>({});
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [reminders, setReminders] = useState<ServiceReminder[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<CustomerLedgerEntry[] | null>(null);
  const [tab, setTab] = useState<Tab>("orders");
  const [allOrders, setAllOrders] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editCust, setEditCust] = useState(false);
  const [addV, setAddV] = useState(false);
  const [editVeh, setEditVeh] = useState<Vehicle | null>(null);
  const [histVehicle, setHistVehicle] = useState<Vehicle | null>(null);
  const [remVehicle, setRemVehicle] = useState<Vehicle | null>(null);
  const [account, setAccount] = useState(false);

  // The client, then everything hanging off their cars. Each car's lookups are best-effort —
  // a person allowed the client book but not the money still gets the page, without its sums.
  const load = useCallback(async () => {
    try {
      const c = await api.getCustomer(id);
      setCust(c);
      const vs = await api.listVehicles(id).catch(() => [] as Vehicle[]);
      setVehicles(vs);
      const [bks, wos, rems] = await Promise.all([
        Promise.all(vs.map((v) => api.serviceBook(v.id).catch(() => null))),
        Promise.all(vs.map((v) => api.listWorkOrders(shopId, undefined, undefined, v.id).catch(() => [] as WorkOrder[]))),
        Promise.all(vs.map((v) => api.listReminders(shopId, v.id).catch(() => [] as ServiceReminder[]))),
      ]);
      const bm: Record<string, ServiceBook> = {};
      vs.forEach((v, i) => { const b = bks[i]; if (b) bm[v.id] = b; });
      setBooks(bm);
      setOrders(wos.flat().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
      setReminders(rems.flat());
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setLoading(false);
    }
    api.customerBalances()
      .then((r) => setBalance(num((r.balances ?? []).find((b) => b.customerId === id)?.balance)))
      .catch(() => setBalance(null));
    api.customerLedger(id)
      .then((r) => setLedger([...(r.entries ?? [])].sort((a, b) => (b.occurredAt || b.createdAt || "").localeCompare(a.occurredAt || a.createdAt || ""))))
      .catch(() => setLedger(null));
  }, [id, shopId, t, toast]);

  useEffect(() => { void load(); }, [load]);

  // What the service book says was done on each visit, keyed by order — the order list itself
  // carries only the head of each order.
  const workByOrder = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of Object.values(books)) {
      for (const e of b.entries ?? []) {
        const names = (e.items ?? []).map((i) => i.description).filter(Boolean);
        if (names.length) m.set(e.workOrderId, names.slice(0, 4).join(", "));
      }
    }
    return m;
  }, [books]);

  const earned = orders.filter((w) => EARNED.includes(woStateFromProto(w.state)));
  const totalSpent = earned.reduce((s, w) => s + num(w.total), 0);
  const visitCount = earned.length;
  const avg = visitCount ? Math.round(totalSpent / visitCount) : 0;
  const lastVisit = orders[0]?.createdAt;
  const pending = reminders
    .filter((r) => reminderStateFromProto(r.state) === "pending")
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const next = pending[0];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = (r: ServiceReminder) => !!r.dueDate && new Date(r.dueDate).getTime() < today.getTime();

  const newOrderFor = async (v: Vehicle) => {
    if (busy) return;
    setBusy(true);
    try {
      const wo = await api.createWorkOrder(shopId, v.id);
      router.push(`/work-orders/${wo.id}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      setBusy(false);
    }
  };

  const crumb = (
    <div className="flex min-w-0 items-center gap-2 text-[14px]">
      <Link href="/customers" className="shrink-0 text-muted-foreground hover:text-foreground hover:underline">{t("nav_customers")}</Link>
      <span className="text-muted-foreground">/</span>
      <span className="truncate font-semibold text-foreground">{cust ? (cust.walkIn ? t("walk_in") : cust.name) : "…"}</span>
    </div>
  );

  if (loading) return (
    <div className="flex flex-col gap-4">
      <PageHeader title={crumb} />
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
  if (!cust) return <><PageHeader title={crumb} /><Empty icon="alert" text={t("error")} /></>;

  const name = cust.walkIn ? t("walk_in") : cust.name;
  const initials = (name || "?").split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const handle = (cust.telegramHandle || "").replace(/^@/, "");
  const messageHref = handle ? `https://t.me/${handle}` : cust.phone ? `sms:${cust.phone}` : undefined;
  const shownOrders = allOrders ? orders : orders.slice(0, 5);
  const linked = !!cust.telegramChatId;

  const newOrderButton = canCreate && (
    vehicles.length === 0 ? (
      <Button onClick={() => setAddV(true)}><Plus /> {t("new_wo")}</Button>
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={busy}>{busy ? <Spinner /> : <Plus />} {t("new_wo")}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[240px]">
          <DropdownMenuLabel className="normal-case">{t("new_order_for")}</DropdownMenuLabel>
          {vehicles.map((v) => (
            <DropdownMenuItem key={v.id} onClick={() => void newOrderFor(v)}>
              <span className="min-w-0 flex-1 truncate">{[v.make, v.model].filter(Boolean).join(" ") || t("vehicle")}</span>
              <span className="font-mono text-[12px] text-muted-foreground">{v.plate}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={crumb} />

      {/* ── who they are ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-[19px] font-bold text-primary-foreground">{initials}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[24px] font-bold tracking-[-0.02em] text-foreground touch:text-[20px]">{name}</h2>
              {visitCount >= 3 && <Badge tone="ok">{t("cust_regular")}</Badge>}
              {linked && <Badge tone="info">{t("tg_linked")}</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] text-muted-foreground">
              {cust.phone && <span className="font-mono text-ink-2">{cust.phone}</span>}
              {cust.createdAt && <><span aria-hidden>·</span><span>{formatClientSince(lang, cust.createdAt)}</span></>}
              {lastVisit && <><span aria-hidden>·</span><span>{t("last_visit")}: {new Date(lastVisit).toDateString() === new Date().toDateString() ? t("today").toLowerCase() : shortDate(lastVisit)}</span></>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cust.phone && <Button variant="secondary" asChild><a href={`tel:${cust.phone}`}><Phone /> {t("call")}</a></Button>}
          {messageHref && <Button variant="secondary" asChild><a href={messageHref} target={handle ? "_blank" : undefined} rel="noreferrer"><MessageSquare /> {t("msg")}</a></Button>}
          <Button variant="secondary" onClick={() => setEditCust(true)}><Pencil /> {t("edit")}</Button>
          {newOrderButton}
        </div>
      </div>

      {/* ── the figures ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t("total_spent")} value={<span className="font-mono">{money(totalSpent)}</span>} />
        <Tile label={t("visits_title")} value={<span className="font-mono">{visitCount}</span>} sub={visitCount ? `· ${t("dash_avg")} ${money(avg)}` : undefined} />
        <Tile
          label={t("cust_debt")}
          value={<span className={cn("font-mono", balance && balance > 0 ? "text-destructive" : "text-success")}>{money(balance ?? 0)} <span className="text-[14px] font-medium">{t("soum")}</span></span>}
          onClick={balance !== null ? () => setAccount(true) : undefined}
        />
        <Tile label={t("next_reminder")} value={next ? <span className="text-[16px]">{next.title}{next.dueDate ? ` · ${shortDate(next.dueDate)}` : ""}</span> : <span className="text-[15px] text-muted-foreground">—</span>} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]">
        {/* ── orders · payments · reminders · notes ── */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex gap-1 overflow-x-auto border-b border-border">
            {([
              ["orders", t("tab_orders"), orders.length],
              ["payments", t("tab_payments"), ledger?.length],
              ["reminders", t("nav_reminders"), pending.length],
              ["notes", t("tab_notes"), undefined],
            ] as [Tab, string, number | undefined][]).map(([k, label, n]) => (
              <button key={k} onClick={() => setTab(k)}
                className={cn("-mb-px flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[14px] font-semibold transition-colors",
                  tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {label}{n ? <span className="font-mono text-[12px] text-muted-foreground">{n}</span> : null}
              </button>
            ))}
          </div>

          {tab === "orders" && (
            <Card className="overflow-hidden">
              {orders.length === 0 ? <div className="p-5"><Empty icon="clipboard" text={t("empty")} /></div> : (
                <>
                  {!isMobile && (
                    <div className="grid grid-cols-[100px_76px_minmax(0,1fr)_120px_130px_110px_20px] gap-3 border-b border-border bg-secondary/40 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                      <span>{t("date")}</span><span>№</span><span>{t("vehicle")} · {t("sum_works")}</span><span>{t("mechanic")}</span><span>{t("col_status")}</span><span className="text-right">{t("col_sum")}</span><span />
                    </div>
                  )}
                  {shownOrders.map((w) => {
                    const work = workByOrder.get(w.id) || "";
                    const mech = who(w.assignedMechanicId);
                    const car = [w.make, w.model].filter(Boolean).join(" ") || w.plate || "";
                    return isMobile ? (
                      <Link key={w.id} href={`/work-orders/${w.id}`} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><span className="font-mono text-[13px] font-bold">{orderLabel(w)}</span><span className="font-mono text-[12px] text-muted-foreground">{shortDate(w.createdAt)}</span></div>
                          <div className="truncate text-[14px] font-semibold text-foreground">{car}</div>
                          {work && <div className="truncate text-[12.5px] text-muted-foreground">{work}</div>}
                        </div>
                        <div className="flex flex-col items-end gap-1"><StateBadge state={woStateFromProto(w.state)} /><span className="font-mono text-[14px] font-bold">{money(num(w.total))}</span></div>
                      </Link>
                    ) : (
                      <Link key={w.id} href={`/work-orders/${w.id}`} className="grid grid-cols-[100px_76px_minmax(0,1fr)_120px_130px_110px_20px] items-center gap-3 border-b border-border px-5 py-3 last:border-0 hover:bg-secondary/50">
                        <span className="font-mono text-[13px] text-ink-2">{shortDate(w.createdAt)}</span>
                        <span className="font-mono text-[13px] font-semibold text-ink-2">{orderLabel(w)}</span>
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-semibold text-foreground">{car}</div>
                          {work && <div className="truncate text-[12.5px] text-muted-foreground">{work}</div>}
                        </div>
                        <span className="flex min-w-0 items-center gap-2 text-[13px]">
                          {w.assignedMechanicId ? <><StaffDot id={w.assignedMechanicId} name={mech} size={22} /><span className="truncate">{mech.split(" ")[0]}</span></> : <span className="text-muted-foreground">—</span>}
                        </span>
                        <span><StateBadge state={woStateFromProto(w.state)} /></span>
                        <span className="text-right font-mono text-[14px] font-semibold text-foreground">{money(num(w.total))}</span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    );
                  })}
                  {!allOrders && orders.length > 5 && (
                    <button onClick={() => setAllOrders(true)} className="w-full py-3 text-center text-[13.5px] font-semibold text-primary-emphasis hover:bg-secondary/50">
                      {t("more_prefix")} {orders.length - 5} {t("more_suffix")}
                    </button>
                  )}
                </>
              )}
            </Card>
          )}

          {tab === "payments" && (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
                <span className="text-[13px] text-muted-foreground">{t("cust_debt")}: <span className={cn("font-mono font-bold", balance && balance > 0 ? "text-destructive" : "text-success")}>{money(balance ?? 0)}</span></span>
                {balance !== null && <Button variant="soft" size="sm" onClick={() => setAccount(true)}>{t("manage_debt")}</Button>}
              </div>
              {!ledger || ledger.length === 0 ? <div className="p-5"><Empty icon="money" text={t("empty")} /></div> : ledger.map((e) => {
                const isPayment = /PAYMENT|REPAY/i.test(String(e.kind));
                return (
                  <div key={e.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0">
                    <span className="w-24 shrink-0 font-mono text-[12.5px] text-muted-foreground">{shortDate(e.occurredAt || e.createdAt)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-foreground">{isPayment ? t("ledger_payment") : t("ledger_charge")}{e.sourceNo ? ` · ${e.sourceNo}` : ""}</div>
                      {(e.description || e.note) && <div className="truncate text-[12.5px] text-muted-foreground">{e.description || e.note}</div>}
                    </div>
                    <span className={cn("shrink-0 font-mono text-[14px] font-bold", isPayment ? "text-success" : "text-destructive")}>{isPayment ? "−" : "+"}{money(num(e.amount))}</span>
                  </div>
                );
              })}
            </Card>
          )}

          {tab === "reminders" && (
            <Card className="overflow-hidden">
              {reminders.length === 0 ? <div className="p-5"><Empty icon="bell" text={t("empty")} /></div> : [...reminders]
                .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
                .map((r) => {
                  const st = reminderStateFromProto(r.state);
                  const v = vehicles.find((x) => x.id === r.vehicleId);
                  return (
                    <div key={r.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0">
                      {st === "pending" && overdue(r) ? <AlertTriangle className="size-4 shrink-0 text-warning" /> : <Bell className={cn("size-4 shrink-0", st === "pending" ? "text-primary-emphasis" : "text-muted-foreground")} />}
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate text-[14px] font-semibold", st === "pending" ? "text-foreground" : "text-muted-foreground line-through")}>{r.title}</div>
                        <div className="truncate text-[12.5px] text-muted-foreground">
                          {[v ? [v.make, v.model].filter(Boolean).join(" ") : r.plate, r.dueDate ? shortDate(r.dueDate) : "", r.dueMileage ? `${Number(r.dueMileage).toLocaleString("ru-RU")} km` : ""].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {st === "pending" && overdue(r) && <Badge tone="warn">{t("overdue_word")}</Badge>}
                      {st !== "pending" && <Badge tone="neutral">{t(st === "done" ? "st_done" : "st_dismissed")}</Badge>}
                    </div>
                  );
                })}
            </Card>
          )}

          {tab === "notes" && <NotesBox customer={cust} onSaved={setCust} />}
        </div>

        {/* ── their cars, and the shop's note ── */}
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[15px] font-bold tracking-[-0.02em] text-foreground">{t("vehicles")}</span>
              <button onClick={() => setAddV(true)} className="text-[13px] font-semibold text-primary-emphasis hover:underline">+ {t("wo_add_draft")}</button>
            </div>
            {vehicles.length === 0 ? <div className="py-3 text-[13px] text-muted-foreground">{t("no_vehicles_yet")}</div> : (
              <div className="flex flex-col gap-2.5">
                {vehicles.map((v) => {
                  const inShop = orders.some((w) => w.vehicleId === v.id && IN_SHOP.includes(woStateFromProto(w.state)));
                  const book = books[v.id];
                  const vr = pending.filter((r) => r.vehicleId === v.id).slice(0, 2);
                  return (
                    <div key={v.id} className="rounded-[12px] border border-border p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 truncate text-[15px] font-bold text-foreground">
                          {[v.make, v.model].filter(Boolean).join(" ") || t("vehicle")}{v.year ? <span className="font-medium text-muted-foreground"> · {v.year}</span> : null}
                        </div>
                        {inShop && <Badge tone="warn">{t("dash_in_shop")}</Badge>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                        <PlatePreview plate={v.plate} type={plateTypeFromProto(v.plateType)} size="sm" />
                        {Number(v.mileage) > 0 && <span className="font-mono">{Number(v.mileage).toLocaleString("ru-RU")} km</span>}
                        {book?.visits ? <span>· {book.visits} {t("visits_n")}</span> : null}
                      </div>
                      {vr.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                          {vr.map((r) => overdue(r) ? (
                            <div key={r.id} className="flex items-center gap-1.5 text-[12.5px] font-medium text-warning">
                              <AlertTriangle className="size-3.5 shrink-0" /><span className="truncate">{r.title} {t("overdue_word")}: {shortDate(r.dueDate)}</span>
                            </div>
                          ) : (
                            <div key={r.id} className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                              <Bell className="size-3.5 shrink-0 text-primary-emphasis" />
                              <span className="truncate">{r.title}: {[r.dueDate ? shortDate(r.dueDate) : "", r.dueMileage ? `${Number(r.dueMileage).toLocaleString("ru-RU")} km` : ""].filter(Boolean).join(" / ")}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-2.5 flex items-center gap-1 border-t border-border pt-2">
                        <Button variant="ghost" size="sm" onClick={() => setHistVehicle(v)}><BookOpen /> {t("service_book")}</Button>
                        <Button variant="ghost" size="icon-sm" aria-label={t("add_reminder")} title={t("add_reminder")} onClick={() => setRemVehicle(v)}><Bell /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label={t("edit")} title={t("edit")} onClick={() => setEditVeh(v)}><Pencil /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          {tab !== "notes" && <NotesBox customer={cust} onSaved={setCust} compact />}
        </div>
      </div>

      <EditCustomerModal customer={editCust ? cust : null} onClose={() => setEditCust(false)} onSaved={(u) => { setCust(u); setEditCust(false); }} />
      <EditVehicleModal vehicle={editVeh} onClose={() => setEditVeh(null)} onDone={() => { setEditVeh(null); void load(); }} />
      <AddVehicleModal open={addV} onClose={() => setAddV(false)} customerId={cust.id} onCreated={() => { toast(t("save"), { icon: "check" }); setAddV(false); void load(); }} />
      <VehicleHistoryModal vehicle={histVehicle} shopId={shopId} onClose={() => setHistVehicle(null)} />
      <AddReminderModal open={!!remVehicle} onClose={() => { setRemVehicle(null); void load(); }} shopId={shopId} customerName={cust.name} phone={cust.phone} vehicle={remVehicle} />
      <CustomerAccount customer={account ? cust : null} onClose={() => setAccount(false)} onChanged={() => void load()} />
    </div>
  );
}

function Tile({ label, value, sub, onClick }: { label: string; value: React.ReactNode; sub?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn("min-w-0 rounded-[12px] bg-secondary/80 px-4 py-3", onClick && "cursor-pointer hover:bg-secondary")}>
      <div className="truncate text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className="mt-1 flex min-w-0 items-baseline gap-2 truncate text-[21px] font-bold tracking-[-0.02em] text-foreground">
        {value}{sub && <span className="font-mono text-[13px] font-medium text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

// The shop's note on this client — "only original parts, confirm prices on Telegram first".
// One note, as the client record holds one; editing it replaces it.
function NotesBox({ customer, onSaved, compact }: { customer: Customer; onSaved: (c: Customer) => void; compact?: boolean }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [draft, setDraft] = useState(customer.notes ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setDraft(customer.notes ?? ""); }, [customer.notes, editing]);
  const has = (customer.notes ?? "").trim().length > 0;
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const u = await api.updateCustomer(customer.id, {
        name: customer.name, phone: customer.phone, language: langFromProto(customer.language),
        telegramHandle: customer.telegramHandle ?? "", notes: draft.trim(), email: customer.email ?? "",
        address: customer.address ?? "", birthday: customer.birthday ?? "",
      });
      onSaved(u);
      setEditing(false);
      toast(t("save"), { icon: "check" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally { setSaving(false); }
  };
  return (
    <Card className="p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className={cn("font-bold tracking-[-0.02em] text-foreground", compact ? "text-[15px]" : "text-[14px]")}>{t("tab_notes")}</span>
        {has && !editing && <button onClick={() => setEditing(true)} className="text-[13px] font-semibold text-primary-emphasis hover:underline">{t("edit")}</button>}
      </div>
      {has && !editing && <div className="whitespace-pre-wrap rounded-[10px] bg-secondary/70 px-3 py-2.5 text-[13.5px] leading-relaxed text-ink-2">{customer.notes}</div>}
      {(editing || !has) && (
        <div className="flex flex-col gap-2">
          <Textarea value={draft} rows={3} placeholder={t("notes_ph")} onFocus={() => setEditing(true)}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)} />
          {editing && (
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={saving} onClick={save}>{saving ? <Spinner /> : t("save")}</Button>
              <Button size="sm" variant="secondary" disabled={saving} onClick={() => { setDraft(customer.notes ?? ""); setEditing(false); }}>{t("cancel")}</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
