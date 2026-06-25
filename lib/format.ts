// Money is in so'm whole units. protojson serializes int64 fields as strings, so
// these helpers accept string | number.
export function num(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0;
  return typeof v === "number" ? v : Number(v) || 0;
}

export function money(v: string | number): string {
  return Math.round(num(v)).toLocaleString("ru-RU").replace(/,/g, " ");
}

export function vatBreakdown(items: { unitPrice: string | number; quantity: number }[]) {
  const subtotal = items.reduce((s, i) => s + num(i.unitPrice) * (i.quantity || 0), 0);
  const vat = Math.round(subtotal * 0.12);
  return { subtotal, vat, total: subtotal + vat };
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

// Deterministic QR-like matrix (visual placeholder, not a real scannable QR).
export function qrMatrix(str: string, size = 25): boolean[][] {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rng = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
  const m = Array.from({ length: size }, () => Array(size).fill(false));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) m[y][x] = rng() > 0.5;
  const finder = (oy: number, ox: number) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const edge = x === 0 || y === 0 || x === 6 || y === 6;
      const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      m[oy + y][ox + x] = edge || core;
    }
    for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) {
      const yy = oy + y, xx = ox + x;
      if (yy < 0 || xx < 0 || yy >= size || xx >= size) continue;
      if (y === -1 || x === -1 || y === 7 || x === 7) m[yy][xx] = false;
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  return m;
}
