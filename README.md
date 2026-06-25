# AvtoNazorat — Web (Next.js)

Frontend for the AvtoMS backend. Next.js 15 (App Router, TypeScript, SSR), responsive for
mobile browsers. The browser talks to the **gateway** directly using an env-configured URL;
the gateway has CORS enabled.

## Role-based UI

After phone + OTP sign-in, the JWT's role decides the entire surface (enforced by `middleware.ts`):

- **Owner** → console under `/(owner)`: dashboard, work-orders, customers, invoices, reports, menu, staff, settings.
- **Mechanic** → mobile-first app under `/m`: Kanban board (Assigned / In Progress / Ready), work-order detail with a live timer.

Owners can't open `/m`; mechanics are confined to `/m`. Signed-out users only reach `/login`.

## Configuration — all via env

Copy `.env.example` to `.env.local` and set the endpoint:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080   # the gateway, reachable from the browser
NEXT_PUBLIC_DEV_OTP=000000                        # dev OTP hint shown on login
```

For production, point `NEXT_PUBLIC_API_BASE_URL` at your gateway's public URL (e.g.
`https://api.your-domain`). Then **add that web origin to the gateway's CORS allowlist**:

```
# on the gateway / in deploy/.env
CORS_ALLOWED_ORIGINS=https://app.your-domain
```

(Leave `CORS_ALLOWED_ORIGINS` unset for `*` in dev.)

## Run

```bash
npm install
npm run dev        # http://localhost:3000   (needs the gateway running on :8080)
```

Sign in with any +998 phone; OTP dev code is **000000** (matches the backend).

```bash
npm run build && npm run start   # production
npm run typecheck                # tsc --noEmit
```

## How it's wired

- `lib/api.ts` — typed client; reads `NEXT_PUBLIC_API_BASE_URL`, attaches the bearer token from the session cookie. CORS-friendly direct calls to the gateway.
- `lib/session.ts` — session stored in a cookie (token + role + staff), read by both the client (bearer) and `middleware.ts` (routing).
- `lib/enums.ts` / `lib/types.ts` — convert protojson output (camelCase, int64-as-string, enum NAME strings) to app types.
- `lib/i18n.ts` + `lib/theme.ts` — trilingual UI (Uz-Latn / Uz-Cyrl / Ru) and the Workshop/Steel/Carbon themes, ported from the AvtoNazorat prototype.
- `components/ui.tsx`, `components/icons.tsx`, `components/providers.tsx` — the ported design system + Lang/Theme/Auth/Toast contexts.

## Known backend gaps (degraded gracefully, marked `// TODO backend:`)

- No get-vehicle-by-id, list-vehicles-by-customer, set-WO-notes, toggle-menu-active, shop-profile, or list-time-entries endpoints yet. Those areas show IDs / are read-only / are local-only rather than calling missing endpoints.
