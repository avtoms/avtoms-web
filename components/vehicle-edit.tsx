"use client";
// VehiclePhoto + EditVehicleModal: edit a car's fields and photo, with a guarded delete
// (the gateway blocks deletion when the car has work orders). Shared by the customer detail
// and the Cars tab so both edit cars the same way.
import React, { useEffect, useRef, useState } from "react";
import { Btn, Modal, Field, TextInput, Segmented, Spinner } from "@/components/ui";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { PLATE_TYPES, plateTypeToProto, plateTypeFromProto, type PlateType } from "@/lib/enums";
import { MakeModelPicker, PlateField } from "@/components/catalog-fields";
import { CarImage } from "@/components/car-image";
import { isValidPlateFor } from "@/lib/plate";
import type { Vehicle } from "@/lib/types";

// Vehicle photo uploader: shows the current photo (or brand emblem fallback) and uploads a
// new one to object storage, returning its URL.
export function VehiclePhoto({ url, make, onChange }: { url: string; make: string; onChange: (u: string) => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast(t("file_too_large"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try { onChange(await api.uploadImage(file)); }
    catch (err) { toast(err instanceof ApiError ? err.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button type="button" onClick={() => fileRef.current?.click()} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }} aria-label={t("change_photo")}>
        {busy ? <div style={{ width: 56, height: 56, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)" }}><Spinner size={18} /></div> : <CarImage src={url || undefined} make={make} size={56} />}
      </button>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pick} style={{ display: "none" }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
        <button type="button" onClick={() => fileRef.current?.click()} style={{ border: "none", background: "transparent", color: "var(--accent-2)", fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "var(--font-sans)", padding: 0 }}>{t("change_photo")}</button>
        {url && <button type="button" onClick={() => onChange("")} style={{ border: "none", background: "transparent", color: "var(--ink-3)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)", padding: 0 }}>{t("remove")}</button>}
      </div>
    </div>
  );
}

export function EditVehicleModal({ vehicle, onClose, onDone }: { vehicle: Vehicle | null; onClose: () => void; onDone: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ plate: "", make: "", model: "", year: "", vin: "", mileage: "", plateType: "standard" as PlateType, color: "", engine: "", transmission: "", notes: "", image: "" });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  useEffect(() => {
    if (vehicle) { setDel(false); setF({
      plate: vehicle.plate, make: vehicle.make ?? "", model: vehicle.model ?? "", year: vehicle.year ? String(vehicle.year) : "",
      vin: vehicle.vin ?? "", mileage: vehicle.mileage ? String(vehicle.mileage) : "", plateType: plateTypeFromProto(vehicle.plateType),
      color: vehicle.color ?? "", engine: vehicle.engine ?? "", transmission: vehicle.transmission ?? "", notes: vehicle.notes ?? "", image: vehicle.imageUrl ?? "",
    }); }
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
        color: f.color.trim(), engine: f.engine.trim(), transmission: f.transmission.trim(), notes: f.notes.trim(), imageUrl: f.image,
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
          <VehiclePhoto url={f.image} make={f.make} onChange={(u) => setF((s) => ({ ...s, image: u }))} />
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
