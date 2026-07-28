// Typed client for the gateway. The browser calls the gateway directly using
// NEXT_PUBLIC_API_BASE_URL; CORS is enabled on the gateway. The bearer token is read
// from the session cookie.
import { getSession, setSession, clearSession, sessionFromTokenPair } from "./session";
import type {
  TokenPair, RequestOtpResponse, Staff, Customer, Vehicle, WorkOrder,
  MenuItem, Invoice, ShopCard, Dashboard, Report, LineItem, CarMake, CarModel, ShopSettings, Integration, Product, ProductProperty, ProductVariant, VariantAttribute, PropertyDefinition, StockMovement, CatalogTerm, Contragent, Appointment, AuditEntry, ServiceReminder, ShopExpense, ProfitAndLoss, Warranty, DemoRequest, Lead, AiConversation, AiChatMessage, Sale,
} from "./types";
import {
  langToProto, kindToProto, woStateToProto, paymentToProto, discountToProto, roleToProto, REPORT_KINDS,
  type DiscountKind,
} from "./enums";
import type { Lang } from "./i18n";
import type { WoState, PaymentMethod, LineItemKind, Role } from "./enums";

// Browser → gateway base URL. If NEXT_PUBLIC_API_BASE_URL is set to "" (production build),
// calls are same-origin (Caddy proxies /v1 to the gateway → no CORS). Unset → dev localhost.
const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL;
export const API_BASE = (rawBase === undefined || rawBase === null ? "http://localhost:8080" : rawBase).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
  // A route this build calls that the deployed gateway doesn't serve yet (or a genuinely
  // missing record). Callers use this to degrade instead of failing a whole page.
  get isMissing() { return this.status === 404 || this.status === 405; }
}

// optional wraps a call whose endpoint may not exist on an older backend: during a rolling
// deploy the web image can land before the gateway's. A missing route yields the fallback
// rather than an error toast; every other failure still propagates.
export function optional<T>(p: Promise<T>, fallback: T): Promise<T> {
  return p.catch((e) => {
    if (e instanceof ApiError && e.isMissing) return fallback;
    throw e;
  });
}

/* ── access-token lifecycle ───────────────────────────────────────────────────────────────
   The access token is short-lived (15 min). Waking a backgrounded tab fires a burst of
   requests at once, so discovering expiry by letting them all 401 is both wasteful and
   fragile — it is what produced "data doesn't load but I'm still logged in". Instead every
   authed request passes through ensureFreshToken() first: if the token is spent, ONE shared
   refresh runs and the whole burst then goes out with a valid token.

   The other half of the fix is telling apart "the refresh token was rejected" (the session
   really is over → sign out) from "the server was briefly unreachable" (→ keep the session
   and let the caller retry). Conflating them meant a few seconds of backend downtime, or one
   flaky request, permanently logged the user out. */

type RefreshResult =
  | "ok"          // a fresh access token was stored
  | "rejected"    // the server refused the refresh token — the session is over
  | "unavailable" // network/5xx/garbled reply — the session may well still be fine
  | "none";       // nothing to refresh with (no stored refresh token)

// Notified when the session is discarded, so React can stop rendering the console instead of
// re-firing requests into a dead session. Registered by the auth provider.
let onSessionCleared: (() => void) | null = null;
export function setSessionClearedHandler(fn: (() => void) | null) { onSessionCleared = fn; }

// Refresh a token at most once at a time. Concurrent callers await the same promise, so a
// burst of requests spends the refresh token once rather than N times.
let refreshInFlight: Promise<RefreshResult> | null = null;

async function doRefresh(): Promise<RefreshResult> {
  const s = getSession();
  if (!s?.refreshToken) return "none";
  let res: Response;
  try {
    res = await fetch(API_BASE + "/v1/auth/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: s.refreshToken }),
      cache: "no-store",
    });
  } catch {
    return "unavailable"; // offline, DNS, CORS — nothing says the session is invalid
  }
  // Only the server explicitly refusing the token ends the session. A 5xx (including the
  // gateway's 503 while auth restarts) is transient.
  if (res.status === 401 || res.status === 403) return "rejected";
  if (!res.ok) return "unavailable";
  try {
    const tp = JSON.parse(await res.text()) as TokenPair;
    if (!tp?.accessToken || !tp?.staff) return "unavailable";
    setSession(sessionFromTokenPair(tp));
    return "ok";
  } catch {
    return "unavailable"; // a proxy's HTML error page with a 200, say
  }
}

function refreshOnce(): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

// endSession discards the session and bounces to login. Only for a genuine "rejected".
function endSession() {
  clearSession();
  onSessionCleared?.();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

// Refresh ahead of expiry so requests don't have to fail to discover it. The skew window
// covers clock drift between browser and server (the auth service validates exp with no
// leeway). A session stored before expiresAt existed reports undefined — then we simply keep
// the old reactive behaviour and let the 401 path handle it.
const EXPIRY_SKEW_MS = 60_000;

async function ensureFreshToken(): Promise<void> {
  const s = getSession();
  if (!s?.expiresAt || !s.refreshToken) return;
  if (Date.now() < s.expiresAt - EXPIRY_SKEW_MS) return;
  const r = await refreshOnce();
  if (r === "rejected") {
    endSession();
    throw new ApiError(401, "Session expired");
  }
  // "unavailable" falls through: the request goes out with the old token and either works
  // (the token had not really expired) or 401s, where the reactive path retries.
}

async function call<T>(method: string, path: string, body?: unknown, auth = true, retried = false): Promise<T> {
  // Refresh ahead of expiry so a woken tab's whole burst of requests carries a valid token.
  if (auth) await ensureFreshToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const s = getSession();
    if (s?.token) headers["Authorization"] = `Bearer ${s.token}`;
  }
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  // Backstop for the cases ensureFreshToken cannot predict: a session with no stored expiry,
  // a token revoked server-side, or clock skew beyond the skew window.
  if (res.status === 401 && auth && !retried) {
    const r = await refreshOnce();
    if (r === "ok") {
      return call<T>(method, path, body, auth, true);
    }
    if (r === "rejected" || r === "none") {
      // The session really is over. End it and stop here — the old code fell through and
      // threw on top of the redirect, spraying an error toast per in-flight request.
      endSession();
      throw new ApiError(401, "Session expired");
    }
    // "unavailable" — the backend is briefly down. Keep the session and report a retryable
    // error; a 401 here must not cost the user their login.
    throw new ApiError(503, "Service temporarily unavailable, please retry");
  }
  const text = await res.text();
  // A body is not guaranteed to be JSON: a proxy error page, a gateway timeout or an
  // unmatched route can all answer in HTML/plain text. Parsing defensively keeps those
  // surfacing as a clean ApiError instead of a SyntaxError no caller is looking for.
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (res.ok) throw new ApiError(res.status, `Invalid response from server`);
      throw new ApiError(res.status, text.slice(0, 200) || `HTTP ${res.status}`);
    }
  }
  if (!res.ok) {
    const msg = (data.message as string) || (data.error as string) || `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

// A product create/update payload, with each variant's money fields as numbers (tiyin).
export type ProductInput = {
  name: string;
  description?: string;
  category?: string;
  unit?: string;
  supplier?: string;
  supplierId?: string;
  brand?: string;
  properties: ProductProperty[];
  variants: {
    sku?: string;
    quantityOnHand: number;
    reorderLevel: number;
    unitCost: number;
    unitPrice: number;
    active: boolean;
    attributes: VariantAttribute[];
  }[];
};

// A property-definition create/update payload for the admin catalog.
export type PropertyDefinitionInput = {
  name: string;
  kind: "text" | "number" | "select" | "color";
  unit?: string;
  nameUzLatn?: string;
  nameUzCyrl?: string;
  nameRu?: string;
  values: { value: string; colorHex?: string; valueUzLatn?: string; valueUzCyrl?: string; valueRu?: string }[];
};

const propertyDefinitionBody = (d: PropertyDefinitionInput) => ({
  name: d.name,
  kind: d.kind,
  unit: d.unit ?? "",
  nameUzLatn: d.nameUzLatn ?? "",
  nameUzCyrl: d.nameUzCyrl ?? "",
  nameRu: d.nameRu ?? "",
  // Values only matter for select/color kinds; send them as-is for those.
  values: (d.kind === "select" || d.kind === "color")
    ? d.values.filter((v) => v.value.trim()).map((v) => ({
      value: v.value.trim(), colorHex: v.colorHex ?? "",
      valueUzLatn: v.valueUzLatn?.trim() ?? "", valueUzCyrl: v.valueUzCyrl?.trim() ?? "", valueRu: v.valueRu?.trim() ?? "",
    }))
    : [],
});

// Serialize a product for the API: money as stringified int64 (tiyin) on each variant.
const productBody = (p: ProductInput) => ({
  name: p.name, description: p.description ?? "", category: p.category ?? "",
  unit: p.unit ?? "", supplier: p.supplier ?? "", supplierId: p.supplierId ?? "", brand: p.brand ?? "",
  properties: p.properties.map((pr) => ({ name: pr.name, values: pr.values })),
  variants: p.variants.map((v) => ({
    sku: v.sku ?? "", quantityOnHand: v.quantityOnHand, reorderLevel: v.reorderLevel,
    unitCost: String(v.unitCost), unitPrice: String(v.unitPrice), active: v.active,
    attributes: v.attributes,
  })),
});

// A service-template material, optionally linked to a warehouse variant.
export type MenuMaterialInput = {
  name: string; quantity: number; unit: string; unitCost: number; unitPrice: number; variantId?: string;
};
const menuMaterialBody = (x: MenuMaterialInput) => ({
  name: x.name, quantity: x.quantity, unit: x.unit,
  unitCost: String(x.unitCost), unitPrice: String(x.unitPrice), variantId: x.variantId ?? "",
});

// Serialize a lead for the API: every field present, deal_price as a string (int64).
const leadBody = (l: Partial<Lead>) => ({
  name: l.name ?? "", phone: l.phone ?? "", email: l.email ?? "", company: l.company ?? "",
  imageUrl: l.imageUrl ?? "", city: l.city ?? "", address: l.address ?? "", source: l.source ?? "",
  status: l.status ?? "new", dealPrice: String(l.dealPrice ?? 0), notes: l.notes ?? "",
});

export const api = {
  // ── uploads (multipart, returns the stored object's public URL) ──
  // Generic uploader for any accepted file (images → avatars, PDFs → receipts). The gateway
  // routes to a storage prefix by content type.
  uploadFile: async (file: File | Blob, retried = false): Promise<string> => {
    await ensureFreshToken();
    const form = new FormData();
    form.append("file", file);
    const s = getSession();
    const res = await fetch(API_BASE + "/v1/uploads", {
      method: "POST",
      headers: s?.token ? { Authorization: `Bearer ${s.token}` } : {},
      body: form,
    });
    if (res.status === 401 && !retried) {
      const r = await refreshOnce();
      if (r === "ok") return api.uploadFile(file, true);
      if (r === "rejected" || r === "none") {
        endSession();
        throw new ApiError(401, "Session expired");
      }
      throw new ApiError(503, "Service temporarily unavailable, please retry");
    }
    const text = await res.text();
    // Same defensive parse as call(): an upload can be rejected by a proxy with an HTML
    // body (size limits, gateway errors), which must not surface as a SyntaxError.
    let data: Record<string, unknown> = {};
    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new ApiError(res.status, res.ok ? "Invalid response from server" : text.slice(0, 200));
      }
    }
    if (!res.ok) throw new ApiError(res.status, (data.message as string) || (data.error as string) || `HTTP ${res.status}`);
    return data.url as string;
  },
  uploadImage: (file: File): Promise<string> => api.uploadFile(file),

  // ── auth (public) ──
  requestOtp: (phone: string) =>
    call<RequestOtpResponse>("POST", "/v1/auth/otp/request", { phone }, false),
  verifyOtp: (challengeId: string, code: string) =>
    call<TokenPair>("POST", "/v1/auth/otp/verify", { challengeId, code }, false),
  refresh: (refreshToken: string) =>
    call<TokenPair>("POST", "/v1/auth/token/refresh", { refreshToken }, false),

  // ── staff ──
  listStaff: (shopId: string) =>
    call<{ staff?: Staff[] }>("GET", "/v1/auth/staff" + qs({ shopId }))
      .then((r) => r.staff ?? []),
  inviteMechanic: (shopId: string, phone: string, name: string) =>
    call<Staff>("POST", "/v1/auth/staff/invite", { shopId, phone, name }),
  deactivateStaff: (staffId: string) =>
    call<Staff>("POST", "/v1/auth/staff/deactivate", { staffId }),
  updateStaff: (staffId: string, u: { name: string; phone: string; avatarUrl?: string }) =>
    call<Staff>("POST", `/v1/auth/staff/${staffId}`, { name: u.name, phone: u.phone, avatarUrl: u.avatarUrl ?? "" }),
  // Owner grants/revokes a worker's create-orders capability.
  setStaffPermissions: (staffId: string, canCreateOrders: boolean) =>
    call<Staff>("POST", `/v1/auth/staff/${staffId}/permissions`, { canCreateOrders }),
  // The caller's own live staff record (reflects owner-granted permissions without re-login).
  getMe: () => call<Staff>("GET", "/v1/auth/me"),

  // ── customers + vehicles ──
  listCustomers: (shopId: string, query?: string) =>
    call<{ customers?: Customer[] }>("GET", "/v1/customers" + qs({ shopId, query }))
      .then((r) => r.customers ?? []),
  getCustomer: (id: string) => call<Customer>("GET", `/v1/customers/${id}`),
  listVehicles: (customerId: string) =>
    call<{ vehicles?: Vehicle[] }>("GET", `/v1/customers/${customerId}/vehicles`)
      .then((r) => r.vehicles ?? []),
  // Every vehicle across the shop (owner Cars view); owner names are joined from listCustomers.
  listShopVehicles: (shopId: string) =>
    call<{ vehicles?: Vehicle[] }>("GET", "/v1/vehicles" + qs({ shopId }))
      .then((r) => r.vehicles ?? []),
  createCustomer: (shopId: string, c: { phone: string; name: string; language: Lang; telegramHandle?: string; walkIn?: boolean }) =>
    call<Customer>("POST", "/v1/customers", {
      shopId, phone: c.phone, name: c.name, language: langToProto(c.language),
      telegramHandle: c.telegramHandle ?? "", walkIn: !!c.walkIn,
    }),
  updateCustomer: (id: string, c: { name: string; phone: string; language: Lang; telegramHandle?: string; notes?: string; email?: string; address?: string; birthday?: string }) =>
    call<Customer>("POST", `/v1/customers/${id}`, {
      name: c.name, phone: c.phone, language: langToProto(c.language), telegramHandle: c.telegramHandle ?? "",
      notes: c.notes ?? "", email: c.email ?? "", address: c.address ?? "", birthday: c.birthday ?? "",
    }),
  deleteCustomer: (id: string) => call<Customer>("DELETE", `/v1/customers/${id}`),
  searchVehicles: (shopId: string, plate: string) =>
    call<{ vehicles?: Vehicle[] }>("GET", "/v1/vehicles/search" + qs({ shopId, plate }))
      .then((r) => r.vehicles ?? []),
  createVehicle: (v: { customerId: string; plate: string; vin?: string; make?: string; model?: string; year?: number; mileage?: number; plateType?: string; imageUrl?: string }) =>
    call<Vehicle>("POST", "/v1/vehicles", {
      customerId: v.customerId, plate: v.plate, vin: v.vin ?? "", make: v.make ?? "",
      model: v.model ?? "", year: v.year ?? 0, mileage: String(v.mileage ?? 0),
      plateType: v.plateType ?? "PLATE_TYPE_STANDARD", imageUrl: v.imageUrl ?? "",
    }),
  updateVehicle: (id: string, v: { plate: string; vin?: string; make?: string; model?: string; year?: number; mileage?: number; plateType?: string; color?: string; engine?: string; transmission?: string; notes?: string; imageUrl?: string }) =>
    call<Vehicle>("POST", `/v1/vehicles/${id}`, {
      plate: v.plate, vin: v.vin ?? "", make: v.make ?? "", model: v.model ?? "",
      year: v.year ?? 0, mileage: String(v.mileage ?? 0), plateType: v.plateType ?? "PLATE_TYPE_STANDARD",
      color: v.color ?? "", engine: v.engine ?? "", transmission: v.transmission ?? "", notes: v.notes ?? "", imageUrl: v.imageUrl ?? "",
    }),
  deleteVehicle: (id: string) => call<Vehicle>("DELETE", `/v1/vehicles/${id}`),

  // ── work orders ──
  listWorkOrders: (shopId: string, state?: WoState, mechanicId?: string, vehicleId?: string) =>
    call<{ workOrders?: WorkOrder[] }>("GET", "/v1/work-orders" + qs({
      shopId, state: state ? woStateToProto(state) : undefined, mechanicId, vehicleId,
    })).then((r) => r.workOrders ?? []),
  getWorkOrder: (id: string) => call<WorkOrder>("GET", `/v1/work-orders/${id}`),
  getAuditLog: (woId: string) =>
    call<{ entries?: AuditEntry[] }>("GET", `/v1/work-orders/${woId}/audit`).then((r) => r.entries ?? []),
  createApprovalLink: (woId: string) =>
    call<{ token: string; workOrderId: string; botUsername: string; deepLink: string }>("POST", `/v1/work-orders/${woId}/approval`),
  createWorkOrder: (shopId: string, vehicleId: string) =>
    call<WorkOrder>("POST", "/v1/work-orders", { shopId, vehicleId }),
  addLineItem: (woId: string, item: { kind: LineItemKind; description: string; unitPrice: number; quantity: number; cost?: number; menuItemId?: string; defaultPrice?: number; variantId?: string; consumedQty?: number }) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/line-items`, {
      lineItem: {
        kind: kindToProto(item.kind),
        description: item.description,
        unitPrice: String(item.unitPrice),
        quantity: item.quantity,
        cost: String(item.cost ?? 0),
        menuItemId: item.menuItemId ?? "",
        defaultPrice: String(item.defaultPrice ?? 0),
        variantId: item.variantId ?? "",
        consumedQty: item.consumedQty ?? 0,
      },
    }),
  updateLineItem: (woId: string, lineItemId: string, item: { description: string; unitPrice: number; quantity: number; cost?: number; consumedQty?: number }) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/line-items/${lineItemId}`, {
      description: item.description,
      unitPrice: String(item.unitPrice),
      quantity: item.quantity,
      cost: String(item.cost ?? 0),
      consumedQty: item.consumedQty ?? 0,
    }),
  removeLineItem: (woId: string, lineItemId: string) =>
    call<WorkOrder>("DELETE", `/v1/work-orders/${woId}/line-items/${lineItemId}`),
  transition: (woId: string, target: WoState) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/transition`, { target: woStateToProto(target) }),
  // Set or clear the whole-order discount. value is fixed tiyin, or basis points for percent
  // (100 = 1%); pass kind "none" (value 0) to clear.
  setOrderDiscount: (woId: string, kind: DiscountKind, value: number) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/discount`, { discountKind: discountToProto(kind), discountValue: String(kind === "none" ? 0 : value) }),
  assignMechanic: (woId: string, mechanicId: string) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/assign`, { mechanicId }),
  assignLineItem: (woId: string, lineItemId: string, mechanicId: string) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/line-items/${lineItemId}/assign`, { mechanicId }),
  setLineItemStatus: (woId: string, lineItemId: string, status: string) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/line-items/${lineItemId}/status`, { status }),
  startTimer: (woId: string, mechanicId: string) =>
    call<TimeEntryResp>("POST", `/v1/work-orders/${woId}/timer/start`, { mechanicId }),
  stopTimer: (woId: string, mechanicId: string) =>
    call<TimeEntryResp>("POST", `/v1/work-orders/${woId}/timer/stop`, { mechanicId }),

  // ── counter sales ──
  // Selling takes the stock off the shelf, issues a receipt and marks it paid in one call;
  // the gateway reverses the whole thing if any step fails. Only variantId, quantity and
  // unitPrice are read from a line — the rest is snapshotted from the warehouse.
  listSales: (shopId: string, from?: string, to?: string) =>
    call<{ sales?: Sale[] }>("GET", "/v1/sales" + qs({ shopId, from, to })).then((r) => r.sales ?? []),
  getSale: (id: string) => call<Sale>("GET", `/v1/sales/${id}`),
  createSale: (s: {
    items: { variantId: string; quantity: number; unitPrice: number }[];
    method: PaymentMethod; cardId?: string; cardNumber?: string; note?: string;
  }) =>
    call<Sale>("POST", "/v1/sales", {
      items: s.items.map((it) => ({ variantId: it.variantId, quantity: it.quantity, unitPrice: String(it.unitPrice) })),
      paymentMethod: paymentToProto(s.method),
      cardId: s.cardId ?? "",
      cardNumber: s.cardNumber ?? "",
      note: s.note ?? "",
    }),
  voidSale: (id: string) => call<Sale>("POST", `/v1/sales/${id}/void`),

  // ── pricing menu ──
  listMenuItems: (shopId: string) =>
    call<{ items?: MenuItem[] }>("GET", "/v1/menu-items" + qs({ shopId }))
      .then((r) => r.items ?? []),
  createMenuItem: (shopId: string, m: {
    name: string; defaultPrice: number; defaultCost?: number;
    category?: string; estimatedMinutes?: number;
    materials?: MenuMaterialInput[];
  }) =>
    call<MenuItem>("POST", "/v1/menu-items", {
      shopId,
      // One name field for now; duplicated across languages until AI translation lands.
      nameUzLatn: m.name, nameUzCyrl: m.name, nameRu: m.name,
      defaultPrice: String(m.defaultPrice), defaultCost: String(m.defaultCost ?? 0),
      category: m.category ?? "", estimatedMinutes: m.estimatedMinutes ?? 0,
      materials: (m.materials ?? []).map(menuMaterialBody),
    }),
  updateMenuItem: (id: string, m: {
    name: string; defaultPrice: number; defaultCost?: number; active: boolean;
    category?: string; estimatedMinutes?: number;
    materials?: MenuMaterialInput[];
  }) =>
    call<MenuItem>("POST", `/v1/menu-items/${id}`, {
      nameUzLatn: m.name, nameUzCyrl: m.name, nameRu: m.name,
      defaultPrice: String(m.defaultPrice), defaultCost: String(m.defaultCost ?? 0),
      active: m.active, category: m.category ?? "", estimatedMinutes: m.estimatedMinutes ?? 0,
      materials: (m.materials ?? []).map(menuMaterialBody),
    }),
  listMenuPriceHistory: (id: string) =>
    call<{ changes?: import("@/lib/types").MenuPriceChange[] }>("GET", `/v1/menu-items/${id}/price-history`)
      .then((r) => r.changes ?? []),

  // ── appointments ──
  listAppointments: (shopId: string, from?: string, to?: string) =>
    call<{ appointments?: Appointment[] }>("GET", "/v1/appointments" + qs({ shopId, from, to })).then((r) => r.appointments ?? []),
  createAppointment: (shopId: string, a: { title: string; customerName?: string; phone?: string; vehicleId?: string; plate?: string; mechanicId?: string; scheduledAt: string; durationMinutes?: number; notes?: string }) =>
    call<Appointment>("POST", "/v1/appointments", {
      shopId, title: a.title, customerName: a.customerName ?? "", phone: a.phone ?? "",
      vehicleId: a.vehicleId ?? "", plate: a.plate ?? "", mechanicId: a.mechanicId ?? "",
      scheduledAt: a.scheduledAt, durationMinutes: a.durationMinutes ?? 0, notes: a.notes ?? "",
    }),
  setAppointmentState: (id: string, state: string) =>
    call<Appointment>("POST", `/v1/appointments/${id}/state`, { state }),

  // ── service reminders ──
  listReminders: (shopId: string, vehicleId?: string) =>
    call<{ reminders?: ServiceReminder[] }>("GET", "/v1/reminders" + qs({ shopId, vehicleId })).then((r) => r.reminders ?? []),
  createReminder: (shopId: string, m: { title: string; vehicleId?: string; customerName?: string; phone?: string; plate?: string; dueDate?: string; dueMileage?: number; notes?: string; repeatMonths?: number; repeatKm?: number }) =>
    call<ServiceReminder>("POST", "/v1/reminders", {
      shopId, title: m.title, vehicleId: m.vehicleId ?? "", customerName: m.customerName ?? "",
      phone: m.phone ?? "", plate: m.plate ?? "", dueDate: m.dueDate ?? "",
      dueMileage: String(m.dueMileage ?? 0), notes: m.notes ?? "",
      repeatMonths: m.repeatMonths ?? 0, repeatKm: String(m.repeatKm ?? 0),
    }),
  setReminderState: (id: string, state: string) =>
    call<ServiceReminder>("POST", `/v1/reminders/${id}/state`, { state }),

  // ── warranties ──
  listWarranties: (shopId: string, vehicleId?: string) =>
    call<{ warranties?: Warranty[] }>("GET", "/v1/warranties" + qs({ shopId, vehicleId })).then((r) => r.warranties ?? []),
  createWarranty: (shopId: string, w: { title: string; vehicleId?: string; workOrderId?: string; months?: number; kmLimit?: number; startsOn?: string; note?: string }) =>
    call<Warranty>("POST", "/v1/warranties", {
      shopId, title: w.title, vehicleId: w.vehicleId ?? "", workOrderId: w.workOrderId ?? "",
      months: w.months ?? 0, kmLimit: String(w.kmLimit ?? 0), startsOn: w.startsOn ?? "", note: w.note ?? "",
    }),
  voidWarranty: (id: string) => call<Warranty>("POST", `/v1/warranties/${id}/void`),

  // ── shop expenses + P&L ──
  listExpenses: (shopId: string, from?: string, to?: string) =>
    call<{ expenses?: ShopExpense[] }>("GET", "/v1/expenses" + qs({ shopId, from, to })).then((r) => r.expenses ?? []),
  createExpense: (shopId: string, e: { category: string; amount: number; incurredOn?: string; note?: string; staffId?: string; payee?: string; paidBy?: string }) =>
    call<ShopExpense>("POST", "/v1/expenses", {
      shopId, category: e.category, amount: String(e.amount),
      incurredOn: e.incurredOn ?? "", note: e.note ?? "", staffId: e.staffId ?? "",
      payee: e.payee ?? "", paidBy: e.paidBy ?? "",
    }),
  deleteExpense: (id: string) => call<{ deleted?: boolean }>("DELETE", `/v1/expenses/${id}`),
  getProfitLoss: (shopId: string, from?: string, to?: string) =>
    call<ProfitAndLoss>("GET", "/v1/profit-loss" + qs({ shopId, from, to })),

  // ── warehouse products (with properties + variants) ──
  listProducts: (shopId: string) =>
    call<{ products?: Product[] }>("GET", "/v1/products" + qs({ shopId })).then((r) => r.products ?? []),
  getProduct: (id: string) => call<Product>("GET", `/v1/products/${id}`),
  createProduct: (shopId: string, p: ProductInput) =>
    call<Product>("POST", "/v1/products", { shopId, ...productBody(p) }),
  updateProduct: (id: string, p: ProductInput & { active?: boolean }) =>
    call<Product>("POST", `/v1/products/${id}`, { active: p.active ?? true, ...productBody(p) }),
  adjustVariantStock: (variantId: string, delta: number, reason: string, opts?: { contragentId?: string; unitCost?: number }) =>
    call<ProductVariant>("POST", `/v1/products/variants/${variantId}/adjust`, {
      delta, reason,
      contragentId: opts?.contragentId ?? "",
      unitCost: String(opts?.unitCost ?? 0),
    }),
  listStockMovements: (variantId: string) =>
    call<{ movements?: StockMovement[] }>("GET", `/v1/products/variants/${variantId}/movements`).then((r) => r.movements ?? []),

  // ── brand/category term lists ──
  listCatalogTerms: (type: "brand" | "category") =>
    call<{ terms?: CatalogTerm[] }>("GET", "/v1/catalog-terms" + qs({ type })).then((r) => r.terms ?? []),
  listCatalogTermsAdmin: (type: "brand" | "category") =>
    call<{ terms?: CatalogTerm[] }>("GET", "/v1/admin/catalog-terms" + qs({ type })).then((r) => r.terms ?? []),
  createCatalogTerm: (type: "brand" | "category", name: string, logoUrl = "") =>
    call<CatalogTerm>("POST", "/v1/admin/catalog-terms", { type, name, logoUrl }),
  updateCatalogTerm: (id: string, name: string, active: boolean, logoUrl = "") =>
    call<CatalogTerm>("POST", `/v1/admin/catalog-terms/${id}`, { name, active, logoUrl }),
  deleteCatalogTerm: (id: string) =>
    call<{ ok?: boolean }>("POST", `/v1/admin/catalog-terms/${id}/delete`, {}),

  // ── contragents (suppliers) ──
  listContragents: (includeInactive = false) =>
    call<{ contragents?: Contragent[] }>("GET", "/v1/contragents" + qs({ include_inactive: includeInactive ? "true" : undefined })).then((r) => r.contragents ?? []),
  createContragent: (c: { name: string; phone?: string; address?: string; notes?: string; brand?: string }) =>
    call<Contragent>("POST", "/v1/contragents", { name: c.name, phone: c.phone ?? "", address: c.address ?? "", notes: c.notes ?? "", brand: c.brand ?? "" }),
  updateContragent: (id: string, c: { name: string; phone?: string; address?: string; notes?: string; active?: boolean; brand?: string }) =>
    call<Contragent>("POST", `/v1/contragents/${id}`, { name: c.name, phone: c.phone ?? "", address: c.address ?? "", notes: c.notes ?? "", active: c.active ?? true, brand: c.brand ?? "" }),
  deleteContragent: (id: string) =>
    call<{ ok?: boolean }>("POST", `/v1/contragents/${id}/delete`, {}),

  // ── predefined property catalog ──
  // Open read (active only) — used by the product form to offer predefined properties.
  listPropertyDefinitions: () =>
    call<{ definitions?: PropertyDefinition[] }>("GET", "/v1/property-definitions").then((r) => r.definitions ?? []),
  // Admin catalog management (super-admin only).
  listPropertyDefinitionsAdmin: () =>
    call<{ definitions?: PropertyDefinition[] }>("GET", "/v1/admin/property-definitions").then((r) => r.definitions ?? []),
  createPropertyDefinition: (d: PropertyDefinitionInput) =>
    call<PropertyDefinition>("POST", "/v1/admin/property-definitions", propertyDefinitionBody(d)),
  updatePropertyDefinition: (id: string, d: PropertyDefinitionInput & { active?: boolean }) =>
    call<PropertyDefinition>("POST", `/v1/admin/property-definitions/${id}`, { ...propertyDefinitionBody(d), active: d.active ?? true }),
  deletePropertyDefinition: (id: string) =>
    call<{ ok?: boolean }>("POST", `/v1/admin/property-definitions/${id}/delete`, {}),

  // ── shop policy: pricing + status flow ──
  // shopId is taken from the auth context by the gateway, so it is not sent. Both fields
  // travel together, so a caller changing one must pass the other's current value.
  getShopSettings: () => call<ShopSettings>("GET", "/v1/shop/settings"),
  updateShopSettings: (s: { maxDiscountPercent: number; enabledStates?: string[] }) =>
    call<ShopSettings>("POST", "/v1/shop/settings", {
      maxDiscountPercent: s.maxDiscountPercent,
      enabledStates: s.enabledStates ?? [],
    }),

  // ── invoices ──
  listInvoices: (shopId: string) =>
    call<{ invoices?: Invoice[] }>("GET", "/v1/invoices" + qs({ shopId }))
      .then((r) => r.invoices ?? []),
  getInvoice: (id: string) => call<Invoice>("GET", `/v1/invoices/${id}`),
  generateInvoice: (shopId: string, workOrderId: string, total: number) =>
    call<Invoice>("POST", "/v1/invoices", { shopId, workOrderId, total: String(total) }),
  markPaid: (id: string, method: PaymentMethod, card?: { cardId?: string; cardNumber?: string }) =>
    call<Invoice>("POST", `/v1/invoices/${id}/pay`, {
      paymentMethod: paymentToProto(method),
      cardId: card?.cardId ?? "",
      cardNumber: card?.cardNumber ?? "",
    }),

  // ── shop payment cards (the shop's own receiving cards) ──
  // Degrades to an empty list on a backend that predates shop cards, so the pay flow still
  // works (cash/other, plus an ad-hoc card number) instead of erroring.
  listShopCards: (shopId?: string) =>
    optional(
      call<{ cards?: ShopCard[] }>("GET", "/v1/shop-cards" + (shopId ? qs({ shopId }) : ""))
        .then((r) => r.cards ?? []),
      [] as ShopCard[],
    ),
  createShopCard: (c: { label?: string; cardNumber: string; holder?: string }) =>
    call<ShopCard>("POST", "/v1/shop-cards", { label: c.label ?? "", cardNumber: c.cardNumber, holder: c.holder ?? "" }),
  updateShopCard: (id: string, c: { label?: string; cardNumber: string; holder?: string; active?: boolean }) =>
    call<ShopCard>("POST", `/v1/shop-cards/${id}`, { label: c.label ?? "", cardNumber: c.cardNumber, holder: c.holder ?? "", active: c.active ?? true }),
  deleteShopCard: (id: string) =>
    call<{ id: string }>("DELETE", `/v1/shop-cards/${id}`),

  // ── super-admin user management (admin only) ──
  listAllStaff: () =>
    call<{ staff?: Staff[] }>("GET", "/v1/admin/staff").then((r) => r.staff ?? []),
  setStaffActive: (staffId: string, active: boolean) =>
    call<Staff>("POST", "/v1/admin/staff/active", { staffId, active }),
  setStaffRole: (staffId: string, role: Role) =>
    call<Staff>("POST", "/v1/admin/staff/role", { staffId, role: roleToProto(role) }),

  // ── super-admin integration credentials ──
  listIntegrations: () =>
    call<{ integrations?: Integration[] }>("GET", "/v1/admin/integrations").then((r) => r.integrations ?? []),
  getIntegration: (provider: string) =>
    call<Integration>("GET", `/v1/admin/integrations/${provider}`),
  updateIntegration: (provider: string, values: Record<string, string>) =>
    call<Integration>("POST", `/v1/admin/integrations/${provider}`, { values }),
  sendTestSms: (phone: string) =>
    call<{ delivered?: boolean; detail?: string }>("POST", "/v1/admin/sms/test", { phone }),
  testIntegration: (provider: string) =>
    call<{ ok?: boolean; detail?: string }>("POST", `/v1/admin/integrations/${provider}/test`),

  // ── car catalog (read: any role; create: admin only) ──
  listCarMakes: () =>
    call<{ makes?: CarMake[] }>("GET", "/v1/car-makes").then((r) => r.makes ?? []),
  listCarModels: (makeId?: string) =>
    call<{ models?: CarModel[] }>("GET", "/v1/car-models" + qs({ makeId }))
      .then((r) => r.models ?? []),
  createCarMake: (name: string, country: string) =>
    call<CarMake>("POST", "/v1/admin/car-makes", { name, country }),
  updateCarMake: (id: string, name: string, country: string, logoUrl: string) =>
    call<CarMake>("POST", `/v1/admin/car-makes/${id}`, { name, country, logoUrl }),
  // ── demo/sales leads (super-admin) ──
  listDemoRequests: () =>
    call<{ requests?: DemoRequest[] }>("GET", "/v1/admin/demo-requests").then((r) => r.requests ?? []),
  setDemoRequestStatus: (id: string, status: string) =>
    call<DemoRequest>("POST", `/v1/admin/demo-requests/${id}/status`, { status }),

  // ── sales CRM leads (super-admin) ──
  listLeads: () =>
    call<{ leads?: Lead[] }>("GET", "/v1/admin/leads").then((r) => r.leads ?? []),
  createLead: (l: Partial<Lead>) =>
    call<Lead>("POST", "/v1/admin/leads", leadBody(l)),
  updateLead: (id: string, l: Partial<Lead>) =>
    call<Lead>("POST", `/v1/admin/leads/${id}`, leadBody(l)),
  deleteLead: (id: string) =>
    call<{ ok?: boolean }>("POST", `/v1/admin/leads/${id}/delete`, {}),

  createCarModel: (makeId: string, name: string, bodyType: string) =>
    call<CarModel>("POST", "/v1/admin/car-models", { makeId, name, bodyType }),

  // ── dashboard + reports ──
  dashboard: (shopId: string) => call<Dashboard>("GET", "/v1/dashboard" + qs({ shopId })),
  report: (shopId: string, kindKey: string) =>
    call<Report>("GET", "/v1/reports" + qs({ shopId, kind: REPORT_KINDS[kindKey] || kindKey })),
  // Income broken down by payment method + receiving card over an optional date window.
  // Dates are YYYY-MM-DD; pass an ISO string and it is truncated.
  // Degrades to no rows on a backend that predates the payment-methods report, so the
  // breakdown shows its empty state rather than breaking the page around it.
  paymentBreakdown: (shopId: string, from?: string, to?: string) =>
    optional(
      call<Report>("GET", "/v1/reports" + qs({ shopId, kind: "REPORT_KIND_PAYMENT_METHODS", from: from?.slice(0, 10), to: to?.slice(0, 10) }))
        .then((r) => (r.rows ?? []).map((row) => ({
          method: row.cells.method || "other",
          cardId: row.cells.card_id || "",
          cardLabel: row.cells.card_label || "",
          cardNumber: row.cells.card_number || "",
          amount: Number(row.cells.amount || 0),
          count: Number(row.cells.count || 0),
        }))),
      [] as { method: string; cardId: string; cardLabel: string; cardNumber: string; amount: number; count: number }[],
    ),

  // ── super-admin platform analytics ──
  // Top-selling services aggregated across every shop. shop_id is intentionally not sent:
  // the gateway forces the platform report kind, which aggregates across all tenants.
  platformServiceStats: () => call<Report>("GET", "/v1/admin/reports/services"),

  // ── AI assistant ──
  // One assistant turn. The gateway runs an OpenAI tool-calling loop against a strictly
  // read-only, shop-scoped tool registry (same tools the MCP endpoint exposes) and returns
  // an HTML fragment to render in the chat. Owners are scoped to their shop; super-admins
  // see all shops.
  aiChat: (messages: { role: "user" | "assistant"; content: string }[], conversationId?: string) =>
    call<{ reply?: string; conversationId?: string; error?: string }>("POST", "/v1/ai/chat", { conversationId, messages }),
  // Saved chat threads (scoped to the caller server-side).
  listConversations: () =>
    call<{ conversations?: AiConversation[] }>("GET", "/v1/ai/conversations").then((r) => r.conversations ?? []),
  getConversation: (id: string) =>
    call<{ conversation?: AiConversation; messages?: AiChatMessage[] }>("GET", `/v1/ai/conversations/${id}`),
  deleteConversation: (id: string) =>
    call<{ ok?: boolean }>("POST", `/v1/ai/conversations/${id}/delete`, {}),
};

interface TimeEntryResp { id: string; workOrderId: string; mechanicId: string; startedAt?: string; stoppedAt?: string }
