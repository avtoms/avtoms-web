"use client";
// Text the SYSTEM wrote, shown in the language the reader chose.
//
// Some of what a shop reads was not typed by anyone here: the shelf history says why stock
// moved, the audit trail says what happened to an order. Those sentences are produced by a
// server that has no idea who is looking, and until now they arrived — and were shown —
// in English: "used on work order", "sale S-0003", "draft → estimated".
//
// The rule this file exists to keep: everything the platform says is translatable, and
// everything a person typed is left exactly as they typed it. A hand-written reason on a
// stock adjustment ("Sindirib qo'ydik") is the shop's own words about its own shelf, and
// falls through untouched — that is the default here, not an afterthought.
//
// Two vocabularies are recognised, deliberately:
//   • the codes avtoms-workorder writes today (`wo_used`, `sale:S-0003`), pinned on that
//     side by internal/repository/reasons_test.go;
//   • the English sentences it used to write, because the rows already in the database keep
//     them forever and a shop's history should not be half-translated.
import { translate, type Lang } from "@/lib/i18n";
import { STATE_LABEL, woStateFromProto, type WoState } from "@/lib/enums";

// Code → i18n key. The legacy English is listed beside each code rather than in a table of
// its own, so it is obvious that the two mean the same thing and that neither may be dropped
// while old rows exist.
const REASON_KEY: Record<string, string> = {
  // current codes
  wo_used: "reason_wo_used",
  wo_returned: "reason_wo_returned",
  wo_adjusted: "reason_wo_adjusted",
  wo_canceled: "reason_wo_canceled",
  opening: "reason_opening",
  receive: "reason_receive",
  // what the same movements were called before they were codes
  "used on work order": "reason_wo_used",
  "returned from work order": "reason_wo_returned",
  "adjusted on work order edit": "reason_wo_adjusted",
  "returned from canceled work order": "reason_wo_canceled",
  "opening stock": "reason_opening",
};

// A sale movement carries which sale it was: "sale:S-0003", or the older "sale S-0003" and
// "sale S-0003 voided".
const SALE = /^sale[:\s]([A-Za-z]-?\d+)(\s+voided)?$/;
const SALE_VOID = /^sale_void:([A-Za-z]-?\d+)$/;

/**
 * stockReason renders why stock moved.
 *
 * Anything unrecognised is returned as written — that is how a hand-typed adjustment reason
 * survives, and how a movement kind added later fails softly (the shop sees a token instead
 * of a sentence, rather than an empty cell that reads like missing data).
 */
export function stockReason(lang: Lang, raw?: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";

  const key = REASON_KEY[s] ?? REASON_KEY[s.toLowerCase()];
  if (key) return translate(lang, key);

  const void_ = SALE_VOID.exec(s);
  if (void_) return `${translate(lang, "reason_sale_void")} ${void_[1]}`;

  const sale = SALE.exec(s);
  if (sale) return `${translate(lang, sale[2] ? "reason_sale_void" : "reason_sale")} ${sale[1]}`;

  return s;
}

// Every action avtoms-workorder writes to the audit trail. Anything not here falls back to a
// neutral "history" line rather than showing the raw code.
const AUDIT_KEY: Record<string, string> = {
  state: "audit_state",
  line_added: "audit_line_added",
  line_removed: "audit_line_removed",
  line_updated: "audit_line_updated",
  mechanic_assigned: "audit_mechanic_assigned",
  order_discount: "order_discount",
  materials_returned: "audit_materials_returned",
  approved: "audit_approved",
  declined: "audit_declined",
  notes: "audit_notes",
};

export function auditAction(lang: Lang, action?: string): string {
  return translate(lang, AUDIT_KEY[(action ?? "").trim()] ?? "history");
}

// "draft → estimated" — two state names the shop already sees translated everywhere else on
// the order, so they are translated here too rather than left as the server's lowercase
// English. Also accepts the "(auto)" suffix the automatic transition appends.
const TRANSITION = /^([a-z_]+)\s*(?:→|->)\s*([a-z_]+)(\s*\(auto\))?$/;

/**
 * auditDetail renders the second half of an audit line.
 *
 * Most details are the shop's own words — a line item's description, a returned material —
 * and pass straight through. Only what the server composed is translated.
 */
export function auditDetail(lang: Lang, action?: string, detail?: string): string {
  const d = (detail ?? "").trim();
  if (!d) return "";

  if (action === "state") {
    const m = TRANSITION.exec(d);
    if (m) {
      const name = (s: string) => translate(lang, STATE_LABEL[woStateFromProto(s) as WoState] ?? "history");
      const auto = m[3] ? ` (${translate(lang, "audit_auto")})` : "";
      return `${name(m[1])} → ${name(m[2])}${auto}`;
    }
  }
  if (action === "notes") {
    if (d === "cleared") return translate(lang, "audit_notes_cleared");
    const chars = /^chars:(\d+)$/.exec(d) ?? /^(\d+) characters$/.exec(d);
    if (chars) return `${chars[1]} ${translate(lang, "audit_notes_chars")}`;
  }
  // The approve/decline detail used to restate its own action in English. It carries nothing
  // the action label does not already say, so it is dropped rather than shown untranslated.
  if (action === "approved" || action === "declined") {
    if (/^estimate (approved|declined) by customer$/.test(d)) return "";
  }
  return d;
}
