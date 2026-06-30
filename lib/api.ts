// Typed client for the gateway. The browser calls the gateway directly using
// NEXT_PUBLIC_API_BASE_URL; CORS is enabled on the gateway. The bearer token is read
// from the session cookie.
import { getSession, setSession, clearSession, sessionFromTokenPair } from "./session";
import type {
  TokenPair, RequestOtpResponse, Staff, Customer, Vehicle, WorkOrder,
  MenuItem, Invoice, Dashboard, Report, LineItem, CarMake, CarModel, ShopSettings, Integration, Part, Appointment, AuditEntry, ServiceReminder, ShopExpense, ProfitAndLoss, Warranty, DemoRequest,
} from "./types";
import {
  langToProto, kindToProto, woStateToProto, paymentToProto, roleToProto, REPORT_KINDS,
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
}

// Single in-flight refresh shared by all concurrent 401s, so the rotating refresh token
// is only spent once. Resolves true when a fresh access token was stored.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const s = getSession();
  if (!s?.refreshToken) return false;
  try {
    const res = await fetch(API_BASE + "/v1/auth/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: s.refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const tp = JSON.parse(await res.text()) as TokenPair;
    if (!tp?.accessToken) return false;
    setSession(sessionFromTokenPair(tp));
    return true;
  } catch {
    return false;
  }
}

async function call<T>(method: string, path: string, body?: unknown, auth = true, retried = false): Promise<T> {
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
  // Access token expired → transparently refresh once and retry, so sessions don't expire
  // while the refresh token is still valid.
  if (res.status === 401 && auth && !retried) {
    if (!refreshInFlight) refreshInFlight = refreshSession().finally(() => { refreshInFlight = null; });
    if (await refreshInFlight) {
      return call<T>(method, path, body, auth, true);
    }
    // Refresh failed → the session is truly dead; clear it and bounce to login.
    clearSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
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

export const api = {
  // ── uploads (multipart, returns the stored object's public URL) ──
  uploadImage: async (file: File, retried = false): Promise<string> => {
    const form = new FormData();
    form.append("file", file);
    const s = getSession();
    const res = await fetch(API_BASE + "/v1/uploads", {
      method: "POST",
      headers: s?.token ? { Authorization: `Bearer ${s.token}` } : {},
      body: form,
    });
    if (res.status === 401 && !retried) {
      if (!refreshInFlight) refreshInFlight = refreshSession().finally(() => { refreshInFlight = null; });
      if (await refreshInFlight) return api.uploadImage(file, true);
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new ApiError(res.status, data.message || data.error || `HTTP ${res.status}`);
    return data.url as string;
  },

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
  addLineItem: (woId: string, item: { kind: LineItemKind; description: string; unitPrice: number; quantity: number; cost?: number; menuItemId?: string; defaultPrice?: number }) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/line-items`, {
      lineItem: {
        kind: kindToProto(item.kind),
        description: item.description,
        unitPrice: String(item.unitPrice),
        quantity: item.quantity,
        cost: String(item.cost ?? 0),
        menuItemId: item.menuItemId ?? "",
        defaultPrice: String(item.defaultPrice ?? 0),
      },
    }),
  removeLineItem: (woId: string, lineItemId: string) =>
    call<WorkOrder>("DELETE", `/v1/work-orders/${woId}/line-items/${lineItemId}`),
  transition: (woId: string, target: WoState) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/transition`, { target: woStateToProto(target) }),
  assignMechanic: (woId: string, mechanicId: string) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/assign`, { mechanicId }),
  assignLineItem: (woId: string, lineItemId: string, mechanicId: string) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/line-items/${lineItemId}/assign`, { mechanicId }),
  startTimer: (woId: string, mechanicId: string) =>
    call<TimeEntryResp>("POST", `/v1/work-orders/${woId}/timer/start`, { mechanicId }),
  stopTimer: (woId: string, mechanicId: string) =>
    call<TimeEntryResp>("POST", `/v1/work-orders/${woId}/timer/stop`, { mechanicId }),

  // ── pricing menu ──
  listMenuItems: (shopId: string) =>
    call<{ items?: MenuItem[] }>("GET", "/v1/menu-items" + qs({ shopId }))
      .then((r) => r.items ?? []),
  createMenuItem: (shopId: string, m: {
    name: string; defaultPrice: number; defaultCost?: number;
    category?: string; estimatedMinutes?: number;
    materials?: { name: string; quantity: number; unit: string; unitCost: number; unitPrice: number }[];
  }) =>
    call<MenuItem>("POST", "/v1/menu-items", {
      shopId,
      // One name field for now; duplicated across languages until AI translation lands.
      nameUzLatn: m.name, nameUzCyrl: m.name, nameRu: m.name,
      defaultPrice: String(m.defaultPrice), defaultCost: String(m.defaultCost ?? 0),
      category: m.category ?? "", estimatedMinutes: m.estimatedMinutes ?? 0,
      materials: (m.materials ?? []).map((x) => ({
        name: x.name, quantity: x.quantity, unit: x.unit, unitCost: String(x.unitCost), unitPrice: String(x.unitPrice),
      })),
    }),
  updateMenuItem: (id: string, m: {
    name: string; defaultPrice: number; defaultCost?: number; active: boolean;
    category?: string; estimatedMinutes?: number;
    materials?: { name: string; quantity: number; unit: string; unitCost: number; unitPrice: number }[];
  }) =>
    call<MenuItem>("POST", `/v1/menu-items/${id}`, {
      nameUzLatn: m.name, nameUzCyrl: m.name, nameRu: m.name,
      defaultPrice: String(m.defaultPrice), defaultCost: String(m.defaultCost ?? 0),
      active: m.active, category: m.category ?? "", estimatedMinutes: m.estimatedMinutes ?? 0,
      materials: (m.materials ?? []).map((x) => ({
        name: x.name, quantity: x.quantity, unit: x.unit, unitCost: String(x.unitCost), unitPrice: String(x.unitPrice),
      })),
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
  createReminder: (shopId: string, m: { title: string; vehicleId?: string; customerName?: string; phone?: string; plate?: string; dueDate?: string; dueMileage?: number; notes?: string }) =>
    call<ServiceReminder>("POST", "/v1/reminders", {
      shopId, title: m.title, vehicleId: m.vehicleId ?? "", customerName: m.customerName ?? "",
      phone: m.phone ?? "", plate: m.plate ?? "", dueDate: m.dueDate ?? "",
      dueMileage: String(m.dueMileage ?? 0), notes: m.notes ?? "",
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

  // ── parts inventory ──
  listParts: (shopId: string) =>
    call<{ parts?: Part[] }>("GET", "/v1/parts" + qs({ shopId })).then((r) => r.parts ?? []),
  createPart: (shopId: string, p: { name: string; sku?: string; unit?: string; quantityOnHand: number; reorderLevel: number; unitCost: number; unitPrice: number; supplier?: string }) =>
    call<Part>("POST", "/v1/parts", {
      shopId, name: p.name, sku: p.sku ?? "", unit: p.unit ?? "",
      quantityOnHand: p.quantityOnHand, reorderLevel: p.reorderLevel,
      unitCost: String(p.unitCost), unitPrice: String(p.unitPrice), supplier: p.supplier ?? "",
    }),
  adjustStock: (partId: string, delta: number, reason: string) =>
    call<Part>("POST", `/v1/parts/${partId}/adjust`, { delta, reason }),

  // ── shop pricing policy ──
  // shopId is taken from the auth context by the gateway, so it is not sent.
  getShopSettings: () => call<ShopSettings>("GET", "/v1/shop/settings"),
  updateShopSettings: (maxDiscountPercent: number) =>
    call<ShopSettings>("POST", "/v1/shop/settings", { maxDiscountPercent }),

  // ── invoices ──
  listInvoices: (shopId: string) =>
    call<{ invoices?: Invoice[] }>("GET", "/v1/invoices" + qs({ shopId }))
      .then((r) => r.invoices ?? []),
  getInvoice: (id: string) => call<Invoice>("GET", `/v1/invoices/${id}`),
  generateInvoice: (shopId: string, workOrderId: string, total: number) =>
    call<Invoice>("POST", "/v1/invoices", { shopId, workOrderId, total: String(total) }),
  markPaid: (id: string, method: PaymentMethod) =>
    call<Invoice>("POST", `/v1/invoices/${id}/pay`, { paymentMethod: paymentToProto(method) }),

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

  createCarModel: (makeId: string, name: string, bodyType: string) =>
    call<CarModel>("POST", "/v1/admin/car-models", { makeId, name, bodyType }),

  // ── dashboard + reports ──
  dashboard: (shopId: string) => call<Dashboard>("GET", "/v1/dashboard" + qs({ shopId })),
  report: (shopId: string, kindKey: string) =>
    call<Report>("GET", "/v1/reports" + qs({ shopId, kind: REPORT_KINDS[kindKey] || kindKey })),
};

interface TimeEntryResp { id: string; workOrderId: string; mechanicId: string; startedAt?: string; stoppedAt?: string }
