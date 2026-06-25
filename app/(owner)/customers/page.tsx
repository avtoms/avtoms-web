"use client";
// Customers (owner-pages.jsx CustomersPage): debounced search, new-customer modal,
// detail modal with add-vehicle. Wired to api.listCustomers / createCustomer / createVehicle.
import React, { useCallback, useEffect, useState } from "react";
import { Card, Badge, Avatar, Btn, Modal, Field, TextInput, SelectInput, Spinner, Empty } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { LANGS, type Lang } from "@/lib/i18n";
import type { Customer } from "@/lib/types";
import { SecTitle } from "../_shared";
import { MakeModelPicker, PlateField, PhoneField } from "@/components/catalog-fields";
import { isValidPlate } from "@/lib/plate";
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
      <CustomerDetailModal customer={sel} onClose={() => setSel(null)} />
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

function CustomerDetailModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [addV, setAddV] = useState(false);
  if (!customer) return null;
  return (
    <>
      <Modal open={!!customer && !addV} onClose={onClose} title={customer.walkIn ? t("walk_in") : customer.name} maxWidth={460}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={customer.walkIn ? "?" : customer.name} size={44} />
            <div>
              <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: "calc(17px * var(--scale))" }}>{customer.walkIn ? t("walk_in") : customer.name}</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{customer.phone}{customer.telegramHandle ? " · " + customer.telegramHandle : ""}</div>
            </div>
          </div>
          <Card pad={0}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <SecTitle>{t("vehicles")}</SecTitle><Btn variant="soft" size="sm" icon="plus" onClick={() => setAddV(true)}>{t("add_vehicle")}</Btn>
            </div>
            {/* TODO backend: no list-vehicles-by-customer endpoint; vehicles are added but not listed here. */}
            <div style={{ padding: 20 }}><Empty icon="car" text={t("empty")} /></div>
          </Card>
        </div>
      </Modal>
      <AddVehicleModal open={addV} onClose={() => setAddV(false)} customerId={customer.id} onCreated={() => { toast(t("save"), { icon: "check" }); setAddV(false); }} />
    </>
  );
}

function AddVehicleModal({ open, onClose, customerId, onCreated }: { open: boolean; onClose: () => void; customerId: string; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ plate: "", make: "", model: "", year: "", vin: "", mileage: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ plate: "", make: "", model: "", year: "", vin: "", mileage: "" }); }, [open]);

  const save = async () => {
    if (!f.plate.trim() || busy) return;
    if (!isValidPlate(f.plate)) { toast("Noto'g'ri davlat raqami", { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      await api.createVehicle({ customerId, plate: f.plate.trim(), vin: f.vin.trim(), make: f.make.trim(), model: f.model.trim(), year: parseInt(f.year, 10) || 0, mileage: parseInt(f.mileage, 10) || 0 });
      onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("add_vehicle")} maxWidth={440}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PlateField value={f.plate} onChange={(p) => setF((s) => ({ ...s, plate: p }))} label={t("plate")} />
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
