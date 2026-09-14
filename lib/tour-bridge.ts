// Where the onboarding tour and the app's own forms meet.
//
// While a tour step asks for a record, it leaves here the demo values it wants, and the real
// form — opened by the shop from the real screen — starts from them instead of blank. The
// shop goes through the actual page and the actual dialog; it just doesn't have to invent an
// oil change. lib/api announces what gets made, so the tour sees the save land.
export type TourPrefill = {
  part?: { name: string; unit: string; qty: number; cost: number; price: number };
  service?: {
    name: string; price: number; minutes: number;
    material?: { name: string; qty: number; unit: string; cost: number; price: number; variantId: string };
  };
  order?: { name: string; phone: string; plate: string; make: string; model: string; year: number; km: number };
};

let pending: TourPrefill = {};

/** setTourPrefill replaces what the tour is currently asking for ({} when nothing). */
export function setTourPrefill(p: TourPrefill) { pending = p; }

/** tourPrefill is the demo values a form should start from, when a tour step wants one. */
export function tourPrefill<K extends keyof TourPrefill>(k: K): TourPrefill[K] { return pending[k]; }

export type CreatedKind = "product" | "menuItem" | "customer" | "vehicle" | "workOrder";
export const CREATED_EVENT = "an:created";

/** announceCreated tells whoever is listening (the tour) that a record was just made. */
export function announceCreated<T>(kind: CreatedKind) {
  return (value: T): T => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CREATED_EVENT, { detail: { kind, value } }));
    return value;
  };
}
