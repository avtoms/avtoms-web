// Uzbek vehicle license-plate validation, formatting and design metadata.
//
// Plate categories (see avtoms.customer.v1.PlateType):
//   standard / electric : "01 A 123 BC"  (region 2 + letter + 3 digits + 2 letters)
//                    or : "01 123 ABC"   (region 2 + 3 digits + 3 letters, older)
//   foreign             : "01 H 123456"  (region 2 + H + 6 digits), yellow plate
//   moped               : "123 ABC"      (3 digits + 3 letters), square plate
// Electric uses the standard character format but the region box is green.
import type { PlateType } from "./enums";

const RE_STANDARD = /^(\d{2})([A-Z])(\d{3})([A-Z]{2})$/; // 01 A 123 BC
const RE_ALT = /^(\d{2})(\d{3})([A-Z]{3})$/; // 01 123 ABC
const RE_FOREIGN = /^(\d{2})H(\d{6})$/; // 01 H 123456
const RE_MOPED = /^(\d{3})([A-Z]{3})$/; // 123 ABC

const compact = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
const regionOK = (p: string): boolean => {
  const r = Number(p.slice(0, 2));
  return r >= 1 && r <= 99;
};

// normalizePlate uppercases and collapses internal whitespace to single spaces.
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, " ").trim();
}

// isValidPlateFor reports whether a plate matches the format of the given type.
export function isValidPlateFor(raw: string, type: PlateType): boolean {
  const p = compact(raw);
  switch (type) {
    case "foreign":
      return regionOK(p) && RE_FOREIGN.test(p);
    case "moped":
      return RE_MOPED.test(p);
    case "electric":
    case "standard":
    default:
      return regionOK(p) && (RE_STANDARD.test(p) || RE_ALT.test(p));
  }
}

// isValidPlate reports whether the plate matches ANY known Uzbek format.
export function isValidPlate(raw: string): boolean {
  return (["standard", "foreign", "moped"] as PlateType[]).some((t) => isValidPlateFor(raw, t));
}

// formatPlateFor returns the canonical spaced form for the type, or the normalized
// input if it doesn't match yet (so typing isn't blocked mid-entry).
export function formatPlateFor(raw: string, type: PlateType): string {
  const p = compact(raw);
  let m: RegExpMatchArray | null;
  if (type === "foreign") {
    if ((m = p.match(RE_FOREIGN))) return `${m[1]} H ${m[2]}`;
  } else if (type === "moped") {
    if ((m = p.match(RE_MOPED))) return `${m[1]} ${m[2]}`;
  } else {
    if ((m = p.match(RE_STANDARD))) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
    if ((m = p.match(RE_ALT))) return `${m[1]} ${m[2]} ${m[3]}`;
  }
  return normalizePlate(raw);
}

// formatPlate canonicalizes against any known format (used for display when the type
// isn't known, e.g. a denormalized plate on a work order).
export function formatPlate(raw: string): string {
  const p = compact(raw);
  let m: RegExpMatchArray | null;
  if ((m = p.match(RE_STANDARD))) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  if ((m = p.match(RE_FOREIGN))) return `${m[1]} H ${m[2]}`;
  if ((m = p.match(RE_ALT))) return `${m[1]} ${m[2]} ${m[3]}`;
  if ((m = p.match(RE_MOPED))) return `${m[1]} ${m[2]}`;
  return normalizePlate(raw);
}

// sanitizePlateInput keeps only allowed characters while typing.
export function sanitizePlateInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s{2,}/g, " ");
}

// inferPlateType guesses the type from the characters where unambiguous (foreign has the
// H+6-digit shape, moped has no region). Cannot tell electric from standard.
export function inferPlateType(raw: string): PlateType {
  const p = compact(raw);
  if (RE_FOREIGN.test(p)) return "foreign";
  if (RE_MOPED.test(p) && !RE_ALT.test(p)) return "moped";
  return "standard";
}

// platePlaceholder returns the example string shown for a type.
export function platePlaceholder(type: PlateType): string {
  switch (type) {
    case "foreign": return "01 H 123456";
    case "moped": return "123 ABC";
    default: return "01 A 123 BC";
  }
}

// plateParts splits a plate into the region code (left box) and the rest, for the design.
export function plateParts(raw: string, type: PlateType): { region: string; rest: string } {
  const f = formatPlateFor(raw, type);
  if (type === "moped") return { region: "", rest: f };
  const m = f.match(/^(\d{2})\s+(.*)$/);
  return m ? { region: m[1], rest: m[2] } : { region: "", rest: f };
}

// plateColors returns the design colours for a type.
export function plateColors(type: PlateType): { bg: string; text: string; regionGreen: boolean } {
  switch (type) {
    case "foreign": return { bg: "#f4c20d", text: "#111", regionGreen: false }; // yellow
    case "electric": return { bg: "#ffffff", text: "#111", regionGreen: true };
    default: return { bg: "#ffffff", text: "#111", regionGreen: false };
  }
}

export const PLATE_HINT = "01 A 123 BC";
