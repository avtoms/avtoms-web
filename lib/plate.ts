// Uzbek vehicle license-plate validation + formatting.
//
// Common civilian formats (region code is 01–99):
//   "01 A 123 BC"  — REGION(2) LETTER(1) DIGITS(3) LETTERS(2)   (most common)
//   "01 123 ABC"   — REGION(2) DIGITS(3) LETTERS(3)             (older / alt)
// Letters are Latin uppercase. We normalize spacing and case, then validate.

const RE_STANDARD = /^(\d{2})\s?([A-Z])\s?(\d{3})\s?([A-Z]{2})$/; // 01 A 123 BC
const RE_ALT = /^(\d{2})\s?(\d{3})\s?([A-Z]{3})$/; // 01 123 ABC

// normalizePlate uppercases and collapses internal whitespace to single spaces.
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, " ").trim();
}

// isValidPlate reports whether the (normalized) plate matches an Uzbek format.
export function isValidPlate(raw: string): boolean {
  const p = normalizePlate(raw).replace(/\s/g, "");
  const region = Number(p.slice(0, 2));
  if (!(region >= 1 && region <= 99)) return false;
  return RE_STANDARD.test(p) || RE_ALT.test(p);
}

// formatPlate returns a canonical spaced form ("01 A 123 BC" / "01 123 ABC"),
// or the normalized input if it doesn't match (so typing isn't blocked mid-entry).
export function formatPlate(raw: string): string {
  const p = normalizePlate(raw).replace(/\s/g, "");
  let m = p.match(RE_STANDARD);
  if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  m = p.match(RE_ALT);
  if (m) return `${m[1]} ${m[2]} ${m[3]}`;
  return normalizePlate(raw);
}

// sanitizePlateInput keeps only allowed characters (digits, A–Z, spaces) while typing.
export function sanitizePlateInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s{2,}/g, " ");
}

export const PLATE_HINT = "01 A 123 BC";
