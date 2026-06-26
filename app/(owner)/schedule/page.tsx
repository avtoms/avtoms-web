"use client";
// Appointments / scheduling: upcoming bookings grouped by day; add, mark done, cancel.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Badge, Btn, Modal, Field, TextInput, SelectInput, Spinner, Empty } from "@/components/ui";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { apptStateFromProto, apptStateToProto } from "@/lib/enums";
import type { Appointment, Staff } from "@/lib/types";

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn variant="primary" icon="plus" onClick={() => setAdding(true)}>{t("add_appointment")}</Btn>
      </div>
      {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={24} /></div>
        : list.length === 0 ? <Card pad={24}><Empty icon="clock" text={t("no_appointments")} /></Card>
        : groups.map(([day, items]) => (
          <div key={day} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 4px" }}>{day}</div>
            <Card pad={0}>
              {items.map((a) => {
                const st = apptStateFromProto(a.state);
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 18px", borderBottom: "1px solid var(--line)", opacity: st === "canceled" ? 0.5 : 1 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, color: "var(--ink)", fontSize: 15, minWidth: 52 }}>{timeStr(a.scheduledAt)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{a.title || t("vehicle")}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {a.customerName && <span>{a.customerName}</span>}
                        {a.plate && <span style={{ fontFamily: "var(--font-mono)" }}>· {a.plate}</span>}
                        {mechName(a.mechanicId) && <span>· {mechName(a.mechanicId)}</span>}
                        {!!a.durationMinutes && <span>· {a.durationMinutes}m</span>}
                      </div>
                    </div>
                    {st === "scheduled" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn variant="soft" size="sm" icon="check" disabled={busy} onClick={() => setState(a, "done")}>{t("mark_done")}</Btn>
                        <Btn variant="ghost" size="sm" disabled={busy} onClick={() => setState(a, "canceled")} style={{ color: "var(--danger)" }}>{t("cancel")}</Btn>
                      </div>
                    ) : <Badge tone={st === "done" ? "ok" : "neutral"} dot>{st === "done" ? t("st_done") : t("cancel")}</Badge>}
                  </div>
                );
              })}
            </Card>
          </div>
        ))}
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
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ title: "", customer: "", phone: "", plate: "", when: defaultWhen(), duration: "60", mechanicId: "", notes: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ title: "", customer: "", phone: "", plate: "", when: defaultWhen(), duration: "60", mechanicId: "", notes: "" }); }, [open]);

  const save = async () => {
    if (!f.title.trim() || !f.when || busy) return;
    setBusy(true);
    try {
      await api.createAppointment(shopId, {
        title: f.title.trim(), customerName: f.customer.trim(), phone: f.phone.trim(), plate: f.plate.trim(),
        mechanicId: f.mechanicId || undefined, scheduledAt: new Date(f.when).toISOString(),
        durationMinutes: parseInt(f.duration, 10) || 0, notes: f.notes.trim(),
      });
      toast(t("save"), { icon: "check" }); onClose(); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("add_appointment")} maxWidth={480}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label={t("description")}><TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("service")} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 10 }}>
          <Field label={t("appt_when")}><TextInput type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} /></Field>
          <Field label={t("duration_min")}><TextInput value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("name")}><TextInput value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} /></Field>
          <Field label={t("phone")}><TextInput value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" style={{ fontFamily: "var(--font-mono)" }} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("plate")}><TextInput value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value.toUpperCase() })} style={{ fontFamily: "var(--font-mono)" }} /></Field>
          <Field label={t("mechanic")}>
            <SelectInput value={f.mechanicId} onChange={(e) => setF({ ...f, mechanicId: e.target.value })}>
              <option value="">—</option>
              {mechanics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </SelectInput>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
