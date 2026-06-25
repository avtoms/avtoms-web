"use client";
import { useEffect, useState } from "react";
import { Field, SelectInput, TextInput } from "./ui";
import { Icon } from "./icons";
import { api } from "@/lib/api";
import type { CarMake, CarModel } from "@/lib/types";
import { isValidPlate, formatPlate, sanitizePlateInput, PLATE_HINT } from "@/lib/plate";

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
export function PlateField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const show = value.trim().length > 0;
  const valid = isValidPlate(value);
  return (
    <Field label={label} hint={show && !valid ? `Noto'g'ri davlat raqami — masalan: ${PLATE_HINT}` : undefined}>
      <div style={{ position: "relative" }}>
        <TextInput
          value={value}
          onChange={(e) => onChange(sanitizePlateInput(e.target.value))}
          onBlur={(e) => onChange(formatPlate(e.target.value))}
          placeholder={PLATE_HINT}
          style={{ fontFamily: "var(--font-mono)", borderColor: show ? (valid ? "var(--ok)" : "var(--danger)") : undefined, paddingRight: 34 }}
        />
        {show && valid && (
          <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: "var(--ok)" }}><Icon name="check" size={16} /></span>
        )}
      </div>
    </Field>
  );
}
