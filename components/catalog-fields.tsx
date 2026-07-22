"use client";
import React, { useEffect, useState } from "react";
import { Field, SelectInput, TextInput } from "./ui";
import { Icon } from "./icons";
import { api } from "@/lib/api";
import type { CarMake, CarModel } from "@/lib/types";
import { isValidPlateFor, formatPlateFor, sanitizePlateInput, platePlaceholder } from "@/lib/plate";
import { isValidUzPhone, formatPhone, PHONE_HINT } from "@/lib/phone";
import { useLang } from "./providers";
import { PlatePreview } from "./plate";
import type { PlateType } from "@/lib/enums";

// ── MoneyInput ───────────────────────────────────────────────────────────────
// A numeric amount field (so'm) built for BIG sums:
//  • live thousands grouping ("12 500 000") with tabular numerals;
//  • the font auto-shrinks for long values so the WHOLE number stays visible
//    (no more "only the last digits" in narrow fields);
//  • a "000" quick key appends three zeros — the natural "ming" workflow;
//  • a magnitude hint below ("≈ 12,5 mln so'm") confirms the zero count at a glance.
// Emits the raw digit string, so callers keep storing a plain integer string.
const MAX_MONEY_DIGITS = 12; // < 1 trillion so'm — beyond any real shop amount

function groupDigits(s: string): string {
  const d = s.replace(/\D/g, "").slice(0, MAX_MONEY_DIGITS);
  return d === "" ? "" : Number(d).toLocaleString("ru-RU").replace(/,/g, " ");
}

// humanMagnitude renders "12,5 mln" / "450 ming" so the user can sanity-check the zeros.
function humanMagnitude(digits: string, t: (k: string) => string): string {
  const n = Number(digits);
  if (!n || n < 10000) return "";
  const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString("ru-RU").replace(".", ",");
  if (n >= 1_000_000_000) return `≈ ${fmt(n / 1_000_000_000)} ${t("money_bln")} ${t("soum")}`;
  if (n >= 1_000_000) return `≈ ${fmt(n / 1_000_000)} ${t("money_mln")} ${t("soum")}`;
  return `≈ ${fmt(n / 1_000)} ${t("money_k")} ${t("soum")}`;
}

export function MoneyInput({
  value, onChange, placeholder, style, disabled, hideHint, ...rest
}: {
  value: string | number;
  onChange: (digits: string) => void;
  hideHint?: boolean; // drop the "≈ … so'm" hint row so height matches plain inputs in tight grids
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const { t } = useLang();
  const digits = value === "" || value === undefined || value === null ? "" : String(value).replace(/\D/g, "").slice(0, MAX_MONEY_DIGITS);
  const grouped = groupDigits(digits);
  // Shrink instead of clipping: a 12-digit sum still fits fully in a narrow grid cell.
  const fontSize = grouped.length > 13 ? 12 : grouped.length > 10 ? 13 : undefined;
  const hint = humanMagnitude(digits, t);
  const canAppend = !disabled && digits !== "" && digits !== "0" && digits.length + 3 <= MAX_MONEY_DIGITS;
  return (
    <div style={{ width: "100%" }}>
      <div style={{ position: "relative" }}>
        <TextInput
          {...rest}
          disabled={disabled}
          value={grouped}
          inputMode="numeric"
          placeholder={placeholder ?? "0"}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, MAX_MONEY_DIGITS))}
          style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", paddingRight: 44, ...(fontSize ? { fontSize } : {}), ...style }}
        />
        {/* "000" quick key: one tap = ×1000 ("ming") — typing millions takes 2 taps, not 6 zeros */}
        <button
          type="button"
          tabIndex={-1}
          disabled={!canAppend}
          onClick={() => canAppend && onChange(digits + "000")}
          className="an-btn"
          title="×1000"
          style={{
            position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)",
            padding: "3px 7px", borderRadius: 7, border: "1px solid var(--line)",
            background: "var(--surface-2)", color: canAppend ? "var(--ink-2)" : "var(--ink-3)",
            fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 700, cursor: canAppend ? "pointer" : "default",
            opacity: canAppend ? 1 : 0.45, lineHeight: 1.2,
          }}
        >000</button>
      </div>
      {/* Fixed-height hint row (empty when N/A) so the form never grows/shrinks while typing. */}
      <div style={{ marginTop: hideHint ? 0 : 4, height: hideHint ? 0 : 12, fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)", lineHeight: "12px", overflow: "hidden" }}>{hint || " "}</div>
    </div>
  );
}

// ── UnitSelect ───────────────────────────────────────────────────────────────
// Standard (ISO-style) units of measure, so units are picked, not free-typed.
// The stored value is the symbol (e.g. "pcs", "L", "kg"); labels are localized.
export const UNITS = ["pcs", "set", "L", "ml", "kg", "g", "m", "roll"] as const;
export type Unit = (typeof UNITS)[number];

export function UnitSelect({
  value, onChange, style,
}: {
  value: string;
  onChange: (v: string) => void;
  style?: React.CSSProperties;
}) {
  const { t } = useLang();
  // Tolerate legacy free-text units (e.g. "dona", "litr") by keeping them selectable.
  const legacy = value && !UNITS.includes(value as Unit);
  return (
    <SelectInput value={value} onChange={(e) => onChange(e.target.value)} style={style}>
      {UNITS.map((u) => <option key={u} value={u}>{t("unit_" + u)}</option>)}
      {legacy && <option value={value}>{value}</option>}
    </SelectInput>
  );
}

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
