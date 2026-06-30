"use client";
// Customers (owner-pages.jsx CustomersPage): debounced search, new-customer modal,
// detail modal with add-vehicle. Wired to api.listCustomers / createCustomer / createVehicle.
import React, { useCallback, useEffect, useState } from "react";
import { Card, Badge, Avatar, Btn, Modal, Field, TextInput, SelectInput, Segmented, Spinner, Empty } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { LANGS, type Lang } from "@/lib/i18n";
import { PLATE_TYPES, plateTypeToProto, plateTypeFromProto, langFromProto, type PlateType } from "@/lib/enums";
import { STATE_LABEL, woStateFromProto } from "@/lib/enums";
import { money } from "@/lib/format";
import type { Customer, Vehicle, WorkOrder, Warranty } from "@/lib/types";
import { SecTitle } from "../_shared";
import { MakeModelPicker, PlateField, PhoneField } from "@/components/catalog-fields";
import { PlatePreview } from "@/components/plate";
import { isValidPlateFor } from "@/lib/plate";
import { isValidUzPhone, toE164 } from "@/lib/phone";

export default function CustomersPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [q, setQ] = useState("");
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<Customer | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try { setList(await api.listCustomers(shopId, query.trim() || undefined)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  // debounced search
  useEffect(() => { const h = setTimeout(() => load(q), 300); return () => clearTimeout(h); }, [q, load]);

  // Deep link from the Cars view (?focus=<customerId>) opens that customer's detail.
  // Read from window (not useSearchParams) to avoid a Suspense boundary at prerender.
  useEffect(() => {
    const focusId = new URLSearchParams(window.location.search).get("focus");
    if (!focusId) return;
    let on = true;
    api.getCustomer(focusId).then((c) => { if (on) setSel(c); }).catch(() => {});
    return () => { on = false; };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Icon name="search" size={17} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }} />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search") + "…"} style={{ paddingLeft: 38 }} />
        </div>
        <Btn variant="primary" icon="plus" onClick={() => setAdding(true)}>{t("new_customer")}</Btn>
      </div>
      <Card pad={0}>
        {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={24} /></div>
          : list.length === 0 ? <div style={{ padding: 24 }}><Empty icon="users" /></div>
          : list.map((c) => (
            <button key={c.id} onClick={() => setSel(c)} className="an-row-btn" style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", padding: "13px 18px", border: "none", borderBottom: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left" }}>
              <Avatar name={c.walkIn ? "?" : c.name} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))", display: "flex", alignItems: "center", gap: 8 }}>{c.walkIn ? t("walk_in") : c.name}{c.walkIn && <Badge tone="neutral">{t("walk_in")}</Badge>}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{c.phone}{c.telegramHandle ? " · " + c.telegramHandle : ""}</div>
              </div>
              <Icon name="chevR" size={16} style={{ color: "var(--ink-3)" }} />
            </button>
          ))}
      </Card>
      <AddCustomerModal open={adding} onClose={() => setAdding(false)} shopId={shopId} onCreated={() => load(q)} />
      <CustomerDetailModal customer={sel} onClose={() => setSel(null)} onChanged={() => load(q)} />
    </div>
  );
}

function AddCustomerModal({ open, onClose, shopId, onCreated }: { open: boolean; onClose: () => void; shopId: string; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", phone: "", telegram: "", language: "uz" as Lang, walkIn: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ name: "", phone: "", telegram: "", language: "uz", walkIn: false }); }, [open]);

  const save = async () => {
    if (!f.phone.trim() || busy) return;
    if (!isValidUzPhone(f.phone)) { toast(t("bad_phone"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      await api.createCustomer(shopId, { phone: toE164(f.phone), name: f.name.trim(), language: f.language, telegramHandle: f.telegram.trim(), walkIn: f.walkIn });
      toast(t("save"), { icon: "check" }); onClose(); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("new_customer")} maxWidth={440}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label={t("name")}><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <PhoneField label={t("phone")} value={f.phone} onChange={(p) => setF({ ...f, phone: p })} invalidHint={t("bad_phone")} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={t("telegram")}><TextInput value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} placeholder="@username" /></Field>
          <Field label={t("language")}><SelectInput value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as Lang })}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</SelectInput></Field>
        </div>
        <button onClick={() => setF({ ...f, walkIn: !f.walkIn })} className="an-btn" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 13px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--surface)", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
          <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: 14 }}>{t("walk_in")}</span>
          <div style={{ width: 42, height: 24, borderRadius: 99, background: f.walkIn ? "var(--accent)" : "var(--surface-3)", position: "relative" }}>
            <div style={{ position: "absolute", top: 3, left: f.walkIn ? 21 : 3, width: 18, height: 18, borderRadius: 99, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
          </div>
        </button>
      </div>
    </Modal>
  );
}

function CustomerDetailModal({ customer, onClose, onChanged }: { customer: Customer | null; onClose: () => void; onChanged: () => void }) {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();
  const [cust, setCust] = useState<Customer | null>(customer);
  const [addV, setAddV] = useState(false);
  const [editCust, setEditCust] = useState(false);
  const [editVeh, setEditVeh] = useState<Vehicle | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vloading, setVloading] = useState(false);
  const [histVehicle, setHistVehicle] = useState<Vehicle | null>(null);

  useEffect(() => { setCust(customer); }, [customer]);

  const loadVehicles = useCallback(async (id: string) => {
    setVloading(true);
    try { setVehicles(await api.listVehicles(id)); }
    catch { /* surfaced as empty */ }
    finally { setVloading(false); }
  }, []);

  // (Re)load when the modal is showing the detail view (also after sub-modals close).
  useEffect(() => { if (customer && !addV && !editVeh) loadVehicles(customer.id); }, [customer, addV, editVeh, loadVehicles]);

  if (!customer || !cust) return null;
  const detailOpen = !!customer && !addV && !editCust && !editVeh;
  return (
    <>
      <Modal open={detailOpen} onClose={onClose} title={cust.walkIn ? t("walk_in") : cust.name} maxWidth={460}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={cust.walkIn ? "?" : cust.name} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: "calc(17px * var(--scale))" }}>{cust.walkIn ? t("walk_in") : cust.name}</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{cust.phone}{cust.telegramHandle ? " · " + cust.telegramHandle : ""}{cust.telegramChatId ? " · TG ✓" : ""}</div>
              {(cust.email || cust.address) && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{[cust.email, cust.address].filter(Boolean).join(" · ")}</div>}
              {cust.notes && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2, fontStyle: "italic" }}>{cust.notes}</div>}
            </div>
            <Btn variant="soft" size="sm" icon="edit" onClick={() => setEditCust(true)}>{t("edit")}</Btn>
          </div>
          <Card pad={0}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <SecTitle>{t("vehicles")}</SecTitle><Btn variant="soft" size="sm" icon="plus" onClick={() => setAddV(true)}>{t("add_vehicle")}</Btn>
            </div>
            {vloading ? <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner size={20} /></div>
              : vehicles.length === 0 ? <div style={{ padding: 20 }}><Empty icon="car" text={t("empty")} /></div>
              : vehicles.map((v) => (
                <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="car" size={20} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14px * var(--scale))" }}>{[v.make, v.model].filter(Boolean).join(" ") || t("vehicle")}{v.year ? " · " + v.year : ""}{v.color ? " · " + v.color : ""}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
                      <PlatePreview plate={v.plate} type={plateTypeFromProto(v.plateType)} size="sm" />
                      {Number(v.mileage) > 0 ? " · " + v.mileage + " km" : ""}
                    </div>
                  </div>
                  <Btn variant="ghost" size="sm" icon="edit" onClick={() => setEditVeh(v)} aria-label={t("edit")} />
                  <Btn variant="ghost" size="sm" icon="clock" onClick={() => setHistVehicle(v)}>{t("history")}</Btn>
                </div>
              ))}
          </Card>
        </div>
      </Modal>
      <EditCustomerModal customer={editCust ? cust : null} onClose={() => setEditCust(false)} onSaved={(updated) => { setCust(updated); setEditCust(false); onChanged(); }} />
      <EditVehicleModal vehicle={editVeh} shopId={shopId} onClose={() => setEditVeh(null)} onDone={() => { setEditVeh(null); }} />
      <AddVehicleModal open={addV} onClose={() => setAddV(false)} customerId={customer.id} onCreated={() => { toast(t("save"), { icon: "check" }); setAddV(false); }} />
      <VehicleHistoryModal vehicle={histVehicle} shopId={shopId} onClose={() => setHistVehicle(null)} />
    </>
  );
}

function EditCustomerModal({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: (c: Customer) => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", phone: "", telegram: "", language: "uz" as Lang, notes: "", email: "", address: "", birthday: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (customer) setF({
      name: customer.name, phone: customer.phone, telegram: customer.telegramHandle ?? "",
      language: langFromProto(customer.language), notes: customer.notes ?? "", email: customer.email ?? "",
      address: customer.address ?? "", birthday: customer.birthday ?? "",
    });
  }, [customer]);
  if (!customer) return null;

  const save = async () => {
    if (!f.phone.trim() || busy) return;
    if (!isValidUzPhone(f.phone)) { toast(t("bad_phone"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      const updated = await api.updateCustomer(customer.id, {
        name: f.name.trim(), phone: toE164(f.phone), language: f.language, telegramHandle: f.telegram.trim(),
        notes: f.notes.trim(), email: f.email.trim(), address: f.address.trim(), birthday: f.birthday,
      });
      toast(t("save"), { icon: "check" }); onSaved(updated);
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={!!customer} onClose={onClose} title={t("edit")} maxWidth={460}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label={t("name")}><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <PhoneField label={t("phone")} value={f.phone} onChange={(p) => setF({ ...f, phone: p })} invalidHint={t("bad_phone")} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("telegram")}><TextInput value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} placeholder="@username" /></Field>
          <Field label={t("language")}><SelectInput value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as Lang })}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</SelectInput></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("email")}><TextInput value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} inputMode="email" /></Field>
          <Field label={t("birthday")}><TextInput type="date" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} /></Field>
        </div>
        <Field label={t("address")}><TextInput value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label={t("notes")}><TextInput value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function EditVehicleModal({ vehicle, shopId, onClose, onDone }: { vehicle: Vehicle | null; shopId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ plate: "", make: "", model: "", year: "", vin: "", mileage: "", plateType: "standard" as PlateType, color: "", engine: "", transmission: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  useEffect(() => {
    if (vehicle) setF({
      plate: vehicle.plate, make: vehicle.make ?? "", model: vehicle.model ?? "", year: vehicle.year ? String(vehicle.year) : "",
      vin: vehicle.vin ?? "", mileage: vehicle.mileage ? String(vehicle.mileage) : "", plateType: plateTypeFromProto(vehicle.plateType),
      color: vehicle.color ?? "", engine: vehicle.engine ?? "", transmission: vehicle.transmission ?? "", notes: vehicle.notes ?? "",
    });
  }, [vehicle]);
  if (!vehicle) return null;

  const save = async () => {
    if (!f.plate.trim() || busy) return;
    if (!isValidPlateFor(f.plate, f.plateType)) { toast("Noto'g'ri davlat raqami", { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      await api.updateVehicle(vehicle.id, {
        plate: f.plate.trim(), vin: f.vin.trim(), make: f.make.trim(), model: f.model.trim(),
        year: parseInt(f.year, 10) || 0, mileage: parseInt(f.mileage, 10) || 0, plateType: plateTypeToProto(f.plateType),
        color: f.color.trim(), engine: f.engine.trim(), transmission: f.transmission.trim(), notes: f.notes.trim(),
      });
      toast(t("save"), { icon: "check" }); onDone();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (busy) return; setBusy(true);
    try { await api.deleteVehicle(vehicle.id); toast(t("deleted"), { icon: "check" }); onDone(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); setDel(false); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={!!vehicle} onClose={onClose} title={t("edit")} maxWidth={460}
      footer={<>
        <Btn variant="ghost" disabled={busy} onClick={() => setDel(true)} style={{ color: "var(--danger)", marginRight: "auto" }} icon="trash">{t("delete")}</Btn>
        <Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn>
        <Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn>
      </>}>
      {del ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 14, color: "var(--ink-2)" }}>{t("confirm_delete_vehicle")}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="ghost" disabled={busy} onClick={() => setDel(false)}>{t("cancel")}</Btn>
            <Btn variant="primary" disabled={busy} onClick={doDelete} style={{ background: "var(--danger)" }}>{busy ? <Spinner /> : t("delete")}</Btn>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={t("plate_type")}>
            <Segmented options={PLATE_TYPES.map((p) => ({ value: p, label: t("pt_" + p) }))} value={f.plateType} onChange={(v) => setF((s) => ({ ...s, plateType: v as PlateType }))} style={{ width: "100%" }} />
          </Field>
          <PlateField value={f.plate} onChange={(p) => setF((s) => ({ ...s, plate: p }))} label={t("plate")} type={f.plateType} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: 12 }}>
            <MakeModelPicker make={f.make} model={f.model} onChange={(mk, md) => setF((s) => ({ ...s, make: mk, model: md }))} labels={{ make: t("make"), model: t("model") }} />
            <Field label={t("year")}><TextInput value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
            <Field label={t("vin")}><TextInput value={f.vin} onChange={(e) => setF({ ...f, vin: e.target.value.toUpperCase() })} style={{ fontFamily: "var(--font-mono)" }} /></Field>
            <Field label={t("mileage")}><TextInput value={f.mileage} onChange={(e) => setF({ ...f, mileage: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label={t("color")}><TextInput value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
            <Field label={t("engine")}><TextInput value={f.engine} onChange={(e) => setF({ ...f, engine: e.target.value })} /></Field>
            <Field label={t("transmission")}><TextInput value={f.transmission} onChange={(e) => setF({ ...f, transmission: e.target.value })} /></Field>
          </div>
          <Field label={t("notes")}><TextInput value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
      )}
    </Modal>
  );
}

function warrantyStatus(w: Warranty): "active" | "expired" | "voided" {
  if (w.voided) return "voided";
  if (w.expiresOn && new Date(w.expiresOn).getTime() < Date.now()) return "expired";
  return "active";
}

function VehicleHistoryModal({ vehicle, shopId, onClose }: { vehicle: Vehicle | null; shopId: string; onClose: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingW, setAddingW] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadWarranties = useCallback(() => {
    if (!vehicle) return;
    api.listWarranties(shopId, vehicle.id).then(setWarranties).catch(() => setWarranties([]));
  }, [vehicle, shopId]);

  useEffect(() => {
    if (!vehicle) return;
    setLoading(true); setAddingW(false);
    api.listWorkOrders(shopId, undefined, undefined, vehicle.id)
      .then((o) => setOrders([...o].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
    loadWarranties();
  }, [vehicle, shopId, loadWarranties]);

  const voidW = async (id: string) => {
    if (busy) return; setBusy(true);
    try { await api.voidWarranty(id); loadWarranties(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  if (!vehicle) return null;
  const title = [vehicle.make, vehicle.model].filter(Boolean).join(" ") || t("vehicle");
  return (
    <Modal open={!!vehicle} onClose={onClose} title={t("service_history")} maxWidth={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 8 }}>{title} <PlatePreview plate={vehicle.plate} type={plateTypeFromProto(vehicle.plateType)} size="sm" /></div>

        {/* warranties */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("warranties")}</div>
            {!addingW && <Btn variant="soft" size="sm" icon="plus" onClick={() => setAddingW(true)}>{t("add_warranty")}</Btn>}
          </div>
          {addingW && <AddWarrantyInline shopId={shopId} vehicleId={vehicle.id} onClose={() => setAddingW(false)} onCreated={() => { setAddingW(false); loadWarranties(); }} />}
          {warranties.length > 0 && (
            <Card pad={0}>
              {warranties.map((w) => {
                const s = warrantyStatus(w);
                return (
                  <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--line)", opacity: s === "active" ? 1 : 0.6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(13.5px * var(--scale))" }}>{w.title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)", display: "flex", gap: 7, flexWrap: "wrap" }}>
                        {!!w.months && <span>{w.months} {t("months")}</span>}
                        {!!Number(w.kmLimit) && <span style={{ fontFamily: "var(--font-mono)" }}>· {Number(w.kmLimit).toLocaleString()} km</span>}
                        {w.expiresOn && <span>· {t("until")} {new Date(w.expiresOn).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <Badge tone={s === "active" ? "ok" : s === "expired" ? "warn" : "neutral"} dot>{t("warranty_" + s)}</Badge>
                    {s === "active" && <Btn variant="ghost" size="sm" disabled={busy} onClick={() => voidW(w.id)} style={{ color: "var(--ink-3)" }}>{t("void")}</Btn>}
                  </div>
                );
              })}
            </Card>
          )}
        </div>

        {/* service history */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("service_history")}</div>
        <Card pad={0}>
          {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Spinner size={20} /></div>
            : orders.length === 0 ? <div style={{ padding: 24 }}><Empty icon="clock" text={t("no_history")} /></div>
            : orders.map((o) => {
              const st = woStateFromProto(o.state);
              return (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(13.5px * var(--scale))" }}>
                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "—"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{(o.lineItems?.length ?? 0)} {t("items").toLowerCase()}</div>
                  </div>
                  <Badge tone={st === "closed" ? "ok" : st === "canceled" ? "neutral" : "accent"} dot>{t(STATE_LABEL[st])}</Badge>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: "calc(13.5px * var(--scale))", minWidth: 80, textAlign: "right" }}>{money(o.total ?? 0)}</div>
                </div>
              );
            })}
        </Card>
      </div>
    </Modal>
  );
}

function AddWarrantyInline({ shopId, vehicleId, onClose, onCreated }: { shopId: string; vehicleId: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ title: "", months: "6", km: "" });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!f.title.trim() || busy) return;
    setBusy(true);
    try {
      await api.createWarranty(shopId, {
        title: f.title.trim(), vehicleId,
        months: parseInt(f.months, 10) || 0, kmLimit: parseInt(f.km, 10) || 0,
      });
      toast(t("save"), { icon: "check" }); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Card pad={14}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label={t("description")}><TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("description")} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("warranty_months")}><TextInput value={f.months} onChange={(e) => setF({ ...f, months: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></Field>
          <Field label={t("km_limit")}><TextInput value={f.km} onChange={(e) => setF({ ...f, km: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></Field>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>{t("cancel")}</Btn>
          <Btn variant="primary" size="sm" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn>
        </div>
      </div>
    </Card>
  );
}

function AddVehicleModal({ open, onClose, customerId, onCreated }: { open: boolean; onClose: () => void; customerId: string; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ plate: "", make: "", model: "", year: "", vin: "", mileage: "", plateType: "standard" as PlateType });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ plate: "", make: "", model: "", year: "", vin: "", mileage: "", plateType: "standard" }); }, [open]);

  const save = async () => {
    if (!f.plate.trim() || busy) return;
    if (!isValidPlateFor(f.plate, f.plateType)) { toast("Noto'g'ri davlat raqami", { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      await api.createVehicle({ customerId, plate: f.plate.trim(), vin: f.vin.trim(), make: f.make.trim(), model: f.model.trim(), year: parseInt(f.year, 10) || 0, mileage: parseInt(f.mileage, 10) || 0, plateType: plateTypeToProto(f.plateType) });
      onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("add_vehicle")} maxWidth={440}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label={t("plate_type")}>
          <Segmented options={PLATE_TYPES.map((p) => ({ value: p, label: t("pt_" + p) }))} value={f.plateType} onChange={(v) => setF((s) => ({ ...s, plateType: v as PlateType }))} style={{ width: "100%" }} />
        </Field>
        <PlateField value={f.plate} onChange={(p) => setF((s) => ({ ...s, plate: p }))} label={t("plate")} type={f.plateType} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: 12 }}>
          <MakeModelPicker make={f.make} model={f.model} onChange={(mk, md) => setF((s) => ({ ...s, make: mk, model: md }))} labels={{ make: t("make"), model: t("model") }} />
          <Field label={t("year")}><TextInput value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
          <Field label={t("vin")}><TextInput value={f.vin} onChange={(e) => setF({ ...f, vin: e.target.value.toUpperCase() })} style={{ fontFamily: "var(--font-mono)" }} /></Field>
          <Field label={t("mileage")}><TextInput value={f.mileage} onChange={(e) => setF({ ...f, mileage: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></Field>
        </div>
      </div>
    </Modal>
  );
}
