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
  avatarUrl?: string;
  canCreateOrders?: boolean; // owner-granted: this worker may create work orders
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
  telegramChatId?: string;
  notes?: string;
  email?: string;
  address?: string;
  birthday?: string;
}

export interface CarMake {
  id: string;
  name: string;
  country?: string;
  logoUrl?: string;
}

export interface DemoRequest {
  id: string;
  name: string;
  shop?: string;
  phone: string;
  city?: string;
  message?: string;
  lang?: string;
  status: string; // new | contacted | closed
  createdAt?: string;
}

// Lead is a sales-CRM potential customer managed by the super-admin.
export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  imageUrl?: string;
  city?: string;
  address?: string;
  source?: string; // landing | referral | cold | telegram | instagram | walk_in | other
  status: string;  // new | contacted | qualified | negotiating | won | lost
  dealPrice?: string | number; // int64 (soum); protojson serializes as string
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// A saved AI-assistant chat thread + its turns (owner/super-admin history).
export interface AiConversation {
  id: string;
  staffId?: string;
  shopId?: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface AiChatMessage {
  id?: string;
  conversationId?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
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
  color?: string;
  engine?: string;
  transmission?: string;
  notes?: string;
  imageUrl?: string; // uploaded photo of this car
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
  assignedMechanicId?: string; // mechanic assigned to this specific service line
  status?: string; // LINE_ITEM_STATUS_PENDING | _IN_PROGRESS | _DONE
  variantId?: string; // warehouse variant this material was drawn from
  consumedQty?: number; // exact stock amount drawn (may be fractional), independent of quantity
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
  orderNo?: string | number; // per-shop sequence shown to users as "Z-0001"
  discountKind?: string;   // DISCOUNT_KIND_UNSPECIFIED | _FIXED | _PERCENT
  discountValue?: string;  // fixed tiyin, or basis points for percent (100 = 1%)
  discountAmount?: string;  // the applied order discount in tiyin
  notes?: string;
  createdAt?: string;
  activeTimerStartedAt?: string; // set when a timer is currently running
  // Denormalized for display (filled by the gateway from the customer service).
  plate?: string;
  make?: string;
  model?: string;
  customerName?: string;
  vehicleImageUrl?: string; // denormalized car photo url
}

export interface MenuMaterial {
  name: string;
  quantity: number; // amount, may be fractional (e.g. 4.5)
  unit?: string; // free-text unit of measure: litr, kg, dona, metr, ...
  unitCost?: string; // tiyin
  unitPrice?: string; // tiyin
  variantId?: string; // warehouse variant this material is drawn from (empty for ad-hoc)
}

export interface MenuPriceChange {
  id: string;
  menuItemId: string;
  oldPrice: string | number; // tiyin
  newPrice: string | number;
  oldCost?: string | number;
  newCost?: string | number;
  changedAt: string; // RFC3339
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

export interface Warranty {
  id: string;
  shopId: string;
  vehicleId?: string;
  workOrderId?: string;
  title: string;
  months?: number;
  kmLimit?: number | string;
  startsOn: string;   // RFC3339
  expiresOn?: string;  // RFC3339 (empty when months = 0)
  note?: string;
  voided?: boolean;
  createdAt: string;
}

export interface ShopExpense {
  id: string;
  shopId: string;
  category: string; // predefined (rent/salary/...) or a shop's custom free-text category
  amount: number | string; // tiyin
  incurredOn: string; // RFC3339
  note?: string;
  createdAt: string;
  staffId?: string; // optional worker this expense is for (e.g. whose salary)
  payee?: string; // optional receiver/recipient of the payment
  paidBy?: string; // optional staff id of the paying person
}

export interface ExpenseBucket {
  category: string;
  amount: number | string;
}

export interface ProfitAndLoss {
  shopId: string;
  from?: string;
  to?: string;
  revenue: number | string;
  costOfGoods: number | string;
  grossMargin: number | string;
  overhead: number | string;
  netProfit: number | string;
  workOrderCount?: number;
  byCategory?: ExpenseBucket[];
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
  repeatMonths?: number; // recurrence interval (calendar months); 0/undefined = one-off
  repeatKm?: number;     // recurrence interval (odometer km)
  seriesId?: string;     // groups a recurring reminder's occurrences (history)
}

export interface AuditEntry {
  id: string;
  workOrderId: string;
  actorId?: string; // staff id who made the change (may be empty)
  action: string;   // "state" | "line_added" | "line_removed" | "mechanic_assigned"
  detail?: string;  // human-readable detail
  createdAt: string; // RFC3339
}

// A warehouse product: shared catalog info plus named properties whose value
// combinations define the variants that are actually counted and priced.
export interface Product {
  id: string;
  shopId: string;
  name: string;
  description?: string;
  category?: string;
  unit?: string;
  supplier?: string;
  supplierId?: string; // linked contragent id ("" = none)
  brand?: string;
  active: boolean;
  properties?: ProductProperty[];
  variants?: ProductVariant[];
}

// A per-shop counterparty — chiefly a supplier ("yetkazib beruvchi") the shop
// buys products from. Managed from the owner UI, offered as the supplier dropdown.
export interface Contragent {
  id: string;
  shopId: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  active: boolean;
  brand?: string; // optional brand this supplier is tied to (matches Product.brand by name)
}

// A named option (e.g. "Size") with its allowed values.
export interface ProductProperty {
  id?: string;
  name: string;
  values: string[];
}

// The counted, priced stock unit: one combination of property values.
export interface ProductVariant {
  id?: string;
  productId?: string;
  sku?: string;
  quantityOnHand: number;
  reorderLevel: number;
  unitCost?: string; // tiyin
  unitPrice?: string; // tiyin
  active: boolean;
  attributes?: VariantAttribute[];
}

// Which value a variant has for one property, e.g. {property:"Size", value:"M"}.
export interface VariantAttribute {
  property: string;
  value: string;
}

// A predefined, admin-managed property (e.g. "Color", "Viscosity"). `kind` drives
// how the product form captures values: number = free numeric entry (with unit);
// select/color = pick from `values`; text = free text.
export interface PropertyDefinition {
  id: string;
  // Canonical name and the stable identifier a product's properties reference. The name*
  // fields are admin-editable display translations (blank falls back to name).
  name: string;
  kind: "text" | "number" | "select" | "color";
  unit?: string;
  position?: number;
  active: boolean;
  nameUzLatn?: string;
  nameUzCyrl?: string;
  nameRu?: string;
  values?: PropertyDefinitionValue[];
}

// One predefined value in a select/color property (colorHex set for color kind).
// value is the canonical identifier stored on a variant; value* are display translations.
export interface PropertyDefinitionValue {
  id?: string;
  value: string;
  colorHex?: string;
  position?: number;
  valueUzLatn?: string;
  valueUzCyrl?: string;
  valueRu?: string;
}

// One entry in an admin-managed term list (brand or category).
export interface CatalogTerm {
  id: string;
  type: "brand" | "category";
  name: string;
  position?: number;
  active: boolean;
  logoUrl?: string; // optional brand logo (superadmin-uploaded)
}

// One entry in a variant's income/outcome stock ledger.
export interface StockMovement {
  id: string;
  variantId: string;
  delta: number;        // positive = income (received), negative = outcome (consumed)
  reason: string;
  balanceAfter: number;
  createdAt: string;    // RFC3339
  staffId?: string;       // who recorded it (resolve name from the staff list)
  contragentId?: string;  // supplier who delivered (resolve name from contragents)
  unitCost?: string;      // purchase price per unit for this receipt, tiyin
}

// A counter sale: warehouse stock sold with no work order, vehicle or customer.
// description, sku and unitCost are snapshots taken when the sale was recorded.
export interface SaleItem {
  id?: string;
  variantId: string;
  description?: string;
  sku?: string;
  quantity: number;   // may be fractional (3.5 l)
  unitPrice: string;  // agreed sell price per unit (tiyin)
  unitCost?: string;
}

export interface Sale {
  id: string;
  shopId: string;
  saleNo?: string | number; // per-shop sequence, shown as "S-0001"
  staffId?: string;
  items?: SaleItem[];
  total: string;
  totalCost?: string;
  paymentMethod?: string; // PAYMENT_METHOD_CASH | _CARD | _OTHER
  cardId?: string;
  cardNumber?: string;
  invoiceId?: string;     // the receipt generated for this sale
  note?: string;
  voided?: boolean;
  voidedAt?: string;
  createdAt?: string;
}

// The analytics payload: everything the Statistics screen shows, for one period. Computed
// live from the work-order service's tables, so it covers the shop's whole history.
export interface DayPoint { day: string; revenue: string; cost: string; orders?: number; sales?: number }
export interface StateBucket { state: string; count?: number; value: string }
export interface MechanicStat { mechanicId: string; name?: string; jobs?: number; linesDone?: number; hours?: number; revenue: string }
export interface ItemStat { key: string; name: string; sku?: string; quantity?: number; revenue: string; cost: string; margin: string; times?: number }
export interface VehicleStat {
  vehicleId: string; orders?: number; revenue: string; firstAt?: string; lastAt?: string;
  plate?: string; make?: string; model?: string; customerName?: string;
}
export interface PaymentBucket { method: string; cardId?: string; cardNumber?: string; amount: string; count?: number }

export interface Statistics {
  shopId: string; from?: string; to?: string;
  revenue: string; orderRevenue: string; salesRevenue: string;
  costOfGoods: string; grossMargin: string; overhead: string; netProfit: string;
  discountsGiven: string; avgTicket: string;
  orderCount?: number; saleCount?: number;
  byDay?: DayPoint[];
  byCategory?: ExpenseBucket[];
  funnel?: StateBucket[];
  mechanics?: MechanicStat[];
  workedHours?: number;
  avgLeadTimeHours?: number;
  topServices?: ItemStat[];
  topProducts?: ItemStat[];
  stockValue: string;      // current on-hand value; not windowed
  lowStockCount?: number;
  topVehicles?: VehicleStat[];
  newCustomers?: number; returningCustomers?: number;
  payments?: PaymentBucket[];
  payable?: string;    // all-time debt to counterparties; not part of netProfit
  receivable?: string;
}

// A contragent's running account. Amounts are always positive; the direction is in `kind`.
// The balance is signed and POSITIVE MEANS THE SHOP OWES THEM. This is debt and cash — none
// of it reaches profit and loss, because a part's cost is counted when it is used or sold.
export type ContragentEntryKind =
  | "CONTRAGENT_ENTRY_KIND_PURCHASE"     // goods received from them   → +
  | "CONTRAGENT_ENTRY_KIND_PAYMENT_OUT"  // we paid them               → −
  | "CONTRAGENT_ENTRY_KIND_CHARGE"       // goods/services given       → −
  | "CONTRAGENT_ENTRY_KIND_PAYMENT_IN";  // they paid us               → +

export interface ContragentLedgerEntry {
  id: string;
  contragentId: string;
  kind: ContragentEntryKind | string;
  amount: string;
  description?: string;
  movementId?: string;   // set when it came from a stock receipt; those cannot be deleted
  method?: string;
  staffId?: string;
  note?: string;
  occurredAt?: string;
  createdAt?: string;
}

export interface ContragentBalance {
  contragentId: string;
  name: string;
  purchased: string;
  paid: string;
  charged: string;
  received: string;
  balance: string;   // signed, all-time
  lastAt?: string;
  entries?: number;
}

export interface ShopSettings {
  shopId: string;
  maxDiscountPercent: number; // 0-100; 100 = no cap
  // Proto state names, in flow order, for the statuses this shop uses. The server always
  // returns the resolved set (always-on states included); empty means every status.
  enabledStates?: string[];
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
  cardId?: string;
  cardNumber?: string;
  createdAt?: string;
}

export interface ShopCard {
  id: string;
  shopId?: string;
  label?: string;
  cardNumber: string;
  holder?: string;
  active?: boolean;
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
