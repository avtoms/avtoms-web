// Maps between protojson enum NAME strings (what the gateway emits/accepts) and the
// short app keys used by the UI + i18n. protojson serializes enums as their proto names.
import type { Lang } from "./i18n";

export type WoState = "draft" | "estimated" | "approved" | "in_progress" | "ready" | "invoiced" | "closed" | "canceled";
export type Role = "owner" | "mechanic" | "admin";
export type FiscalStatus = "pending" | "fiscalized" | "failed" | "voided";
export type PaymentMethod = "cash" | "card" | "other";
// "service" and "material" are the current kinds; "labor"/"part" are legacy aliases
// still returned for older line items.
export type LineItemKind = "service" | "material" | "labor" | "part";
// Kinds offered when adding a new line item.
export const LINE_ITEM_KINDS: LineItemKind[] = ["service", "material"];

export const WO_STATES: WoState[] = ["draft", "estimated", "approved", "in_progress", "ready", "invoiced", "closed", "canceled"];

export const STATE_LABEL: Record<WoState, string> = {
  draft: "st_draft", estimated: "st_estimated", approved: "st_approved", in_progress: "st_in_progress",
  ready: "st_ready", invoiced: "st_invoiced", closed: "st_closed", canceled: "st_canceled",
};

// Allowed forward transitions used by the action bar. Mirrors the backend state machine
// in avtoms-workorder (service.go allowedTransitions) exactly, so the UI never offers a
// transition the server will reject.
export const TRANSITIONS: Record<WoState, WoState[]> = {
  draft: ["estimated", "canceled"],
  estimated: ["approved", "draft", "canceled"],
  approved: ["in_progress", "canceled"],
  in_progress: ["ready", "canceled"],
  ready: ["invoiced", "in_progress", "canceled"],
  invoiced: ["closed"],
  closed: [],
  canceled: [],
};

const WO_PREFIX = "WORK_ORDER_STATE_";
export const woStateFromProto = (s?: string): WoState => {
  if (!s) return "draft";
  const k = s.replace(WO_PREFIX, "").toLowerCase();
  return (WO_STATES.includes(k as WoState) ? k : "draft") as WoState;
};
export const woStateToProto = (s: WoState): string => WO_PREFIX + s.toUpperCase();

export const roleFromProto = (s?: string): Role =>
  s === "ROLE_MECHANIC" ? "mechanic" : s === "ROLE_ADMIN" ? "admin" : "owner";
export const roleToProto = (r: Role): string =>
  r === "mechanic" ? "ROLE_MECHANIC" : r === "admin" ? "ROLE_ADMIN" : "ROLE_OWNER";

// Car body types offered in the admin model form + vehicle dropdowns.
export const BODY_TYPES = ["sedan", "hatchback", "suv", "minivan", "pickup", "other"] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const fiscalFromProto = (s?: string): FiscalStatus => {
  switch (s) {
    case "FISCAL_STATUS_FISCALIZED": return "fiscalized";
    case "FISCAL_STATUS_FAILED": return "failed";
    case "FISCAL_STATUS_VOIDED": return "voided";
    default: return "pending";
  }
};

export const paymentToProto = (m: PaymentMethod): string =>
  m === "card" ? "PAYMENT_METHOD_CARD" : m === "other" ? "PAYMENT_METHOD_OTHER" : "PAYMENT_METHOD_CASH";
export const paymentFromProto = (s?: string): PaymentMethod =>
  s === "PAYMENT_METHOD_CARD" ? "card" : s === "PAYMENT_METHOD_OTHER" ? "other" : "cash";
// i18n key for a payment method's label.
export const paymentLabelKey = (m: PaymentMethod): string =>
  m === "card" ? "pay_card" : m === "other" ? "pay_other" : "pay_cash";

export const kindToProto = (k: LineItemKind): string => {
  switch (k) {
    case "material": return "LINE_ITEM_KIND_MATERIAL";
    case "part": return "LINE_ITEM_KIND_PART";
    case "labor": return "LINE_ITEM_KIND_LABOR";
    default: return "LINE_ITEM_KIND_SERVICE";
  }
};
export const kindFromProto = (s?: string): LineItemKind => {
  switch (s) {
    case "LINE_ITEM_KIND_MATERIAL": return "material";
    case "LINE_ITEM_KIND_PART": return "part";
    case "LINE_ITEM_KIND_LABOR": return "labor";
    default: return "service";
  }
};
// Materials/parts are stock-like (info tone); services/labor are work (neutral tone).
export const kindIsMaterial = (k: LineItemKind): boolean => k === "material" || k === "part";

// Per-line progress a mechanic drives (mirror avtoms.workorder.v1.LineItemStatus).
export type LineItemStatus = "pending" | "in_progress" | "done";
export const lineStatusFromProto = (s?: string): LineItemStatus => {
  switch (s) {
    case "LINE_ITEM_STATUS_IN_PROGRESS": return "in_progress";
    case "LINE_ITEM_STATUS_DONE": return "done";
    default: return "pending";
  }
};
export const lineStatusToProto = (s: LineItemStatus): string => {
  switch (s) {
    case "in_progress": return "LINE_ITEM_STATUS_IN_PROGRESS";
    case "done": return "LINE_ITEM_STATUS_DONE";
    default: return "LINE_ITEM_STATUS_PENDING";
  }
};

// Appointment states (mirror avtoms.workorder.v1.AppointmentState).
export type ApptState = "scheduled" | "done" | "canceled";
const APPT_PREFIX = "APPOINTMENT_STATE_";
export const apptStateToProto = (s: ApptState): string => APPT_PREFIX + s.toUpperCase();
export const apptStateFromProto = (s?: string): ApptState => {
  const k = (s || "").replace(APPT_PREFIX, "").toLowerCase();
  return (["scheduled", "done", "canceled"] as string[]).includes(k) ? (k as ApptState) : "scheduled";
};

// Service-reminder states (mirror avtoms.workorder.v1.ServiceReminderState).
export type ReminderState = "pending" | "done" | "dismissed";
const REMINDER_PREFIX = "SERVICE_REMINDER_STATE_";
export const reminderStateToProto = (s: ReminderState): string => REMINDER_PREFIX + s.toUpperCase();
export const reminderStateFromProto = (s?: string): ReminderState => {
  const k = (s || "").replace(REMINDER_PREFIX, "").toLowerCase();
  return (["pending", "done", "dismissed"] as string[]).includes(k) ? (k as ReminderState) : "pending";
};

// Uzbek number-plate categories (mirrors avtoms.customer.v1.PlateType).
export type PlateType = "standard" | "electric" | "foreign" | "moped";
export const PLATE_TYPES: PlateType[] = ["standard", "electric", "foreign", "moped"];
const PT_PREFIX = "PLATE_TYPE_";
export const plateTypeToProto = (t: PlateType): string => PT_PREFIX + t.toUpperCase();
export const plateTypeFromProto = (s?: string): PlateType => {
  const k = (s || "").replace(PT_PREFIX, "").toLowerCase();
  return (PLATE_TYPES as string[]).includes(k) ? (k as PlateType) : "standard";
};

const LANG_PROTO: Record<Lang, string> = { uz: "LANGUAGE_UZ_LATN", uzc: "LANGUAGE_UZ_CYRL", ru: "LANGUAGE_RU" };
export const langToProto = (l: Lang): string => LANG_PROTO[l] || "LANGUAGE_UZ_LATN";
export const langFromProto = (s?: string): Lang => (s === "LANGUAGE_UZ_CYRL" ? "uzc" : s === "LANGUAGE_RU" ? "ru" : "uz");

export const REPORT_KINDS: Record<string, string> = {
  daily_revenue: "REPORT_KIND_DAILY_REVENUE",
  weekly_wo: "REPORT_KIND_WEEKLY_WORK_ORDERS",
  mechanic: "REPORT_KIND_MECHANIC_ACTIVITY",
  menu: "REPORT_KIND_SERVICE_MENU_PERFORMANCE",
  fiscal: "REPORT_KIND_FISCAL_COMPLIANCE",
  retention: "REPORT_KIND_CUSTOMER_RETENTION",
};
