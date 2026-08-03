// Date windows, on one convention.
//
// Finance reads a month, statistics reads the same month, and the work-order board reads the
// days inside it. If any of them computed its own boundaries, the same Tuesday would produce
// two different answers and people would stop trusting all three — so the arithmetic lives
// here once and every screen asks it.
//
// Every window is bounded UTC midnight to UTC midnight. That is what makes thirty-one single
// days add up to exactly the month above them. For a shop five hours ahead it covers 05:00 to
// 05:00 local, which contains every hour a workshop actually trades.
export type Range = { from: string; to: string };

const isoFrom = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 0, 0, 0)).toISOString();
const isoTo = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 23, 59, 59)).toISOString();

const pad = (n: number) => String(n).padStart(2, "0");

export function monthRange(ym: string): Range {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  return { from: isoFrom(y, m - 1, 1), to: isoTo(y, m, 0) };
}
export function dayRange(ymd: string): Range {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return { from: isoFrom(y, m - 1, d), to: isoTo(y, m - 1, d) };
}
// One window spanning two days, ends included. Given the same day twice it is that day.
export function spanRange(fromYMD: string, toYMD: string): Range {
  const [a, b] = fromYMD <= toYMD ? [fromYMD, toYMD] : [toYMD, fromYMD];
  return { from: dayRange(a).from, to: dayRange(b).to };
}
export function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Step a yyyy-mm-dd by whole days, across month and year ends.
export function shiftDay(ymd: string, by: number): string {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const t = new Date(Date.UTC(y, m - 1, d + by));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function firstOfMonth(ymd: string): string {
  return ymd.slice(0, 8) + "01";
}
export function lastNMonths(n: number): { ym: string; label: string }[] {
  const out: { ym: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    out.push({ ym: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`, label: pad(d.getUTCMonth() + 1) });
  }
  return out;
}

// Whether a timestamp falls in a window. A null window is "no filter", not "nothing" — the
// difference between showing everything and showing an empty board.
export function inRange(iso: string | undefined, r: Range | null): boolean {
  if (!r) return true;
  if (!iso) return false;
  return iso >= r.from && iso <= r.to;
}

// "28.07 — 03.08" for a window, or one date when it is a single day. Numeric on purpose: this
// sits beside a filter as a fact-check, not as a headline.
export function rangeLabel(r: Range | null): string {
  if (!r) return "";
  const d = (iso: string) => {
    const t = new Date(iso);
    return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}`;
  };
  const a = d(r.from), b = d(r.to);
  return a === b ? a : `${a} — ${b}`;
}
