"use client";
import { useEffect, useState } from "react";
import { Field, SelectInput, TextInput } from "./ui";
import { Icon } from "./icons";
import { api } from "@/lib/api";
import type { CarMake, CarModel } from "@/lib/types";
import { isValidPlateFor, formatPlateFor, sanitizePlateInput, platePlaceholder } from "@/lib/plate";
import { isValidUzPhone, formatPhone, PHONE_HINT } from "@/lib/phone";
import { PlatePreview } from "./plate";
import type { PlateType } from "@/lib/enums";

// MakeModelPicker renders Make → Model dropdowns sourced from the admin-managed catalog.
// It emits make/model as NAMES (vehicles store strings). If the catalog is empty it falls
// back to free-text inputs so the form still works.
export function MakeModelPicker({
  make, model, onChange, labels,
}: {
  make: string;
  model: string;
  onChange: (make: string, model: string) => void;
  labels: { make: string; model: string };
}) {
  const [makes, setMakes] = useState<CarMake[]>([]);
  const [models, setModels] = useState<CarModel[]>([]);
  const [makeId, setMakeId] = useState("");

  useEffect(() => { api.listCarMakes().then(setMakes).catch(() => setMakes([])); }, []);
  useEffect(() => { setMakeId(makes.find((x) => x.name === make)?.id ?? ""); }, [makes, make]);
  useEffect(() => {
    if (!makeId) { setModels([]); return; }
    api.listCarModels(makeId).then(setModels).catch(() => setModels([]));
  }, [makeId]);

  if (makes.length === 0) {
    return (
      <>
        <Field label={labels.make}><TextInput value={make} onChange={(e) => onChange(e.target.value, model)} /></Field>
        <Field label={labels.model}><TextInput value={model} onChange={(e) => onChange(make, e.target.value)} /></Field>
      </>
    );
  }
  return (
    <>
      <Field label={labels.make}>
        <SelectInput value={makeId} onChange={(e) => {
          const id = e.target.value;
          setMakeId(id);
          onChange(makes.find((x) => x.id === id)?.name ?? "", ""); // reset model on make change
        }}>
          <option value="">—</option>
          {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </SelectInput>
      </Field>
      <Field label={labels.model}>
        <SelectInput value={model} disabled={!makeId} onChange={(e) => onChange(make, e.target.value)}>
          <option value="">—</option>
          {models.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
        </SelectInput>
      </Field>
    </>
  );
}

// PlateField validates an Uzbek license plate live: sanitizes input, formats on blur,
// colors the border, shows a check when valid and a hint when not.
export function PlateField({ value, onChange, label, type = "standard" }: { value: string; onChange: (v: string) => void; label: string; type?: PlateType }) {
  const show = value.trim().length > 0;
  const valid = isValidPlateFor(value, type);
  const ph = platePlaceholder(type);
  return (
    <Field label={label} hint={show && !valid ? `Noto'g'ri davlat raqami — masalan: ${ph}` : undefined}>
      <div style={{ position: "relative" }}>
        <TextInput
          value={value}
          onChange={(e) => onChange(sanitizePlateInput(e.target.value))}
          onBlur={(e) => onChange(formatPlateFor(e.target.value, type))}
          placeholder={ph}
          style={{ fontFamily: "var(--font-mono)", borderColor: show ? (valid ? "var(--ok)" : "var(--danger)") : undefined, paddingRight: 34 }}
        />
        {show && valid && (
          <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: "var(--ok)" }}><Icon name="check" size={16} /></span>
        )}
      </div>
      {show && (
        <div style={{ marginTop: 8 }}><PlatePreview plate={value} type={type} /></div>
      )}
    </Field>
  );
}

// PhoneField validates an Uzbek mobile number live and auto-prettifies whatever the
// user types/pastes into the canonical "+998 90 123 45 67" form: colors the border,
// shows a check when valid and a hint when not. `hint` is shown while it's still valid
// (e.g. "SMS"); `invalidHint` replaces it once the number is complete-but-wrong.
export function PhoneField({ value, onChange, label, hint, invalidHint }: { value: string; onChange: (v: string) => void; label: string; hint?: string; invalidHint?: string }) {
  const show = value.trim().length > 0;
  const valid = isValidUzPhone(value);
  return (
    <Field label={label} hint={show && !valid ? (invalidHint || `Noto'g'ri telefon raqam — masalan: ${PHONE_HINT}`) : hint}>
      <div style={{ position: "relative" }}>
        <TextInput
          value={value}
          onChange={(e) => onChange(formatPhone(e.target.value))}
          placeholder={PHONE_HINT}
          inputMode="tel"
          style={{ fontFamily: "var(--font-mono)", borderColor: show ? (valid ? "var(--ok)" : "var(--danger)") : undefined, paddingRight: 34 }}
        />
        {show && valid && (
          <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: "var(--ok)" }}><Icon name="check" size={16} /></span>
        )}
      </div>
    </Field>
  );
}
