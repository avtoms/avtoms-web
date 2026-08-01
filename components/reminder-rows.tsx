"use client";
// Inline editor for draft service reminders, embedded in the add-customer and new-work-order
// flows so a shop can set up repeatable maintenance (oil change, inspection, ...) the moment a
// client is created. Recurrence is implied by an interval: when repeat months and/or km are set,
// completing the reminder auto-creates the next occurrence (handled by the backend).
import React from "react";
import { Plus, Trash2, Repeat } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Field } from "@/components/ui-kit/label";
import { SuggestInput } from "@/components/suggest-input";
import { useLang } from "@/components/providers";
import { api } from "@/lib/api";
import { useServiceNames } from "@/lib/use-services";

export type ReminderDraft = { id: string; title: string; due: string; mileage: string; repMonths: string; repKm: string };

let seq = 0;
const nextId = () => `r${++seq}`;
export const emptyReminder = (): ReminderDraft => ({ id: nextId(), title: "", due: "", mileage: "", repMonths: "", repKm: "" });

// Fallback one-tap presets, used only by a shop whose price list is still empty. Once there is
// a price list, the chips below come from it instead — a shop's own services beat a guess at
// what a shop does.
const PRESETS: { key: string; months: string; km: string }[] = [
  { key: "preset_oil", months: "6", km: "10000" },
  { key: "preset_inspection", months: "12", km: "" },
  { key: "preset_insurance", months: "12", km: "" },
  { key: "preset_air_filter", months: "12", km: "15000" },
];

// Map a draft (+ the client/vehicle it belongs to) to a createReminder payload. Empty when no title.
export function reminderPayload(d: ReminderDraft, ctx: { customerName?: string; phone?: string; vehicleId?: string; plate?: string }) {
  return {
    title: d.title.trim(),
    vehicleId: ctx.vehicleId || undefined,
    customerName: ctx.customerName ?? "",
    phone: ctx.phone ?? "",
    plate: ctx.plate ?? "",
    dueDate: d.due ? new Date(d.due + "T12:00:00").toISOString() : undefined,
    dueMileage: parseInt(d.mileage, 10) || 0,
    notes: "",
    repeatMonths: parseInt(d.repMonths, 10) || 0,
    repeatKm: parseInt(d.repKm, 10) || 0,
  };
}

// Persist every titled draft for a freshly created client. Best-effort: reminder failures are
// reported by the caller but must not undo the client/vehicle that was already created.
export async function saveReminders(shopId: string, drafts: ReminderDraft[], ctx: { customerName?: string; phone?: string; vehicleId?: string; plate?: string }) {
  const valid = drafts.filter((d) => d.title.trim());
  await Promise.all(valid.map((d) => api.createReminder(shopId, reminderPayload(d, ctx))));
}

export function ReminderRows({ value, onChange }: { value: ReminderDraft[]; onChange: (v: ReminderDraft[]) => void }) {
  const { t } = useLang();
  const services = useServiceNames();
  const set = (id: string, patch: Partial<ReminderDraft>) => onChange(value.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = (patch?: Partial<ReminderDraft>) => onChange([...value, { ...emptyReminder(), ...patch }]);
  const del = (id: string) => onChange(value.filter((r) => r.id !== id));

  // A service off the price list carries no interval — the price list says what a job costs,
  // not how often it comes round. Where its name is one of the presets above (most shops do
  // call it "Moy almashtirish"), that preset's interval comes with it; otherwise the interval
  // is left to be filled in, with its placeholders showing the usual answer.
  const chips: { label: string; title: string; months: string; km: string }[] = services.length > 0
    ? services.slice(0, 6).map((name) => {
        const p = PRESETS.find((x) => t(x.key).toLowerCase() === name.toLowerCase());
        return { label: name, title: name, months: p?.months ?? "", km: p?.km ?? "" };
      })
    : PRESETS.map((p) => ({ label: t(p.key), title: t(p.key), months: p.months, km: p.km }));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[12.5px] font-semibold text-muted-foreground">{t("svc_reminders")}</span>
          <p className="text-[11.5px] text-muted-foreground">{t("svc_reminders_hint")}</p>
        </div>
        <Button variant="soft" size="sm" onClick={() => add()} className="shrink-0"><Plus /> {t("add_reminder")}</Button>
      </div>
      {/* one tap per service the shop actually sells */}
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <Button key={c.label} type="button" variant="secondary" size="sm"
            onClick={() => add({ title: c.title, repMonths: c.months, repKm: c.km })}>
            <Plus className="size-3.5" /> {c.label}
          </Button>
        ))}
      </div>

      {value.map((r) => {
        const recurring = (parseInt(r.repMonths, 10) || 0) > 0 || (parseInt(r.repKm, 10) || 0) > 0;
        return (
          <div key={r.id} className="flex flex-col gap-2 rounded-[10px] border border-border bg-secondary/30 p-2.5">
            <div className="flex items-end gap-2">
              <Field label={t("reminder_title")} className="flex-1">
                <SuggestInput value={r.title} options={services} max={20} placeholder={t("reminder_title")}
                  onChange={(v) => set(r.id, { title: v })} />
              </Field>
              <Button variant="ghost" size="icon" onClick={() => del(r.id)} aria-label="remove" className="mb-0.5 shrink-0 text-destructive hover:bg-destructive-soft"><Trash2 /></Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("due_date")}><Input type="date" value={r.due} onChange={(e) => set(r.id, { due: e.target.value })} /></Field>
              <Field label={t("due_mileage")}><Input value={r.mileage} inputMode="numeric" className="font-mono" onChange={(e) => set(r.id, { mileage: e.target.value.replace(/\D/g, "") })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("rem_interval_months")}><Input value={r.repMonths} inputMode="numeric" placeholder="6" className="font-mono" onChange={(e) => set(r.id, { repMonths: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label={t("rem_interval_km")}><Input value={r.repKm} inputMode="numeric" placeholder="10000" className="font-mono" onChange={(e) => set(r.id, { repKm: e.target.value.replace(/\D/g, "") })} /></Field>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Repeat className="size-3.5" /> {recurring ? t("rem_recurring_on") : t("rem_interval_hint")}
            </div>
          </div>
        );
      })}
    </div>
  );
}
