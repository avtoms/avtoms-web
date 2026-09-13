"use client";
// The numbers on the sidebar: how many orders are moving through the shop, how many visits are
// booked today, how many bills are still unpaid, how many products are running low. Each one
// is a queue somebody should look at, so it sits on the item that opens that queue.
//
// Every count is asked only of a person allowed to see the list behind it, and a count that
// fails is simply left off — a missing badge costs nothing, an error toast on every page for a
// number in the margin would cost a great deal.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { can, canAny } from "./perms";
import type { Session } from "./session";
import { apptStateFromProto, fiscalFromProto, woStateFromProto, type WoState } from "./enums";
import { num } from "./format";
import { useAutoRefresh } from "./use-refresh";

export type NavCounts = { workorders?: number; schedule?: number; invoices?: number; inventory?: number };

// The states an order is actually moving through. A draft has not been offered to anybody yet
// and a closed or cancelled one is finished, so neither is part of the working queue.
const MOVING: WoState[] = ["estimated", "approved", "in_progress", "ready", "invoiced"];

export function useNavCounts(session: Session | null, pathname: string): NavCounts {
  const [counts, setCounts] = useState<NavCounts>({});
  const shopId = session?.staff.shopId;
  const perms = session ? `${session.role}|${(session.permissions ?? []).join(",")}` : "";
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const lastLoad = useRef(0);

  const load = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || !shopId) return;
    lastLoad.current = Date.now();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const [wos, appts, invs, prods] = await Promise.all([
      can(s, "orders.view") ? api.listWorkOrders(shopId).catch(() => null) : null,
      can(s, "customers.manage") ? api.listAppointments(shopId, start.toISOString(), end.toISOString()).catch(() => null) : null,
      can(s, "finance.manage") ? api.listInvoices(shopId).catch(() => null) : null,
      canAny(s, "warehouse.view", "warehouse.manage") ? api.listProducts(shopId).catch(() => null) : null,
    ]);
    setCounts({
      workorders: wos ? wos.filter((w) => MOVING.includes(woStateFromProto(w.state))).length : undefined,
      schedule: appts ? appts.filter((a) => apptStateFromProto(a.state) === "scheduled").length : undefined,
      invoices: invs ? invs.filter((i) => !i.paid && fiscalFromProto(i.fiscalStatus) !== "voided").length : undefined,
      // Same test the warehouse screen uses to flag a product, so the badge and the list agree.
      inventory: prods
        ? prods.filter((p) => p.active !== false && (p.variants ?? []).some((v) => num(v.quantityOnHand) <= num(v.reorderLevel))).length
        : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, perms]);

  // Moving between screens is when a count is most likely to have changed (an order was just
  // invoiced, a delivery just received) — but not every click is worth four requests.
  useEffect(() => {
    if (Date.now() - lastLoad.current < 15000) return;
    void load();
  }, [load, pathname]);
  useAutoRefresh(load, { intervalMs: 60000 });

  return counts;
}
