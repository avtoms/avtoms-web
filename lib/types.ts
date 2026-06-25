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
}

export interface LineItem {
  id?: string;
  kind: string; // LINE_ITEM_KIND_LABOR | LINE_ITEM_KIND_PART
  description: string;
  unitPrice: string;
  quantity: number;
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
  notes?: string;
  createdAt?: string;
  activeTimerStartedAt?: string; // set when a timer is currently running
  // Denormalized for display (filled by the gateway from the customer service).
  plate?: string;
  make?: string;
  model?: string;
  customerName?: string;
}

export interface MenuItem {
  id: string;
  shopId: string;
  nameUzLatn: string;
  nameUzCyrl: string;
  nameRu: string;
  defaultPrice: string;
  active: boolean;
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
