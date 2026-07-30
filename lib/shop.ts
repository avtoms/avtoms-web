"use client";
// Shop profile (name, address, TIN, phone, hours) — the letterhead on every check.
//
// This used to live only in the browser's localStorage, which meant it differed per device
// and, more importantly, could not be read by anything rendering a receipt on the server.
// It now lives on the shop's settings record. The local copy is kept read-only, as a
// fallback for shops that filled it in before the move and have not re-saved since.
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { transitionsFor, type WoState } from "./enums";

export interface ShopProfile {
  name: string;
  address: string;
  tin: string;
  phone: string;
  hours: string;
}

const KEY = "avtoms.shop";
const EMPTY: ShopProfile = { name: "", address: "", tin: "", phone: "", hours: "" };

/** The browser's pre-move copy. Read-only now — nothing writes it any more. */
export function loadShopProfile(): ShopProfile {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<ShopProfile>) };
  } catch {
    return { ...EMPTY };
  }
}

/** Merge the server's profile over the browser's old one, field by field. */
export function mergeShopProfile(server: Partial<ShopProfile> | null | undefined): ShopProfile {
  const local = loadShopProfile();
  const s = server ?? {};
  return {
    name: s.name || local.name,
    address: s.address || local.address,
    tin: s.tin || local.tin,
    phone: s.phone || local.phone,
    hours: s.hours || local.hours,
  };
}

/**
 * useShopProfile fetches the shop's letterhead for anything that renders a check. If the
 * request fails the local copy still shows, because a check with a missing header is worth
 * more to whoever is standing at the counter than an error.
 */
/**
 * useShopFlow returns the shop's configured status flow and the moves it permits.
 *
 * Every screen offering a state change must go through this. A shop picks which statuses
 * its orders move through, and the server derives the legal moves from that set — so a
 * screen using the full lifecycle instead offers hops the server rejects, and names a next
 * step the shop does not use. Until `enabled` arrives it is undefined, which reads as
 * "every status": the same default the server applies to an unconfigured shop.
 */
export function useShopFlow(): { enabled: string[] | undefined; transitions: Record<WoState, WoState[]> } {
  const [enabled, setEnabled] = useState<string[] | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    api.getShopSettings()
      .then((s) => { if (alive) setEnabled(s.enabledStates); })
      .catch(() => { /* fall back to the full flow, as the server does */ });
    return () => { alive = false; };
  }, []);
  const transitions = useMemo(() => transitionsFor(enabled), [enabled]);
  return { enabled, transitions };
}

export function useShopProfile(): ShopProfile {
  const [profile, setProfile] = useState<ShopProfile>(EMPTY);
  useEffect(() => {
    let alive = true;
    api.getShopSettings()
      .then((s) => { if (alive) setProfile(mergeShopProfile(s)); })
      .catch(() => { if (alive) setProfile(loadShopProfile()); });
    return () => { alive = false; };
  }, []);
  return profile;
}
