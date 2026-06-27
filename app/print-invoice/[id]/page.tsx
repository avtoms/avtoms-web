"use client";
// Standalone printable invoice (no app chrome). Opened in a new tab from the invoices list.
// Composes the invoice (totals, fiscal QR/receipt) with its work order (line items, vehicle,
// customer) and the locally-stored shop profile, then offers a one-click print.
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, useLang } from "@/components/providers";
import { api } from "@/lib/api";
import { money, num, vatBreakdown } from "@/lib/format";
import { loadShopProfile, type ShopProfile } from "@/lib/shop";
import { PlatePreview } from "@/components/plate";
import type { Invoice, WorkOrder } from "@/lib/types";

export default function PrintInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useLang();

  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => { setShop(loadShopProfile()); }, []);
  useEffect(() => {
    if (!session) { router.replace("/login"); return; }
    let cancelled = false;
    (async () => {
      try {
        const inv = await api.getInvoice(id);
        const order = inv.workOrderId ? await api.getWorkOrder(inv.workOrderId) : null;
        if (!cancelled) { setInvoice(inv); setWo(order); }
      } catch { if (!cancelled) setError(true); }
    })();
    return () => { cancelled = true; };
  }, [id, session, router]);

  if (error) return <Center>{t("error")}</Center>;
  if (!invoice || !shop) return <Center>…</Center>;

  const items = wo?.lineItems ?? [];
  const computed = vatBreakdown(items);
  const subtotal = wo?.subtotal != null ? num(wo.subtotal) : computed.subtotal;
  const vat = wo?.vat != null ? num(wo.vat) : computed.vat;
  const total = invoice.total != null ? num(invoice.total) : (wo?.total != null ? num(wo.total) : computed.total);
  const created = invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : "";
  const vehicle = wo ? [wo.make, wo.model].filter(Boolean).join(" ") : "";

  return (
    <div className="inv-root">
      <style>{`
        .inv-root { background: #f4f4f5; min-height: 100vh; padding: 24px; color: #18181b; font-family: 'Golos Text', system-ui, sans-serif; }
        .inv-bar { max-width: 760px; margin: 0 auto 16px; display: flex; gap: 10px; justify-content: flex-end; }
        .inv-bar button { font: inherit; font-weight: 600; padding: 9px 16px; border-radius: 9px; border: 1px solid #d4d4d8; background: #fff; cursor: pointer; }
        .inv-bar button.primary { background: #18181b; color: #fff; border-color: #18181b; }
        .inv-paper { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
        .inv-mono { font-family: 'JetBrains Mono', monospace; }
        .inv-h { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 2px solid #18181b; padding-bottom: 18px; }
        .inv-title { font-size: 26px; font-weight: 800; letter-spacing: -.02em; }
        .inv-meta { text-align: right; font-size: 13px; color: #52525b; line-height: 1.7; }
        .inv-parties { display: flex; justify-content: space-between; gap: 24px; margin: 22px 0; font-size: 13.5px; }
        .inv-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #71717a; font-weight: 700; margin-bottom: 4px; }
        table.inv-t { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13.5px; }
        table.inv-t th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #71717a; border-bottom: 1px solid #e4e4e7; padding: 8px 6px; }
        table.inv-t td { padding: 9px 6px; border-bottom: 1px solid #f4f4f5; }
        table.inv-t td.r, table.inv-t th.r { text-align: right; }
        .inv-tot { margin-top: 14px; margin-left: auto; width: 280px; font-size: 14px; }
        .inv-tot .row { display: flex; justify-content: space-between; padding: 5px 0; }
        .inv-tot .grand { border-top: 2px solid #18181b; margin-top: 6px; padding-top: 10px; font-weight: 800; font-size: 16px; }
        .inv-foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; margin-top: 28px; padding-top: 18px; border-top: 1px solid #e4e4e7; }
        .inv-paid { display: inline-block; padding: 4px 12px; border-radius: 999px; font-weight: 700; font-size: 12px; }
        @media print {
          .inv-root { background: #fff; padding: 0; }
          .inv-bar { display: none; }
          .inv-paper { box-shadow: none; border-radius: 0; max-width: none; padding: 24px; }
        }
      `}</style>

      <div className="inv-bar">
        <button onClick={() => router.back()}>← {t("back")}</button>
        <button className="primary" onClick={() => window.print()}>{t("print")}</button>
      </div>

      <div className="inv-paper">
        <div className="inv-h">
          <div>
            <div className="inv-title">{shop.name || t("invoice")}</div>
            {shop.address && <div style={{ fontSize: 13, color: "#52525b", marginTop: 4 }}>{shop.address}</div>}
            {shop.tin && <div className="inv-mono" style={{ fontSize: 12.5, color: "#52525b" }}>{t("tin")}: {shop.tin}</div>}
          </div>
          <div className="inv-meta">
            <div style={{ fontWeight: 700, color: "#18181b", fontSize: 15 }}>{t("invoice")}</div>
            <div className="inv-mono">№ {invoice.id.slice(0, 8).toUpperCase()}</div>
            {created && <div>{created}</div>}
          </div>
        </div>

        <div className="inv-parties">
          <div>
            <div className="inv-lbl">{t("customer")}</div>
            <div style={{ fontWeight: 600 }}>{wo?.customerName || "—"}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="inv-lbl">{t("vehicle")}</div>
            <div style={{ fontWeight: 600 }}>{vehicle || "—"}</div>
            {wo?.plate && <div style={{ marginTop: 4, display: "flex", justifyContent: "flex-end" }}><PlatePreview plate={wo.plate} size="sm" /></div>}
          </div>
        </div>

        <table className="inv-t">
          <thead>
            <tr>
              <th>{t("description")}</th>
              <th className="r">{t("quantity")}</th>
              <th className="r">{t("price")}</th>
              <th className="r">{t("total")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={4} style={{ color: "#a1a1aa", padding: "16px 6px" }}>—</td></tr>
            ) : items.map((it, i) => (
              <tr key={it.id || i}>
                <td>{it.description}</td>
                <td className="r inv-mono">{it.quantity}</td>
                <td className="r inv-mono">{money(num(it.unitPrice))}</td>
                <td className="r inv-mono">{money(num(it.unitPrice) * (it.quantity || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-tot">
          <div className="row"><span>{t("subtotal")}</span><span className="inv-mono">{money(subtotal)}</span></div>
          <div className="row"><span>{t("vat")}</span><span className="inv-mono">{money(vat)}</span></div>
          <div className="row grand"><span>{t("total")}</span><span className="inv-mono">{money(total)} {t("soum")}</span></div>
        </div>

        <div className="inv-foot">
          <div>
            <span className="inv-paid" style={{ background: invoice.paid ? "#dcfce7" : "#fef3c7", color: invoice.paid ? "#166534" : "#92400e" }}>
              {invoice.paid ? t("paid") : t("unpaid")}
            </span>
            {invoice.fiscalReceiptId && <div className="inv-mono" style={{ fontSize: 11.5, color: "#52525b", marginTop: 8 }}>OFD: {invoice.fiscalReceiptId}</div>}
            {shop.hours && <div style={{ fontSize: 12, color: "#71717a", marginTop: 8 }}>{shop.hours}</div>}
          </div>
          {invoice.fiscalQr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={invoice.fiscalQr} alt="QR" width={96} height={96} style={{ border: "1px solid #e4e4e7", borderRadius: 8 }} />
          )}
        </div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)" }}>{children}</div>;
}
