// Uzbek mobile phone validation + formatting.
//
// National numbers are 9 digits after the +998 country code, grouped 2-3-2-2:
//   "90 123 45 67"  — OPERATOR(2) + SUBSCRIBER(7)
// The user can type/paste anything (with or without +998 / 998, spaces, dashes,
// parens, dots) — we strip it down to the national digits and re-format into the
// canonical "+998 90 123 45 67" form.

// Known Uzbek mobile operator codes (the first two national digits).
const OPERATOR_CODES = ["20", "33", "50", "55", "77", "88", "90", "91", "93", "94", "95", "97", "98", "99"];

// nationalDigits strips everything but digits, drops a leading 998 country code,
// and returns at most the 9-digit national number.
export function nationalDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("998")) d = d.slice(3);
  return d.slice(0, 9);
}

// isValidUzPhone reports whether raw is a complete Uzbek mobile number
// (9 national digits with a known operator code).
export function isValidUzPhone(raw: string): boolean {
  const d = nationalDigits(raw);
  return d.length === 9 && OPERATOR_CODES.includes(d.slice(0, 2));
}

// formatNational groups the national digits as "90 123 45 67". Partial input is
// grouped progressively so typing isn't blocked mid-entry.
export function formatNational(raw: string): string {
  const d = nationalDigits(raw);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(" ");
}

// formatPhone returns the canonical "+998 90 123 45 67" form (or "" if empty).
export function formatPhone(raw: string): string {
  const nat = formatNational(raw);
  return nat ? "+998 " + nat : "";
}

// toE164 returns the "+99890XXXXXXX" form expected by the backend (or "" if empty).
export function toE164(raw: string): string {
  const d = nationalDigits(raw);
  return d ? "+998" + d : "";
}

export const PHONE_HINT = "+998 90 123 45 67";
