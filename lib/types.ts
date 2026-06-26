// API DTOs as serialized by the gateway (protojson: camelCase fields, int64 as strings,
// enums as proto NAME strings). Use the helpers in enums.ts to convert to app keys.

export interface Staff {
  id: string;
  shopId: string;
  phone: string;
  name: string;
  role: string; // ROLE_OWNER | ROLE_MECHANIC
  active: boolean;
  createdAt?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn?: string;
  staff: Staff;
}

export interface RequestOtpResponse {
  challengeId: string;
  resendAfterSeconds?: number;
}

export interface Customer {
  id: string;
  shopId: string;
  phone: string;
  name: string;
  language?: string;
  telegramHandle?: string;
  walkIn?: boolean;
  deleted?: boolean;
  createdAt?: string;
}

export interface CarMake {
  id: string;
  name: string;
  country?: string;
}

export interface CarModel {
  id: string;
  makeId: string;
  name: string;
  bodyType?: string;
}

export interface Vehicle {
  id: string;
  customerId: string;
  plate: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  mileage?: string;
  deleted?: boolean;
  plateType?: string; // PLATE_TYPE_* (see lib/enums plateTypeFromProto)
}

export interface LineItem {
  id?: string;
  kind: string; // LINE_ITEM_KIND_SERVICE | LINE_ITEM_KIND_MATERIAL | (legacy) LABOR | PART
  description: string;
  unitPrice: string; // agreed/negotiated sell price per unit (tiyin)
  quantity: number;
  cost?: string; // shop expense (buy price) per unit (tiyin)
  menuItemId?: string; // source menu item, when added from the price list
  defaultPrice?: string; // menu price snapshot at add time, for discount audit (tiyin)
}

export interface TimeEntry {
  id: string;
  workOrderId: string;
  mechanicId: string;
  startedAt?: string;
  stoppedAt?: string;
}

export interface WorkOrder {
  id: string;
  shopId: string;
  vehicleId: string;
  assignedMechanicId?: string;
  state: string;
  lineItems?: LineItem[];
  subtotal?: string;
  vat?: string;
  total?: string;
  totalCost?: string; // shop's total expense on this order (tiyin)
  totalMargin?: string; // gross margin before VAT: subtotal - totalCost (tiyin)
  notes?: string;
  createdAt?: string;
  activeTimerStartedAt?: string; // set when a timer is currently running
  // Denormalized for display (filled by the gateway from the customer service).
  plate?: string;
  make?: string;
  model?: string;
  customerName?: string;
}

export interface MenuMaterial {
  name: string;
  quantity: number; // amount, may be fractional (e.g. 4.5)
  unit?: string; // free-text unit of measure: litr, kg, dona, metr, ...
  unitCost?: string; // tiyin
  unitPrice?: string; // tiyin
}

export interface MenuItem {
  id: string;
  shopId: string;
  nameUzLatn: string;
  nameUzCyrl: string;
  nameRu: string;
  defaultPrice: string;
  defaultCost?: string; // optional default shop expense per unit (tiyin)
  active: boolean;
  category?: string;
  estimatedMinutes?: number;
  materials?: MenuMaterial[]; // parts/materials this service is expected to need
}

export interface Appointment {
  id: string;
  shopId: string;
  title?: string;
  customerName?: string;
  phone?: string;
  vehicleId?: string;
  plate?: string;
  mechanicId?: string;
  scheduledAt: string; // RFC3339
  durationMinutes?: number;
  state: string; // APPOINTMENT_STATE_*
  notes?: string;
}

export interface ServiceReminder {
  id: string;
  shopId: string;
  vehicleId?: string;
  customerName?: string;
  phone?: string;
  plate?: string;
  title: string;
  dueDate?: string;   // RFC3339 (optional)
  dueMileage?: number; // odometer target km (optional)
  notes?: string;
  state: string; // SERVICE_REMINDER_STATE_*
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  workOrderId: string;
  actorId?: string; // staff id who made the change (may be empty)
  action: string;   // "state" | "line_added" | "line_removed" | "mechanic_assigned"
  detail?: string;  // human-readable detail
  createdAt: string; // RFC3339
}

export interface Part {
  id: string;
  shopId: string;
  name: string;
  sku?: string;
  unit?: string;
  quantityOnHand: number;
  reorderLevel: number;
  unitCost?: string; // tiyin
  unitPrice?: string; // tiyin
  supplier?: string;
  active: boolean;
}

export interface ShopSettings {
  shopId: string;
  maxDiscountPercent: number; // 0-100; 100 = no cap
}

export interface Integration {
  provider: string;
  values: Record<string, string>; // secret values are blank on read
  configured: boolean;
}

export interface Invoice {
  id: string;
  shopId: string;
  workOrderId: string;
  total: string;
  fiscalStatus: string;
  fiscalQr?: string;
  fiscalReceiptId?: string;
  paid?: boolean;
  paymentMethod?: string;
  createdAt?: string;
}

export interface Dashboard {
  todaysRevenue?: string;
  jobsInProgress?: number;
  readyForPickup?: number;
  awaitingApproval?: number;
  fiscalHealth?: string;
}

export interface ReportRow {
  cells: Record<string, string>;
}
export interface Report {
  kind: string;
  columns: string[];
  rows: ReportRow[];
}
