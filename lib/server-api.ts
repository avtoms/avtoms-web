// Server-side data fetching for SSR pages (admin panel). Reads the session cookie via
// next/headers and calls the gateway from the server with the bearer token. Use this in
// React Server Components; for mutations use the client `api` from a client island.
import { cookies } from "next/headers";
import { SESSION_COOKIE, parseSession, type Session } from "./session";

// Server may reach the gateway at a different host than the browser (e.g. in Docker).
// Prefer a server-only API_BASE_URL, fall back to the public one, then localhost.
export const SERVER_API_BASE = (
  process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080"
).replace(/\/$/, "");

export async function getServerSession(): Promise<Session | null> {
  const store = await cookies();
  return parseSession(store.get(SESSION_COOKIE)?.value);
}

// serverGet fetches JSON from the gateway on the server, attaching the session bearer token.
// Returns null on any error so SSR pages can render a graceful empty/error state.
export async function serverGet<T>(path: string): Promise<T | null> {
  const session = await getServerSession();
  try {
    const res = await fetch(SERVER_API_BASE + path, {
      headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return null;
  }
}
