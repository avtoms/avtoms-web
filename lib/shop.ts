// Shop profile (name, address, TIN, hours). There is no backend Shop entity yet, so this
// is stored locally per browser and used for the printable invoice header + Settings form.
export interface ShopProfile {
  name: string;
  address: string;
  tin: string;
  hours: string;
}

const KEY = "avtoms.shop";
const EMPTY: ShopProfile = { name: "", address: "", tin: "", hours: "" };

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

export function saveShopProfile(p: ShopProfile): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore quota */ }
}
