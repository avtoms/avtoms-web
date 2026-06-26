// Typed client for the gateway. The browser calls the gateway directly using
// NEXT_PUBLIC_API_BASE_URL; CORS is enabled on the gateway. The bearer token is read
// from the session cookie.
import { getSession } from "./session";
import type {
  TokenPair, RequestOtpResponse, Staff, Customer, Vehicle, WorkOrder,
  MenuItem, Invoice, Dashboard, Report, LineItem, CarMake, CarModel, ShopSettings,
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

async function call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
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

  // ── customers + vehicles ──
  listCustomers: (shopId: string, query?: string) =>
    call<{ customers?: Customer[] }>("GET", "/v1/customers" + qs({ shopId, query }))
      .then((r) => r.customers ?? []),
  getCustomer: (id: string) => call<Customer>("GET", `/v1/customers/${id}`),
  createCustomer: (shopId: string, c: { phone: string; name: string; language: Lang; telegramHandle?: string; walkIn?: boolean }) =>
    call<Customer>("POST", "/v1/customers", {
      shopId, phone: c.phone, name: c.name, language: langToProto(c.language),
      telegramHandle: c.telegramHandle ?? "", walkIn: !!c.walkIn,
    }),
  searchVehicles: (shopId: string, plate: string) =>
    call<{ vehicles?: Vehicle[] }>("GET", "/v1/vehicles/search" + qs({ shopId, plate }))
      .then((r) => r.vehicles ?? []),
  createVehicle: (v: { customerId: string; plate: string; vin?: string; make?: string; model?: string; year?: number; mileage?: number }) =>
    call<Vehicle>("POST", "/v1/vehicles", {
      customerId: v.customerId, plate: v.plate, vin: v.vin ?? "", make: v.make ?? "",
      model: v.model ?? "", year: v.year ?? 0, mileage: String(v.mileage ?? 0),
    }),

  // ── work orders ──
  listWorkOrders: (shopId: string, state?: WoState, mechanicId?: string) =>
    call<{ workOrders?: WorkOrder[] }>("GET", "/v1/work-orders" + qs({
      shopId, state: state ? woStateToProto(state) : undefined, mechanicId,
    })).then((r) => r.workOrders ?? []),
  getWorkOrder: (id: string) => call<WorkOrder>("GET", `/v1/work-orders/${id}`),
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
  transition: (woId: string, target: WoState) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/transition`, { target: woStateToProto(target) }),
  assignMechanic: (woId: string, mechanicId: string) =>
    call<WorkOrder>("POST", `/v1/work-orders/${woId}/assign`, { mechanicId }),
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
    materials?: { name: string; quantity: number; unitCost: number; unitPrice: number }[];
  }) =>
    call<MenuItem>("POST", "/v1/menu-items", {
      shopId,
      // One name field for now; duplicated across languages until AI translation lands.
      nameUzLatn: m.name, nameUzCyrl: m.name, nameRu: m.name,
      defaultPrice: String(m.defaultPrice), defaultCost: String(m.defaultCost ?? 0),
      category: m.category ?? "", estimatedMinutes: m.estimatedMinutes ?? 0,
      materials: (m.materials ?? []).map((x) => ({
        name: x.name, quantity: x.quantity, unitCost: String(x.unitCost), unitPrice: String(x.unitPrice),
      })),
    }),

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

  // ── car catalog (read: any role; create: admin only) ──
  listCarMakes: () =>
    call<{ makes?: CarMake[] }>("GET", "/v1/car-makes").then((r) => r.makes ?? []),
  listCarModels: (makeId?: string) =>
    call<{ models?: CarModel[] }>("GET", "/v1/car-models" + qs({ makeId }))
      .then((r) => r.models ?? []),
  createCarMake: (name: string, country: string) =>
    call<CarMake>("POST", "/v1/admin/car-makes", { name, country }),
  createCarModel: (makeId: string, name: string, bodyType: string) =>
    call<CarModel>("POST", "/v1/admin/car-models", { makeId, name, bodyType }),

  // ── dashboard + reports ──
  dashboard: (shopId: string) => call<Dashboard>("GET", "/v1/dashboard" + qs({ shopId })),
  report: (shopId: string, kindKey: string) =>
    call<Report>("GET", "/v1/reports" + qs({ shopId, kind: REPORT_KINDS[kindKey] || kindKey })),
};

interface TimeEntryResp { id: string; workOrderId: string; mechanicId: string; startedAt?: string; stoppedAt?: string }
