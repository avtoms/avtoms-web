// Money is in so'm whole units. protojson serializes int64 fields as strings, so
// these helpers accept string | number.
export function num(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0;
  return typeof v === "number" ? v : Number(v) || 0;
}

export function money(v: string | number): string {
  return Math.round(num(v)).toLocaleString("ru-RU").replace(/,/g, " ");
}

// orderLabel renders a work order's human-friendly number ("Z-0001"), falling back to a
// short id for any legacy order without a sequence number.
export function orderLabel(wo: { orderNo?: string | number; id: string }): string {
  const n = num(wo.orderNo);
  return n > 0 ? "Z-" + String(n).padStart(4, "0") : wo.id.slice(0, 8);
}

// In Uzbekistan a car is identified day-to-day by its plate + model (e.g. "01 A 356 BC Spark"),
// with the owner's name secondary. These helpers build that identity consistently everywhere.
// makeModel: "Spark", "Chevrolet Spark" → the human car name (make + model, de-duped, trimmed).
export function makeModel(v: { make?: string; model?: string }): string {
  const parts = [v.make, v.model].map((s) => (s ?? "").trim()).filter(Boolean);
  return parts.join(" ");
}

// vehicleTitle: the primary line — "01 A 356 BC · Spark". Falls back gracefully when a piece
// is missing (plate-only, or model-only). Returns "" when nothing is known.
export function vehicleTitle(v: { plate?: string; make?: string; model?: string }): string {
  const plate = (v.plate ?? "").trim();
  const mm = makeModel(v);
  return [plate, mm].filter(Boolean).join(" · ");
}

// VAT (QQS/НДС) is disabled: total equals subtotal. vat stays in the shape (always 0) so
// existing callers keep compiling.
export function vatBreakdown(items: { unitPrice: string | number; quantity: number }[]) {
  const subtotal = items.reduce((s, i) => s + num(i.unitPrice) * (i.quantity || 0), 0);
  return { subtotal, vat: 0, total: subtotal };
}

export function durationFmt(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return m + "m";
  return h + "h " + (m ? m + "m" : "00m");
}

export function minutesBetween(start?: string, end?: string): number {
  if (!start) return 0;
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, (b - a) / 60000);
}

// ── dates ──
// Written out by hand rather than through Intl: a named month depends on the browser shipping
// CLDR data for the tag we ask for, and when it doesn't the fallback renders the month as the
// literal "M07". dd.MM.yyyy is how a date is written in both Uzbek and Russian, so one fixed
// format is also one less thing that can differ between two people looking at the same order.
function parts(iso: string | undefined): { d: string; m: string; y: string; hh: string; mm: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return { d: p2(d.getDate()), m: p2(d.getMonth() + 1), y: String(d.getFullYear()), hh: p2(d.getHours()), mm: p2(d.getMinutes()) };
}

// 28.07.2026
export function shortDate(iso: string | undefined): string {
  const p = parts(iso);
  return p ? `${p.d}.${p.m}.${p.y}` : "—";
}

// 28.07.2026 16:05
export function shortDateTime(iso: string | undefined): string {
  const p = parts(iso);
  return p ? `${p.d}.${p.m}.${p.y} ${p.hh}:${p.mm}` : "—";
}
