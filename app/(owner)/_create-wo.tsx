"use client";
// Create-work-order flow (flows.jsx CreateWOModal). Search vehicles by plate via the
// live backend; pick one to create the WO. If no vehicle matches, create a customer +
// vehicle inline, then the WO.
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Field, TextInput, SelectInput, Btn, Empty, Spinner, Segmented } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { LANGS, type Lang } from "@/lib/i18n";
import type { Vehicle } from "@/lib/types";
import { MakeModelPicker, PlateField, PhoneField } from "@/components/catalog-fields";
import { PlatePreview } from "@/components/plate";
import { isValidPlateFor } from "@/lib/plate";
import { orderLabel } from "@/lib/format";
import { PLATE_TYPES, plateTypeToProto, plateTypeFromProto, type PlateType } from "@/lib/enums";
import { isValidUzPhone, toE164 } from "@/lib/phone";

export function CreateWOModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();
  const router = useRouter();

  const [mode, setMode] = useState<"search" | "new">("search");
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Vehicle[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  // new customer+vehicle form
  const [cf, setCf] = useState({ name: "", phone: "", telegram: "", language: "uz" as Lang });
  const [vf, setVf] = useState({ plate: "", make: "", model: "", year: "", vin: "", mileage: "", plateType: "standard" as PlateType });

  React.useEffect(() => {
    if (open) { setMode("search"); setQ(""); setMatches([]); setCf({ name: "", phone: "", telegram: "", language: "uz" }); setVf({ plate: "", make: "", model: "", year: "", vin: "", mileage: "", plateType: "standard" as PlateType }); }
  }, [open]);

  // debounced plate search
  React.useEffect(() => {
    if (mode !== "search") return;
    const plate = q.trim();
    if (!plate) { setMatches([]); return; }
    setSearching(true);
    const h = setTimeout(async () => {
      try { setMatches(await api.searchVehicles(shopId, plate)); }
      catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(h);
  }, [q, mode, shopId, t, toast]);

  const createFor = async (vehicleId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const wo = await api.createWorkOrder(shopId, vehicleId);
      toast(t("create_wo") + " · " + orderLabel(wo), { icon: "clipboard" });
      onClose();
      router.push(`/work-orders/${wo.id}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      setBusy(false);
    }
  };

  const createNew = async () => {
    if (busy) return;
    if (!cf.phone.trim() || !vf.plate.trim()) { toast(t("error"), { icon: "alert", tone: "danger" }); return; }
    if (!isValidUzPhone(cf.phone)) { toast(t("bad_phone"), { icon: "alert", tone: "danger" }); return; }
    if (!isValidPlateFor(vf.plate, vf.plateType)) { toast("Noto'g'ri davlat raqami", { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      const cust = await api.createCustomer(shopId, { phone: toE164(cf.phone), name: cf.name.trim(), language: cf.language, telegramHandle: cf.telegram.trim(), walkIn: false });
      const veh = await api.createVehicle({ customerId: cust.id, plate: vf.plate.trim(), vin: vf.vin.trim(), make: vf.make.trim(), model: vf.model.trim(), year: parseInt(vf.year, 10) || 0, mileage: parseInt(vf.mileage, 10) || 0, plateType: plateTypeToProto(vf.plateType) });
      await createFor(veh.id);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("new_wo")} maxWidth={480}
      footer={mode === "new" ? <><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" icon="plus" onClick={createNew} disabled={busy}>{busy ? <Spinner /> : t("create_wo")}</Btn></> : undefined}>
      <Segmented options={[{ value: "search", label: t("search_plate") }, { value: "new", label: t("new_customer") }]} value={mode} onChange={(v) => setMode(v as "search" | "new")} style={{ marginBottom: 16, width: "100%" }} />

      {mode === "search" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label={t("search_plate")}>
            <div style={{ position: "relative" }}>
              <Icon name="search" size={17} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }} />
              <TextInput autoFocus value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} placeholder="01 A 777 AB" style={{ paddingLeft: 38, fontFamily: "var(--font-mono)" }} />
            </div>
          </Field>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto" }}>
            {searching && <div style={{ display: "flex", justifyContent: "center", padding: 16 }}><Spinner /></div>}
            {!searching && q.trim() && matches.length === 0 && <Empty icon="car" text={t("empty")} />}
            {matches.map((v) => (
              <button key={v.id} disabled={busy} onClick={() => createFor(v.id)} className="an-row-btn" style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--surface)", cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-2)" }}><Icon name="car" size={20} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{[v.make, v.model].filter(Boolean).join(" ") || t("vehicle")} {v.year ? <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>· {v.year}</span> : null}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{v.vin || ""}</div>
                </div>
                <PlatePreview plate={v.plate} type={plateTypeFromProto(v.plateType)} size="sm" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label={t("name")}><TextInput value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <PhoneField label={t("phone")} value={cf.phone} onChange={(p) => setCf({ ...cf, phone: p })} invalidHint={t("bad_phone")} />
            <Field label={t("language")}><SelectInput value={cf.language} onChange={(e) => setCf({ ...cf, language: e.target.value as Lang })}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</SelectInput></Field>
          </div>
          <div style={{ height: 1, background: "var(--line)", margin: "2px 0" }} />
          <Field label={t("plate_type")}>
            <Segmented options={PLATE_TYPES.map((p) => ({ value: p, label: t("pt_" + p) }))} value={vf.plateType} onChange={(v) => setVf((s) => ({ ...s, plateType: v as PlateType }))} style={{ width: "100%" }} />
          </Field>
          <PlateField value={vf.plate} onChange={(p) => setVf((s) => ({ ...s, plate: p }))} label={t("plate")} type={vf.plateType} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <MakeModelPicker make={vf.make} model={vf.model} onChange={(mk, md) => setVf((s) => ({ ...s, make: mk, model: md }))} labels={{ make: t("make"), model: t("model") }} />
          </div>
          <Field label={t("year")}><TextInput value={vf.year} onChange={(e) => setVf({ ...vf, year: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></Field>
        </div>
      )}
    </Modal>
  );
}
