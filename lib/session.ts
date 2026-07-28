// Session is persisted in a cookie so it survives reloads and is readable by both the
// client (to attach the bearer token) and middleware (to route by role).
import type { Role } from "./enums";
import { roleFromProto } from "./enums";
import type { TokenPair } from "./types";

export const SESSION_COOKIE = "an_session";

export interface Session {
  token: string;
  refreshToken: string;
  role: Role;
  staff: { id: string; shopId: string; phone: string; name: string };
  // When the access token stops being accepted, as epoch ms. Knowing this lets the API layer
  // refresh *before* a request fails instead of discovering expiry by 401-ing a whole page of
  // requests at once. Undefined on sessions stored before this field existed — treated as
  // "unknown", which falls back to the reactive 401 path.
  expiresAt?: number;
}

// jwtExp reads the `exp` claim (seconds) from a JWT payload without verifying it — the server
// is the only authority on validity; this is purely to know when to refresh. Returns undefined
// for anything unparseable rather than throwing.
function jwtExp(token: string): number | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === "number" ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export function sessionFromTokenPair(tp: TokenPair): Session {
  // Prefer the server's expires_in (seconds); fall back to the token's own exp claim.
  const ttlMs = tp.expiresIn ? Number(tp.expiresIn) * 1000 : NaN;
  const expiresAt = Number.isFinite(ttlMs) && ttlMs > 0 ? Date.now() + ttlMs : jwtExp(tp.accessToken);
  return {
    token: tp.accessToken,
    refreshToken: tp.refreshToken,
    role: roleFromProto(tp.staff.role),
    staff: { id: tp.staff.id, shopId: tp.staff.shopId, phone: tp.staff.phone, name: tp.staff.name },
    expiresAt,
  };
}

export function parseSession(raw: string | undefined | null): Session | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as Session;
  } catch {
    return null;
  }
}

// ── client-side cookie access ──
export function getSession(): Session | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + SESSION_COOKIE + "=([^;]*)"));
  return parseSession(m ? m[1] : null);
}

export function setSession(s: Session) {
  if (typeof document === "undefined") return;
  const val = encodeURIComponent(JSON.stringify(s));
  // 30-day cookie; SameSite=Lax so it rides top-level navigations.
  document.cookie = `${SESSION_COOKIE}=${val}; path=/; max-age=${30 * 24 * 3600}; SameSite=Lax`;
}

export function clearSession() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
