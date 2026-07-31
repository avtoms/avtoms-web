"use client";
// Turning a staff id into a name, in one place.
//
// Every history in the app records WHO did the thing — an audit entry's actor, a ledger
// entry's staff, who sold a sale, who received stock. None of them store the name, and
// rightly so: a name can change, and a record that froze it would slowly stop matching the
// person. So the name is resolved at read time, from the shop's staff list.
//
// Before this, three screens each did that themselves and each got it slightly wrong. The
// order's audit trail resolved against the MECHANIC list, so every action by the owner — most
// of them — fell through to a meaningless slice of a UUID. Finances resolved against ACTIVE
// staff only, so the moment somebody left, the expenses they had recorded lost their name.
//
// Hence: every staff member, whatever their role and whether or not they still work here.
// History is about who did it at the time, not who is on the payroll today.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers";
import { api } from "@/lib/api";
import type { Staff } from "@/lib/types";

// One request per shop, shared by every component that mounts. Several history views can be
// on screen at once (an order's audit trail beside its line items, a debt book over a client
// list) and each fetching the roster separately would be wasteful and race.
const cache = new Map<string, Promise<Staff[]>>();

function load(shopId: string): Promise<Staff[]> {
  let p = cache.get(shopId);
  if (!p) {
    p = api.listStaff(shopId).catch(() => [] as Staff[]);
    cache.set(shopId, p);
  }
  return p;
}

/**
 * useStaffNames returns a resolver from staff id to display name.
 *
 * An id it cannot place returns an empty string rather than a fragment of the UUID: "changed
 * by 3f8a91c2" tells a shop owner nothing at all, and reads like a bug. The callers below all
 * drop the attribution entirely when the name is empty, which is the honest outcome — the
 * record says the action happened and does not pretend to know who by.
 */
export function useStaffNames(): (id?: string) => string {
  const { session } = useAuth();
  const shopId = session?.staff.shopId;
  const [byID, setByID] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!shopId) return;
    let alive = true;
    void load(shopId).then((list) => {
      if (!alive) return;
      const m: Record<string, string> = {};
      for (const s of list) if (s.id) m[s.id] = s.name || "";
      setByID(m);
    });
    return () => { alive = false; };
  }, [shopId]);

  return useCallback((id?: string) => (id ? byID[id] ?? "" : ""), [byID]);
}
