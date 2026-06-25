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
}

export function sessionFromTokenPair(tp: TokenPair): Session {
  return {
    token: tp.accessToken,
    refreshToken: tp.refreshToken,
    role: roleFromProto(tp.staff.role),
    staff: { id: tp.staff.id, shopId: tp.staff.shopId, phone: tp.staff.phone, name: tp.staff.name },
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
