"use client";
// Service reminders: upcoming maintenance due per vehicle (oil change, inspection, ...).
// Grouped into overdue / upcoming / no-date; add, mark done, dismiss.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Badge, Btn, Modal, Field, TextInput, SelectInput, Segmented, Spinner, Empty, SkeletonRows } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { reminderStateFromProto, reminderStateToProto } from "@/lib/enums";
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: tone === "danger" ? "var(--danger)" : "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 4px" }}>{t(key)} · {items.length}</div>
        <Card pad={0}>
          {items.map((m) => {
            const st = reminderStateFromProto(m.state);
            return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 18px", borderBottom: "1px solid var(--line)", opacity: completed ? 0.6 : 1 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: completed ? "var(--surface-2)" : "var(--accent-soft)", color: completed ? "var(--ink-3)" : "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={completed ? "check" : "bell"} size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))", textDecoration: completed ? "line-through" : "none" }}>{m.title}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {m.dueDate ? <span>{dateStr(m.dueDate)}</span> : <span>{t("no_due_date")}</span>}
                  {!!m.dueMileage && <span style={{ fontFamily: "var(--font-mono)" }}>· {m.dueMileage.toLocaleString()} km</span>}
                  {isRecurring(m) && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent-2)", fontWeight: 600 }}>
                      <Icon name="history" size={12} /> {t("rem_every")} {[m.repeatMonths ? `${m.repeatMonths} ${t("rem_months_n")}` : "", m.repeatKm ? `${m.repeatKm.toLocaleString()} km` : ""].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {m.customerName && <span>· {m.customerName}</span>}
                  {m.plate && <PlatePreview plate={m.plate} size="sm" />}
                </div>
              </div>
              {completed ? (
                <Badge tone={st === "done" ? "ok" : "neutral"} dot>{st === "done" ? t("st_done") : t("st_dismissed")}</Badge>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn variant="soft" size="sm" icon="check" disabled={busy} onClick={() => setState(m, "done")}>{t("mark_done")}</Btn>
                  <Btn variant="ghost" size="sm" disabled={busy} onClick={() => setState(m, "dismissed")} style={{ color: "var(--ink-3)" }}>{t("dismiss")}</Btn>
                </div>
              )}
            </div>
          ); })}
        </Card>
      </div>
    );

  const empty = overdue.length === 0 && upcoming.length === 0 && undated.length === 0 && done.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn variant="primary" icon="plus" onClick={() => setAdding(true)}>{t("add_reminder")}</Btn>
      </div>
      {loading && empty ? <Card pad={0}><SkeletonRows rows={5} /></Card>
        : empty ? <Card pad={24}><Empty icon="bell" text={t("no_reminders")} /></Card>
        : <>
            {section("overdue", overdue, "danger")}
            {section("upcoming", upcoming, "accent")}
            {section("no_due_date", undated, "neutral")}
            {section("reminders_done", done, "neutral", true)}
          </>}
      <AddModal open={adding} onClose={() => setAdding(false)} shopId={shopId} onCreated={load} />
    </div>
  );
}

function AddModal({ open, onClose, shopId, onCreated }: { open: boolean; onClose: () => void; shopId: string; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ title: "", customerId: "", customerName: "", phone: "", vehicleId: "", plate: "", due: "", mileage: "", repeat: false, repMonths: "", repKm: "" });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [busy, setBusy] = useState(false);

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
    <Modal open={open} onClose={onClose} title={t("add_reminder")} maxWidth={480}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label={t("reminder_title")}><TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("reminder_title")} /></Field>
        <Field label={t("nav_customers")}>
          <SelectInput value={f.customerId} onChange={(e) => pickCustomer(e.target.value)}>
            <option value="">—</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? " · " + c.phone : ""}</option>)}
          </SelectInput>
        </Field>
        {f.customerId && (
          <Field label={t("vehicle")}>
            <SelectInput value={f.vehicleId} onChange={(e) => pickVehicle(e.target.value)}>
              <option value="">—</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{[v.make, v.model].filter(Boolean).join(" ")} · {v.plate}</option>)}
            </SelectInput>
          </Field>
        )}
        {f.plate && <span style={{ display: "inline-block" }}><PlatePreview plate={f.plate} size="sm" /></span>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("due_date")}><TextInput type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
          <Field label={t("due_mileage")}><TextInput value={f.mileage} onChange={(e) => setF({ ...f, mileage: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></Field>
        </div>

        {/* Recurrence: optional. When on, completing the reminder auto-creates the next one. */}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: "calc(14px * var(--scale))", fontWeight: 600, color: "var(--ink)" }}>{t("rem_repeat")}</span>
            <Segmented options={[{ value: "off", label: t("no") }, { value: "on", label: t("yes") }]} value={f.repeat ? "on" : "off"} onChange={(v) => setF({ ...f, repeat: v === "on" })} />
          </div>
          {f.repeat && (
            <>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("rem_repeat_hint")}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[3, 6, 12].map((n) => (
                  <button key={n} type="button" onClick={() => setF((s) => ({ ...s, repMonths: String(n) }))} className="an-btn" style={{
                    padding: "6px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 13,
                    border: "1px solid " + (repMonths === n ? "var(--accent)" : "var(--line)"), background: repMonths === n ? "var(--accent-soft)" : "var(--surface)", color: repMonths === n ? "var(--accent-2)" : "var(--ink-2)",
                  }}>{n} {t("rem_months_n")}</button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label={t("rem_interval_months")}><TextInput value={f.repMonths} onChange={(e) => setF({ ...f, repMonths: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="6" style={{ fontFamily: "var(--font-mono)" }} /></Field>
                <Field label={t("rem_interval_km")}><TextInput value={f.repKm} onChange={(e) => setF({ ...f, repKm: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="10000" style={{ fontFamily: "var(--font-mono)" }} /></Field>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{t("rem_interval_hint")}</div>
            </>
          )}
        </div>

        <div style={{ fontSize: 12, color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="tg" size={14} /> {t("reminder_tg_hint")}
        </div>
      </div>
    </Modal>
  );
}
