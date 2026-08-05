"use client";
// The customer's own check, opened by scanning the QR on their receipt or tapping the link
// sent to them on Telegram. There is no session here and no app chrome: whoever holds the
// token sees exactly one receipt and nothing else.
//
// It reuses the check paper's styling (CHECK_CSS) so it looks like the printed receipt, but
// not FiscalCheck itself — that component is built around the staff view (an owner-only
// cost panel, the auth context, Invoice + WorkOrder objects). Here the gateway has already
// composed a flat, id-free payload, so the page just lays it out.
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { CHECK_CSS } from "@/components/fiscal-check";
import { QR } from "@/components/ui";
import { qtyUnit } from "@/components/catalog-fields";
import { useT, useLang } from "@/components/providers";
import { LANGS, type Lang } from "@/lib/i18n";
import { paymentFromProto, paymentLabelKey } from "@/lib/enums";
import type { PublicReceipt } from "@/lib/types";

export default function PublicCheckPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");
  const t = useT();
  const { lang, setLang } = useLang();

  const [receipt, setReceipt] = useState<PublicReceipt | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    let alive = true;
    if (!token) { setState("missing"); return; }
    api.getPublicReceipt(token)
      .then((r) => { if (alive) { setReceipt(r); setState("ok"); } })
      // Any failure is the same story to a customer: this link does not lead to a receipt.
      .catch(() => { if (alive) setState("missing"); });
    return () => { alive = false; };
  }, [token]);

  return (
    <div className="chk-root">
      <style>{CHECK_CSS}{PAGE_CSS}</style>

      {/* A customer may not share the shop's language. The picker is the only control here. */}
      <div className="chk-bar">
        <div className="chk-langs">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code as Lang)}
              className={"chk-lang" + (lang === l.code ? " on" : "")}
            >
              {l.short}
            </button>
          ))}
        </div>
      </div>

      {state === "loading" && <div className="chk-msg">{t("loading")}</div>}
      {state === "missing" && (
        <div className="chk-msg">
          <div className="chk-msg-t">{t("check_not_found")}</div>
          <div className="chk-msg-s">{t("check_not_found_sub")}</div>
        </div>
      )}
      {state === "ok" && receipt && <CheckPaper r={receipt} t={t} />}
    </div>
  );
}

function CheckPaper({ r, t }: { r: PublicReceipt; t: (k: string) => string }) {
  const issued = formatIssued(r.issuedAt);
  return (
    <div className="chk-wrap">
      <div className="inv-paper">
        <div className="inv-h">
          <div>
            <div className="inv-title">{r.shop.name || t("check")}</div>
            {r.shop.address && <div style={{ fontSize: 13, color: "#52525b", marginTop: 4 }}>{r.shop.address}</div>}
            <div style={{ fontSize: 13, color: "#52525b", marginTop: 2 }}>
              {[r.shop.phone, r.shop.tin && `${t("tin")} ${r.shop.tin}`].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="inv-meta">
            <div><b className="inv-mono">{r.number}</b></div>
            <div>{issued}</div>
            {r.cashier && <div>{t("cashier")}: {r.cashier}</div>}
          </div>
        </div>

        {(r.customerName || r.vehicle) && (
          <div className="inv-parties">
            {r.customerName && (
              <div>
                <div className="inv-lbl">{t("customer")}</div>
                <div>{r.customerName}</div>
              </div>
            )}
            {r.vehicle && (
              <div style={{ textAlign: "right" }}>
                <div className="inv-lbl">{t("vehicle")}</div>
                <div>{r.vehicle}</div>
              </div>
            )}
          </div>
        )}

        <table className="inv-t">
          <thead>
            <tr>
              <th>{t("item")}</th>
              <th className="r">{t("qty")}</th>
              <th className="r">{t("price")}</th>
              <th className="r">{t("sum")}</th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((ln, i) => (
              <tr key={i}>
                <td>{ln.description}</td>
                <td className="r inv-mono">{qtyUnit(t, trimQty(ln.quantity), ln.unit)}</td>
                <td className="r inv-mono">{money(ln.unitPrice)}</td>
                <td className="r inv-mono">{money(ln.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-tot">
          {r.discount > 0 && (
            <>
              <div className="row muted"><span>{t("subtotal")}</span><span className="inv-mono">{money(r.subtotal)}</span></div>
              <div className="row inv-disc"><span>{t("discount")}</span><span className="inv-mono">−{money(r.discount)}</span></div>
            </>
          )}
          <div className="row grand"><span>{t("total")}</span><span className="inv-mono">{money(r.total)} {t("soum")}</span></div>
        </div>

        <div className="inv-foot">
          <div style={{ fontSize: 13, color: "#52525b", lineHeight: 1.8 }}>
            {paymentText(r, t) && <div>{t("payment")}: <b>{paymentText(r, t)}</b></div>}
            {r.fiscalReceipt && <div className="inv-mono" style={{ fontSize: 12 }}>{t("fiscal_receipt")}: {r.fiscalReceipt}</div>}
          </div>
          {r.checkUrl && (
            <div className="inv-qr">
              <QR data={r.checkUrl} size={104} />
              <div className="cap">{t("check_qr_cap")}</div>
            </div>
          )}
        </div>

        <div className="inv-thanks">{t("thanks_for_purchase")}</div>
      </div>

      <button className="chk-print" onClick={() => window.print()}>{t("print")}</button>
    </div>
  );
}

// The issued timestamp is RFC3339 from the gateway. dd.MM.yyyy HH:mm matches how the rest of
// the product writes a date, and avoids depending on the browser's CLDR data.
function formatIssued(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 2 stays "2"; 3.5 stays "3.5". Quantities are fractional but a whole one should not read
// as "3.000".
function trimQty(q: number): string {
  return String(Math.round(q * 1000) / 1000);
}

// How the bill was settled, in the language the reader picked on this page rather than the
// one it was issued in — a customer who taps RU should get Russian, and the sentence the
// gateway composed was written once, when the check was generated.
//
// A split names every method with its amount, because "Naqd" alone on a bill half of which
// went on a card is what gets argued about at the counter a week later.
//
// Falls back to the composed sentence for a check issued before the parts were sent.
function paymentText(r: PublicReceipt, t: (k: string) => string): string {
  const parts = r.payments ?? [];
  if (parts.length === 0) return r.paymentMethod ?? "";
  const name = (m: string) => t(paymentLabelKey(paymentFromProto(m)));
  if (parts.length === 1) return name(parts[0].method);
  return parts.map((p) => `${name(p.method)} ${money(p.amount)}`).join(" · ");
}

const PAGE_CSS = `
  .chk-root { min-height: 100dvh; background: #f4f4f5; padding: 16px; box-sizing: border-box; }
  .chk-wrap { max-width: 640px; margin: 0 auto; }
  .chk-wrap .inv-paper { box-shadow: 0 1px 3px rgba(0,0,0,.1), 0 8px 24px rgba(0,0,0,.06); }
  .chk-bar { max-width: 640px; margin: 0 auto 12px; display: flex; justify-content: flex-end; }
  .chk-langs { display: inline-flex; background: #fff; border-radius: 999px; padding: 3px; gap: 2px; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
  .chk-lang { border: 0; background: transparent; color: #52525b; font: inherit; font-size: 12.5px; font-weight: 700;
              padding: 6px 12px; border-radius: 999px; cursor: pointer; }
  .chk-lang.on { background: #18181b; color: #fff; }
  .chk-msg { max-width: 640px; margin: 64px auto; text-align: center; color: #52525b; font-family: system-ui, sans-serif; }
  .chk-msg-t { font-size: 19px; font-weight: 800; color: #18181b; }
  .chk-msg-s { font-size: 14px; margin-top: 8px; }
  .chk-print { display: block; margin: 16px auto 32px; padding: 11px 22px; border: 0; border-radius: 10px;
               background: #18181b; color: #fff; font: inherit; font-size: 14.5px; font-weight: 700; cursor: pointer; }
  @media print {
    .chk-root { background: #fff; padding: 0; }
    .chk-bar, .chk-print { display: none !important; }
    .chk-wrap .inv-paper { box-shadow: none; }
  }
`;
