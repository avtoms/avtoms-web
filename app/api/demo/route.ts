// Public demo-request endpoint for the marketing landing page. Forwards the lead to the
// gateway (server-side, no CORS) which persists it and fires the Telegram alert. Kept as a
// thin Next route so the landing form posts same-origin and we never expose the gateway base.
import { NextResponse } from "next/server";
import { SERVER_API_BASE } from "@/lib/server-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Lead = { name?: string; shop?: string; phone?: string; city?: string; message?: string; lang?: string };

const clean = (s: unknown, max = 400) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export async function POST(req: Request) {
  let body: Lead;
  try {
    body = (await req.json()) as Lead;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const lead = {
    name: clean(body.name, 120),
    shop: clean(body.shop, 160),
    phone: clean(body.phone, 40),
    city: clean(body.city, 80),
    message: clean(body.message, 1000),
    lang: clean(body.lang, 8) || "uz",
  };

  if (!lead.name || lead.phone.replace(/\D/g, "").length < 7) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 422 });
  }

  try {
    const res = await fetch(SERVER_API_BASE + "/v1/demo-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[demo-request] gateway rejected:", res.status, JSON.stringify(lead));
      return NextResponse.json({ ok: false, error: "upstream" }, { status: 502 });
    }
  } catch (e) {
    // Log as a durable fallback so the lead is never silently lost.
    console.error("[demo-request] forward failed:", e, JSON.stringify(lead));
    return NextResponse.json({ ok: false, error: "upstream" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
