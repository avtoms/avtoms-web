// What a person may do, as the console understands it.
//
// The catalogue is the contract in auth.proto and the gateway is the thing that enforces it —
// nothing here is a security boundary. What this file does is stop the console offering a
// person a screen the server will refuse them, which is the difference between an app that
// fits the job somebody was hired for and an app full of buttons that produce an error.

import type { Session } from "./session";

export type Permission =
  | "orders.view" | "orders.create" | "orders.edit" | "orders.assign"
  | "sales.view" | "sales.manage"
  | "warehouse.view" | "warehouse.manage"
  | "customers.manage" | "catalog.manage"
  | "finance.view" | "finance.manage"
  | "staff.manage" | "settings.manage" | "ai.use";

// The order the permission matrix is drawn in — grouped the way a person thinks about the
// shop, not alphabetically. Each group is a heading on the role form.
export const PERM_GROUPS: { titleKey: string; perms: Permission[] }[] = [
  { titleKey: "perm_grp_orders", perms: ["orders.view", "orders.create", "orders.edit", "orders.assign"] },
  { titleKey: "perm_grp_sales", perms: ["sales.view", "sales.manage"] },
  { titleKey: "perm_grp_warehouse", perms: ["warehouse.view", "warehouse.manage", "catalog.manage"] },
  { titleKey: "perm_grp_clients", perms: ["customers.manage"] },
  { titleKey: "perm_grp_finance", perms: ["finance.view", "finance.manage"] },
  { titleKey: "perm_grp_admin", perms: ["staff.manage", "settings.manage", "ai.use"] },
];

export const ALL_PERMS: Permission[] = PERM_GROUPS.flatMap((g) => g.perms);

// i18n key for a permission's name and for the sentence explaining what it actually lets
// somebody do. Two keys rather than one because "Moliya" tells an owner nothing about whether
// ticking it shows this person the month's profit.
export const permLabel = (p: string) => "perm_" + p.replace(".", "_");
export const permHint = (p: string) => "perm_" + p.replace(".", "_") + "_hint";

// can reports whether the signed-in person holds a permission.
//
// Owners and super-admins hold everything. The server says so too — this mirrors it so the
// console does not depend on a list arriving before it can draw itself.
export function can(session: Session | null, permission: Permission): boolean {
  if (!session) return false;
  if (session.role === "owner" || session.role === "admin") return true;
  return (session.permissions ?? []).includes(permission);
}

// canAny reports whether the person holds at least one of these — used for a screen two
// different jobs reach.
export function canAny(session: Session | null, ...permissions: Permission[]): boolean {
  return permissions.some((p) => can(session, p));
}

// ── where a person lands ──

// MECHANIC_BOARD is everything the mechanic app can do: see the board, work an order, open one.
// A worker holding only these is a mechanic, and that app is the whole of their job — a
// phone-sized board rather than a console with a single screen in it.
//
// Holding anything else means somebody was given work the mechanic app has no screen for, so
// the console is their home instead. This is the line between "a mechanic" and "staff", drawn
// by what they were granted rather than by a role enum that only knows two kinds of person.
const MECHANIC_BOARD: Permission[] = ["orders.view", "orders.edit", "orders.create"];

// CONSOLE_HOMES is the console's screens in the order somebody should be dropped into them,
// each with the permission that opens it. First match wins.
//
// The dashboard is not the answer for everybody: it is the month's money, and a cashier who
// cannot see the month's money would land on a page that fails before it renders.
const CONSOLE_HOMES: { route: string; perm: Permission }[] = [
  { route: "/dashboard", perm: "finance.view" },
  { route: "/work-orders", perm: "orders.view" },
  { route: "/sales", perm: "sales.view" },
  { route: "/sales", perm: "sales.manage" },
  { route: "/customers", perm: "customers.manage" },
  { route: "/inventory", perm: "warehouse.view" },
  { route: "/inventory", perm: "warehouse.manage" },
  { route: "/menu", perm: "catalog.manage" },
  { route: "/invoices", perm: "finance.manage" },
  { route: "/staff", perm: "staff.manage" },
  { route: "/settings", perm: "settings.manage" },
];

// consoleWorker reports whether a non-owner belongs in the console rather than the mechanic app.
export function consoleWorker(session: Session | null): boolean {
  return (session?.permissions ?? []).some((p) => !(MECHANIC_BOARD as string[]).includes(p));
}

// homeFor picks where somebody lands. An owner has always had the dashboard; a worker gets the
// first screen they can actually open, which for a cashier is the till and for a storekeeper is
// the shelves. Somebody granted nothing at all goes to the mechanic app, where an empty board
// says more plainly than an empty console that their access has not been set up yet.
export function homeFor(session: Session | null): string {
  if (!session) return "/login";
  // Admins belong to the separate admin console (its own domain); middleware
  // redirects them there, so no route in this app is ever their home.
  if (session.role === "admin") return "/login";
  if (session.role === "owner") return "/dashboard";
  if (!consoleWorker(session)) return "/m";
  return CONSOLE_HOMES.find((h) => can(session, h.perm))?.route ?? "/m";
}
