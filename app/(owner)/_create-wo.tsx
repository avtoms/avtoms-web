"use client";
// Create-work-order flow, in the order the counter actually works in: price the job first,
// name the client last.
//
// Step 1 builds the job as a local draft — services and parts off the price list, a running
// total — and touches nothing on the server. Step 2 is the client: an existing car found by
// plate, or a new client + car typed in. Only "create" writes anything, and it writes the
// whole thing in one go: client, car, order, lines.
//
// That is the point of the reversal. The shop can quote a price before it has a record to
// quote it against, so a client who hears the total and walks away leaves nothing behind —
// no half-made customer, no empty draft order holding an order number nobody will ever ask
// for. The priced-up draft lives in this browser until it is either created or thrown away.
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Car, Trash2, Pencil, Check, ArrowLeft, ArrowRight, Package, Wrench, ClipboardList } from "lucide-react";
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
import type { Vehicle, LineItem } from "@/lib/types";
import { MakeModelPicker, PlateField, PhoneField, unitLabel } from "@/components/catalog-fields";
import { PlatePreview } from "@/components/plate";
import { isValidPlateFor } from "@/lib/plate";
import { orderLabel, money, num, qty as qtyFmt } from "@/lib/format";
import { PLATE_TYPES, plateTypeToProto, plateTypeFromProto, kindToProto, kindIsMaterial, type PlateType } from "@/lib/enums";
import { isValidUzPhone, toE164 } from "@/lib/phone";
import { ReminderRows, saveReminders, type ReminderDraft } from "@/components/reminder-rows";
import { tourPrefill } from "@/lib/tour-bridge";
import { cn } from "@/lib/utils";
import { AddLineItemModal, EditLineItemModal, type LineItemInput } from "./work-orders/[id]/_parts";

// The unpriced-order draft, kept per shop so two shops open in one browser do not share one.
// It is deliberately only this browser's: it is a quote in progress, not a record, and the
// moment it becomes a record it becomes a real order instead.
const draftKey = (shopId: string) => `an:wo-draft:${shopId}`;

function loadDraft(shopId: string): LineItemInput[] {
  try {
    const raw = window.localStorage.getItem(draftKey(shopId));
    if (!raw) return [];
    const d = JSON.parse(raw) as { lines?: LineItemInput[] };
    return Array.isArray(d?.lines) ? d.lines : [];
  } catch { return []; }
}

function saveDraft(shopId: string, lines: LineItemInput[]) {
  // Private windows and a full quota both throw here. A draft that cannot be stored is still
  // a usable draft for as long as the dialog is open, so this never interrupts anything.
  try {
    if (!lines.length) window.localStorage.removeItem(draftKey(shopId));
    else window.localStorage.setItem(draftKey(shopId), JSON.stringify({ v: 1, lines }));
  } catch { /* the draft just does not outlive the dialog */ }
}

export function CreateWOModal({ open, onClose, basePath = "/work-orders" }: { open: boolean; onClose: () => void; basePath?: string }) {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { lang, t } = useLang();
  const { toast } = useToast();
  const router = useRouter();

  const [step, setStep] = useState<"work" | "client">("work");
  // The job being priced up. Nothing here exists on the server yet.
  const [lines, setLines] = useState<LineItemInput[]>([]);
  // Whether those lines came back from a stored draft rather than being typed just now — so
  // the shop is told it is looking at yesterday's quote and can bin it in one press.
  const [restored, setRestored] = useState(false);
  const [addItem, setAddItem] = useState<null | "menu" | "custom">(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  // The "keep this as a draft?" question, asked when a priced-up order is closed unsaved.
  const [asking, setAsking] = useState(false);
  // A tour step is driving the dialog: its demo order must not touch the shop's own draft.
  const [tour, setTour] = useState(false);

  const [mode, setMode] = useState<"search" | "new">("search");
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Vehicle[]>([]);
  const [searching, setSearching] = useState(false);
  // The car this order is for, once one has been chosen. Choosing is now a selection rather
  // than the act of creating the order — the order is created from the footer, after the
  // shop has seen the car and the total together.
  const [picked, setPicked] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);

  const [cf, setCf] = useState({ name: "", phone: "", telegram: "", language: "uz" as Lang });
  const [vf, setVf] = useState({ plate: "", make: "", model: "", year: "", vin: "", mileage: "", plateType: "standard" as PlateType });
  const [reminders, setReminders] = useState<ReminderDraft[]>([]);
  // The reading on the dash when the car came in. Optional — a shop that does not take it
  // gets a gap in the book rather than a made-up number — but asked for here, because the
  // car is standing in front of whoever is typing and never will be again.
  const [odo, setOdo] = useState("");
  // Whether Create has been pressed on the new-client form — from then on, missing fields say so.
  const [tried, setTried] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTried(false); setMode("search"); setQ(""); setMatches([]); setPicked(null);
    setCf({ name: "", phone: "", telegram: "", language: "uz" });
    setVf({ plate: "", make: "", model: "", year: "", vin: "", mileage: "", plateType: "standard" as PlateType });
    setReminders([]); setOdo(""); setAddItem(null); setEditIdx(null); setAsking(false); setBusy(false);

    // The onboarding tour's demo client and car, when a tour step is asking for an order: the
    // shop sees this real form filled in and only has to press Create. The tour asks for the
    // client, so the dialog opens on the client step rather than on an empty price list.
    const demo = tourPrefill("order");
    if (demo) {
      setTour(true); setLines([]); setRestored(false); setStep("client"); setMode("new");
      setCf({ name: demo.name, phone: demo.phone, telegram: "", language: "uz" });
      setVf({ plate: demo.plate, make: demo.make, model: demo.model, year: String(demo.year), vin: "", mileage: "", plateType: "standard" });
      setOdo(String(demo.km));
      return;
    }
    setTour(false);
    const saved = loadDraft(shopId);
    setLines(saved); setRestored(saved.length > 0); setStep("work");
  }, [open, shopId]);

  // Keep the stored draft in step with what is on screen, so a reload or a closed laptop
  // does not lose a quote that has already been read out to somebody.
  React.useEffect(() => { if (open && !tour) saveDraft(shopId, lines); }, [open, tour, shopId, lines]);

  // The shop's own cars, loaded once the dialog opens, so an empty box already offers
  // something to pick rather than a blank panel.
  const [recent, setRecent] = React.useState<Vehicle[]>([]);
  React.useEffect(() => {
    if (!open) return;
    api.listShopVehicles(shopId).then((vs) => setRecent(vs.slice(0, 40))).catch(() => setRecent([]));
  }, [open, shopId]);

  React.useEffect(() => {
    if (step !== "client" || mode !== "search") return;
    const plate = q.trim();
    // Nothing typed: show what the shop already has. The server search needs a plate, so
    // this is the list rather than a query with an empty string.
    if (!plate) { setMatches(recent); setSearching(false); return; }
    setSearching(true);
    const h = setTimeout(async () => {
      try { setMatches(await api.searchVehicles(shopId, plate)); }
      catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(h);
  }, [q, step, mode, shopId, recent, t, toast]);

  /* ── the draft ── */
  const lineTotal = (l: LineItemInput) => num(l.unitPrice) * (l.quantity || 0);
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);
  const addLines = (items: LineItemInput[]) => { setLines((s) => [...s, ...items]); setAddItem(null); setRestored(false); };
  const removeLine = (i: number) => { setLines((s) => s.filter((_, j) => j !== i)); setRestored(false); };
  const clearDraft = () => { setLines([]); setRestored(false); };

  // EditLineItemModal edits a saved order's line, so it speaks in server shapes. A draft line
  // is the same numbers without an id yet; its index stands in for one.
  const editing = editIdx === null ? undefined : lines[editIdx];
  // Memoised because the dialog fills its fields from this object's identity: rebuilding it
  // on every render of this component would wipe whatever was half-typed into it.
  const editShim: LineItem | null = React.useMemo(() => editing ? {
    id: String(editIdx), kind: kindToProto(editing.kind), description: editing.description,
    unitPrice: String(editing.unitPrice), quantity: editing.quantity, cost: String(editing.cost ?? 0),
    variantId: editing.variantId, consumedQty: editing.consumedQty, unit: editing.unit,
  } : null, [editIdx, editing]);
  const saveEdit = (_id: string, f: { description: string; unitPrice: number; quantity: number; cost: number; consumedQty: number }) => {
    const at = editIdx;
    if (at === null) return;
    setLines((s) => s.map((l, j) => j === at ? {
      ...l, description: f.description, unitPrice: f.unitPrice, quantity: f.quantity, cost: f.cost,
      consumedQty: l.variantId ? f.consumedQty : undefined,
    } : l));
    setEditIdx(null);
  };

  /* ── committing ── */
  // Everything the two steps collected, written at once: client, car, reminders, order, lines.
  const createOrder = async () => {
    if (busy) return;
    let vehicleId = picked?.id ?? "";
    // For a car the shop already knows, the reading is recorded on the order itself, where
    // somebody can actually see the dash; only a car being entered for the first time has a
    // reading to hand here.
    let odometer = 0;
    if (mode === "search") {
      if (!vehicleId) { toast(t("wo_pick_car"), { icon: "alert", tone: "danger" }); return; }
    } else {
      // What is missing is said under the field that is missing it, not in a toast that names
      // nothing (and that stacked up once per click).
      setTried(true);
      if (!cf.phone.trim() || !vf.plate.trim()) return;
      if (!isValidUzPhone(cf.phone)) { toast(t("bad_phone"), { icon: "alert", tone: "danger" }); return; }
      if (!isValidPlateFor(vf.plate, vf.plateType)) { toast("Noto'g'ri davlat raqami", { icon: "alert", tone: "danger" }); return; }
    }
    setBusy(true);
    try {
      if (mode === "new") {
        const cust = await api.createCustomer(shopId, { phone: toE164(cf.phone), name: cf.name.trim(), language: cf.language, telegramHandle: cf.telegram.trim(), walkIn: false });
        const veh = await api.createVehicle({ customerId: cust.id, plate: vf.plate.trim(), vin: vf.vin.trim(), make: vf.make.trim(), model: vf.model.trim(), year: parseInt(vf.year, 10) || 0, mileage: parseInt(odo, 10) || 0, plateType: plateTypeToProto(vf.plateType) });
        // Attach the requested recurring service reminders to the new client + vehicle (best-effort;
        // never blocks opening the work order).
        try { await saveReminders(shopId, reminders, { customerName: cust.name, phone: cust.phone, vehicleId: veh.id, plate: veh.plate }); } catch { /* non-fatal */ }
        vehicleId = veh.id;
        odometer = parseInt(odo, 10) || 0;
      }
      const wo = await api.createWorkOrder(shopId, vehicleId, odometer);
      // The lines were priced before the order existed, so they go on now. If one fails the
      // order is already real: say so and open it, rather than silently dropping the rest.
      let failed = 0;
      for (const l of lines) {
        try { await api.addLineItem(wo.id, l); } catch { failed++; }
      }
      saveDraft(shopId, []);
      setLines([]); setRestored(false);
      if (failed) toast(t("wo_lines_failed"), { icon: "alert", tone: "danger" });
      else toast(t("wo_created") + " · " + orderLabel(wo), { icon: "clipboard" });
      onClose();
      router.push(`${basePath}/${wo.id}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      setBusy(false);
    }
  };

  /* ── closing ── */
  // Closing a priced-up order is the case the reversal exists for: the client has heard the
  // total and said no. Nothing has been created, so the only question left is whether the
  // quote is worth keeping for when they come back.
  const attemptClose = () => {
    if (busy) return;
    if (lines.length && !tour) { setAsking(true); return; }
    onClose();
  };
  const keepDraft = () => {
    saveDraft(shopId, lines); setAsking(false);
    toast(t("wo_draft_saved"), { icon: "clipboard" });
    onClose();
  };
  const discardDraft = () => {
    // Explicitly, because the autosave above is skipped once `open` is false.
    saveDraft(shopId, []); setLines([]); setRestored(false); setAsking(false);
    onClose();
  };

  const stepper = (
    <div className="mb-4 flex items-center gap-2.5">
      {([["work", t("wo_step_work")], ["client", t("customer")]] as const).map(([k, label], i) => {
        const active = step === k;
        const done = k === "work" && step === "client";
        return (
          <React.Fragment key={k}>
            {i > 0 && <span className="h-px flex-1 bg-border" />}
            <button
              type="button"
              disabled={k === "work" && step === "work"}
              onClick={() => k === "work" && setStep("work")}
              className={cn("inline-flex items-center gap-2 text-[13px] font-bold", active ? "text-foreground" : "text-muted-foreground")}
            >
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full font-mono text-[12px]",
                active ? "bg-primary text-primary-foreground" : done ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground")}>
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              {label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && attemptClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader><DialogTitle>{t("new_wo")}</DialogTitle></DialogHeader>
        <DialogBody className="py-1">
          {asking ? (
            <div className="flex flex-col items-center gap-3.5 py-8 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-warning-soft text-warning"><ClipboardList className="size-6" /></div>
              <div className="max-w-[360px] text-[15px] font-bold tracking-[-0.01em] text-foreground">{t("wo_close_q")}</div>
              <div className="font-mono text-[13px] text-muted-foreground">{lines.length} {t("wo_rows")} · {money(total)}</div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Button variant="ghost" onClick={() => setAsking(false)}><ArrowLeft /> {t("back")}</Button>
                <Button variant="destructive" onClick={discardDraft}><Trash2 /> {t("wo_discard_draft")}</Button>
                <Button onClick={keepDraft}>{t("wo_keep_draft")}</Button>
              </div>
            </div>
          ) : step === "work" ? (
            <div className="flex flex-col gap-3.5">
              {stepper}
              {restored && (
                <div className="flex items-center justify-between gap-3 rounded-[10px] bg-secondary px-3.5 py-2">
                  <span className="text-[13px] font-semibold text-foreground">{t("wo_draft_restored")}</span>
                  <Button size="sm" variant="ghost" onClick={clearDraft}><Trash2 /> {t("wo_discard_draft")}</Button>
                </div>
              )}
              {lines.length === 0 ? <Empty icon="list" text={t("wo_work_empty")} /> : (
                <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
                  {lines.map((l, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-[10px] border border-border bg-card px-3.5 py-2.5">
                      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-[8px]",
                        kindIsMaterial(l.kind) ? "bg-info-soft text-info" : "bg-primary-soft text-primary-emphasis")}>
                        {kindIsMaterial(l.kind) ? <Package className="size-4" /> : <Wrench className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-bold text-foreground">{l.description}</div>
                        {/* The unit travels beside the amount, never inside the name. */}
                        <div className="font-mono text-[12.5px] text-muted-foreground">
                          {qtyFmt(l.quantity)}{l.unit ? " " + unitLabel(t, l.unit) : ""} × {money(l.unitPrice)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <span className="mr-1 font-mono text-[14px] font-bold text-foreground">{money(lineTotal(l))}</span>
                        <Button size="icon-sm" variant="ghost" onClick={() => setEditIdx(i)} aria-label={t("edit")}><Pencil /></Button>
                        <Button size="icon-sm" variant="ghost" onClick={() => removeLine(i)} aria-label={t("remove")}><Trash2 /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 [&>button]:min-w-0 [&>button]:flex-1">
                <Button variant="secondary" onClick={() => setAddItem("menu")}><Plus /> {t("from_menu")}</Button>
                <Button variant="secondary" onClick={() => setAddItem("custom")}><Plus /> {t("custom_item")}</Button>
              </div>
              {lines.length > 0 && (
                <>
                  <Separator />
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-bold text-muted-foreground">{t("total")}</span>
                    <span className="font-mono text-[19px] font-bold tracking-[-0.02em] text-foreground">{money(total)}</span>
                  </div>
                </>
              )}
              <p className="text-[12.5px] leading-snug text-muted-foreground">{t("wo_work_hint")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {stepper}
              <Tabs value={mode} onValueChange={(v) => { setMode(v as "search" | "new"); setPicked(null); }}>
                <TabsList className="w-full">
                  <TabsTrigger value="search" className="flex-1">{t("search_plate_short")}</TabsTrigger>
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
                    {!searching && matches.length === 0 && <Empty icon="car" text={q.trim() ? t("empty") : t("no_vehicles_yet")} />}
                    {matches.map((v) => (
                      <button key={v.id} disabled={busy} onClick={() => setPicked(v)}
                        className={cn("flex items-center gap-3 rounded-[10px] border bg-card px-3.5 py-3 text-left transition-colors",
                          picked?.id === v.id ? "border-primary ring-2 ring-primary/15" : "border-border hover:bg-secondary")}>
                        <div className={cn("grid size-10 shrink-0 place-items-center rounded-[10px]",
                          picked?.id === v.id ? "bg-primary text-primary-foreground" : "bg-secondary text-ink-2")}>
                          {picked?.id === v.id ? <Check className="size-5" /> : <Car className="size-5" />}
                        </div>
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
                    <div className="flex flex-col gap-1">
                      <PhoneField label={t("phone")} value={cf.phone} onChange={(p) => setCf({ ...cf, phone: p })} invalidHint={t("bad_phone")} />
                      {tried && !cf.phone.trim() && <span className="text-[12px] font-medium text-destructive">{t("req_phone")}</span>}
                    </div>
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
                  <div className="flex flex-col gap-1">
                    <PlateField value={vf.plate} onChange={(p) => setVf((s) => ({ ...s, plate: p }))} label={t("plate")} type={vf.plateType} />
                    {tried && !vf.plate.trim() && <span className="text-[12px] font-medium text-destructive">{t("req_plate")}</span>}
                  </div>
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

              {/* What is about to be created, on the screen where it gets created. */}
              {lines.length > 0 && (
                <>
                  <Separator />
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-bold text-muted-foreground">{lines.length} {t("wo_rows")}</span>
                    <span className="font-mono text-[17px] font-bold tracking-[-0.02em] text-foreground">{money(total)}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogBody>
        {!asking && (
          <DialogFooter>
            {step === "work" ? (
              <>
                <Button variant="ghost" onClick={attemptClose}>{t("cancel")}</Button>
                <Button onClick={() => setStep("client")}>{t("next")} <ArrowRight /></Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setStep("work")} disabled={busy}><ArrowLeft /> {t("back")}</Button>
                <Button onClick={createOrder} disabled={busy || (mode === "search" && !picked)}>
                  {busy ? <Spinner /> : <><Plus /> {t("create_wo")}</>}
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>

      {/* The same price-list picker the order screen uses — it hands back lines rather than
          saving them, which is exactly what a draft needs. */}
      <AddLineItemModal
        open={addItem !== null}
        initialMode={addItem ?? "menu"}
        onClose={() => setAddItem(null)}
        onAdd={addLines}
        shopId={shopId}
        lang={lang}
        busy={false}
      />
      <EditLineItemModal item={editShim} onClose={() => setEditIdx(null)} onSave={saveEdit} busy={false} />
    </Dialog>
  );
}
