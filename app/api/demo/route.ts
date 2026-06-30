// Public demo-request endpoint for the marketing landing page. Self-contained: it forwards
// the lead to a Telegram chat when DEMO_TG_BOT_TOKEN + DEMO_TG_CHAT_ID are configured, and
// always logs it to the container stdout as a durable fallback. No auth — guests submit it.
import { NextResponse } from "next/server";

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

  const lead: Required<Lead> = {
    name: clean(body.name, 120),
    shop: clean(body.shop, 160),
    phone: clean(body.phone, 40),
    city: clean(body.city, 80),
    message: clean(body.message, 1000),
    lang: clean(body.lang, 8) || "uz",
  };

  // Minimal validation: a name and a reachable phone are the bare essentials of a lead.
  if (!lead.name || lead.phone.replace(/\D/g, "").length < 7) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 422 });
  }

  // Always log — guarantees the lead is captured even with no Telegram wiring.
  console.log("[demo-request]", JSON.stringify(lead));

  const token = process.env.DEMO_TG_BOT_TOKEN;
  const chat = process.env.DEMO_TG_CHAT_ID;
  if (token && chat) {
    const text =
      `🚗 *Yangi demo so'rovi / Новая заявка на демо*\n\n` +
      `👤 ${lead.name}\n` +
      (lead.shop ? `🔧 ${lead.shop}\n` : "") +
      `📞 ${lead.phone}\n` +
      (lead.city ? `📍 ${lead.city}\n` : "") +
      (lead.message ? `💬 ${lead.message}\n` : "") +
      `🌐 ${lead.lang.toUpperCase()}`;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text, parse_mode: "Markdown" }),
      });
    } catch (e) {
      // Telegram delivery is best-effort; the log above is the source of truth.
      console.error("[demo-request] telegram delivery failed:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
