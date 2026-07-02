"use client";
// Standalone printable fiscal check (Uzbek receipt, no app chrome). Opened in a new tab from
// the invoices list. Composes the invoice (totals, fiscal QR/receipt) with its work order
// (line items, vehicle, customer) and the locally-stored shop profile.
//
// An Uzbek fiscal check (soliq chek) must carry: the seller's name + STIR, the point-of-sale
// address, the cashier, a receipt number, date/time, the itemised lines (name, qty, price,
// discount, sum), QQS (VAT 12%), the discount total, the amount tendered + payment method,
// and the fiscal sign (OFD receipt id) + verification QR. The negotiated per-line discount
// (menu default_price vs the agreed unit_price) was previously not shown at all — it is now
// surfaced both per line and as a total, next to the actual (net) amount.
import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";
import { orderLabel } from "@/lib/format";
import { paymentFromProto, fiscalFromProto } from "@/lib/enums";
import { loadShopProfile, type ShopProfile } from "@/lib/shop";
import { PlatePreview } from "@/components/plate";
import { QR } from "@/components/ui";
import type { Invoice, WorkOrder } from "@/lib/types";

export default function PrintInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useLang();
  const { toast } = useToast();

  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [error, setError] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const paperRef = useRef<HTMLDivElement>(null);

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
  // Per line: the list (menu) price is the discount reference; the agreed unit_price is what
  // the customer actually pays. Discount is the difference (never negative). A custom line
  // with no menu origin (default_price 0) simply has no discount.
  const rows = items.map((it) => {
    const qty = it.quantity || 0;
    const actualUnit = num(it.unitPrice);
    const listUnit = num(it.defaultPrice) > actualUnit ? num(it.defaultPrice) : actualUnit;
    const disc = Math.max(0, (listUnit - actualUnit) * qty);
    return { it, qty, actualUnit, listUnit, disc, lineSum: actualUnit * qty };
  });

  const grossSubtotal = rows.reduce((s, r) => s + r.listUnit * r.qty, 0);
  const totalDiscount = rows.reduce((s, r) => s + r.disc, 0);
  const netSubtotal = wo?.subtotal != null ? num(wo.subtotal) : rows.reduce((s, r) => s + r.lineSum, 0);
  const vat = wo?.vat != null ? num(wo.vat) : Math.round(netSubtotal * 0.12);
  const total = invoice.total != null ? num(invoice.total) : (wo?.total != null ? num(wo.total) : netSubtotal + vat);
  const totalCost = wo?.totalCost != null ? num(wo.totalCost) : rows.reduce((s, r) => s + num(r.it.cost) * r.qty, 0);
  const doxod = wo?.totalMargin != null ? num(wo.totalMargin) : netSubtotal - totalCost; // shop income (margin)

  const payment = paymentFromProto(invoice.paymentMethod);
  const fiscal = fiscalFromProto(invoice.fiscalStatus);
  const created = invoice.createdAt ? new Date(invoice.createdAt).toLocaleString("ru-RU") : "";
  const cashier = session?.staff?.name || "";
  const orderNo = wo ? orderLabel(wo) : "";
  const vehicle = wo ? [wo.make, wo.model].filter(Boolean).join(" ") : "";

  // Rasterize the receipt (exact on-screen layout, all scripts) into a single image and wrap
  // it in an A4 PDF, paginating if it runs taller than one page. The owner-only internal panel
  // (.inv-noprint) is skipped so the PDF matches the printed customer check. The file is both
  // downloaded locally and uploaded to R2 (returns its public URL).
  const genPdf = async () => {
    if (!paperRef.current || pdfBusy) return;
    setPdfBusy(true);
    try {
      const [h2c, jspdf] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
      const html2canvas = h2c.default;
      const JsPDF = jspdf.jsPDF;
      const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
      if (fonts?.ready) { try { await fonts.ready; } catch { /* fonts optional */ } }

      const canvas = await html2canvas(paperRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        ignoreElements: (el: Element) => (el as HTMLElement).classList?.contains("inv-noprint"),
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new JsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let position = 0;
      let remaining = imgH;
      pdf.addImage(imgData, "PNG", 0, position, pageW, imgH);
      remaining -= pageH;
      while (remaining > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pageW, imgH);
        remaining -= pageH;
      }

      const blob: Blob = pdf.output("blob");
      const fname = `chek-${(orderNo || invoice.id.slice(0, 8)).replace(/[^\w-]/g, "")}.pdf`;
      // Local download.
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl; a.download = fname; a.click();
      setTimeout(() => URL.revokeObjectURL(dlUrl), 5000);
      // Store to R2. The local download already succeeded, so a storage failure is non-fatal.
      try {
        const url = await api.uploadFile(new File([blob], fname, { type: "application/pdf" }));
        setPdfUrl(url);
        toast(t("pdf_saved"), { icon: "check" });
      } catch (e) {
        toast(e instanceof ApiError ? e.message : t("pdf_saved"), { icon: "download" });
      }
    } catch {
      toast(t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="inv-root">
      <style>{`
        .inv-root { background: #f4f4f5; min-height: 100vh; padding: 24px; color: #18181b; font-family: var(--ff-golos), system-ui, sans-serif; }
        .inv-bar { max-width: 760px; margin: 0 auto 16px; display: flex; gap: 10px; justify-content: flex-end; }
        .inv-bar button { font: inherit; font-weight: 600; padding: 9px 16px; border-radius: 9px; border: 1px solid #d4d4d8; background: #fff; cursor: pointer; }
        .inv-bar button.primary { background: #18181b; color: #fff; border-color: #18181b; }
        .inv-paper { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
        .inv-mono { font-family: var(--ff-mono), monospace; }
        .inv-h { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 2px solid #18181b; padding-bottom: 18px; }
        .inv-title { font-size: 26px; font-weight: 800; letter-spacing: -.02em; }
        .inv-meta { text-align: right; font-size: 13px; color: #52525b; line-height: 1.7; }
        .inv-parties { display: flex; justify-content: space-between; gap: 24px; margin: 22px 0; font-size: 13.5px; }
        .inv-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #71717a; font-weight: 700; margin-bottom: 4px; }
        table.inv-t { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13.5px; }
        table.inv-t th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #71717a; border-bottom: 1px solid #e4e4e7; padding: 8px 6px; }
        table.inv-t td { padding: 9px 6px; border-bottom: 1px solid #f4f4f5; vertical-align: top; }
        table.inv-t td.r, table.inv-t th.r { text-align: right; }
        .inv-strike { color: #a1a1aa; text-decoration: line-through; font-size: 12px; }
        .inv-disc { color: #15803d; }
        .inv-tot { margin-top: 14px; margin-left: auto; width: 300px; font-size: 14px; }
        .inv-tot .row { display: flex; justify-content: space-between; padding: 5px 0; }
        .inv-tot .row.muted { color: #71717a; }
        .inv-tot .grand { border-top: 2px solid #18181b; margin-top: 6px; padding-top: 10px; font-weight: 800; font-size: 16px; }
        .inv-save { margin-top: 12px; margin-left: auto; width: 300px; background: #dcfce7; color: #166534; border-radius: 9px; padding: 9px 12px; font-size: 13.5px; font-weight: 700; display: flex; justify-content: space-between; }
        .inv-internal { margin-top: 20px; border: 1px dashed #d4d4d8; border-radius: 10px; padding: 14px 16px; background: #fafafa; }
        .inv-internal .t { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #a1a1aa; font-weight: 700; margin-bottom: 8px; }
        .inv-internal .g { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 13.5px; }
        .inv-internal .g .v { font-weight: 800; font-size: 16px; margin-top: 2px; }
        .inv-foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; margin-top: 28px; padding-top: 18px; border-top: 1px solid #e4e4e7; }
        .inv-paid { display: inline-block; padding: 4px 12px; border-radius: 999px; font-weight: 700; font-size: 12px; }
        .inv-qr { text-align: center; }
        .inv-qr .cap { font-size: 10.5px; color: #71717a; margin-top: 4px; max-width: 120px; }
        .inv-thanks { text-align: center; margin-top: 20px; font-size: 13.5px; color: #52525b; font-weight: 600; }
        @media print {
          .inv-root { background: #fff; padding: 0; }
          .inv-bar, .inv-noprint { display: none !important; }
          .inv-paper { box-shadow: none; border-radius: 0; max-width: none; padding: 24px; }
        }
      `}</style>

      <div className="inv-bar">
        <button onClick={() => router.back()}>← {t("back")}</button>
        {pdfUrl && <button onClick={() => window.open(pdfUrl, "_blank")}>{t("open_link")}</button>}
        <button onClick={genPdf} disabled={pdfBusy}>{pdfBusy ? t("generating_pdf") : t("download_pdf")}</button>
        <button className="primary" onClick={() => window.print()}>{t("print")}</button>
      </div>

      <div className="inv-paper" ref={paperRef}>
        <div className="inv-h">
          <div>
            <div className="inv-title">{shop.name || t("receipt")}</div>
            {shop.address && <div style={{ fontSize: 13, color: "#52525b", marginTop: 4 }}>{shop.address}</div>}
            {shop.tin && <div className="inv-mono" style={{ fontSize: 12.5, color: "#52525b" }}>{t("tin")}: {shop.tin}</div>}
          </div>
          <div className="inv-meta">
            <div style={{ fontWeight: 700, color: "#18181b", fontSize: 15 }}>{t("receipt")}</div>
            <div className="inv-mono">№ {invoice.id.slice(0, 8).toUpperCase()}</div>
            {orderNo && <div className="inv-mono">{t("order_no")}: {orderNo}</div>}
            {created && <div>{created}</div>}
            {cashier && <div>{t("cashier")}: {cashier}</div>}
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
              <th className="r">{t("discount")}</th>
              <th className="r">{t("total")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} style={{ color: "#a1a1aa", padding: "16px 6px" }}>—</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.it.id || i}>
                <td>{r.it.description}</td>
                <td className="r inv-mono">{r.qty}</td>
                <td className="r inv-mono">
                  {money(r.actualUnit)}
                  {r.disc > 0 && <div className="inv-strike inv-mono">{money(r.listUnit)}</div>}
                </td>
                <td className="r inv-mono inv-disc">{r.disc > 0 ? "−" + money(r.disc) : "—"}</td>
                <td className="r inv-mono">{money(r.lineSum)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-tot">
          {totalDiscount > 0 && <div className="row muted"><span>{t("before_discount")}</span><span className="inv-mono">{money(grossSubtotal)}</span></div>}
          {totalDiscount > 0 && <div className="row inv-disc"><span>{t("discount")}</span><span className="inv-mono">−{money(totalDiscount)}</span></div>}
          <div className="row"><span>{t("subtotal")}</span><span className="inv-mono">{money(netSubtotal)}</span></div>
          <div className="row"><span>{t("vat")}</span><span className="inv-mono">{money(vat)}</span></div>
          <div className="row grand"><span>{t("total")}</span><span className="inv-mono">{money(total)} {t("soum")}</span></div>
        </div>

        {totalDiscount > 0 && (
          <div className="inv-save">
            <span>{t("savings")}</span>
            <span className="inv-mono">{money(totalDiscount)} {t("soum")}</span>
          </div>
        )}

        {/* Owner-only breakdown: cost + income (doxod). Screen-only — never on the customer's
            fiscal check. */}
        <div className="inv-internal inv-noprint">
          <div className="t">{t("internal_summary")}</div>
          <div className="g">
            <div><div className="inv-lbl">{t("cost")}</div><div className="v inv-mono">{money(totalCost)}</div></div>
            <div><div className="inv-lbl">{t("discount")}</div><div className="v inv-mono inv-disc">{money(totalDiscount)}</div></div>
            <div><div className="inv-lbl">{t("margin")}</div><div className="v inv-mono" style={{ color: doxod >= 0 ? "#166534" : "#b91c1c" }}>{money(doxod)}</div></div>
          </div>
        </div>

        <div className="inv-foot">
          <div>
            <span className="inv-paid" style={{ background: invoice.paid ? "#dcfce7" : "#fef3c7", color: invoice.paid ? "#166534" : "#92400e" }}>
              {invoice.paid ? t("paid") : t("unpaid")}
            </span>
            <div style={{ fontSize: 12.5, color: "#52525b", marginTop: 8 }}>{t("payment_method")}: {t(payment === "cash" ? "pay_cash" : "pay_other")}</div>
            {invoice.fiscalReceiptId && <div className="inv-mono" style={{ fontSize: 11.5, color: "#52525b", marginTop: 6 }}>OFD: {invoice.fiscalReceiptId}</div>}
            {fiscal === "pending" && <div style={{ fontSize: 11.5, color: "#a1a1aa", marginTop: 6 }}>{t("fiscalizing")}</div>}
            {shop.hours && <div style={{ fontSize: 12, color: "#71717a", marginTop: 8 }}>{shop.hours}</div>}
          </div>
          {invoice.fiscalQr && (
            <div className="inv-qr">
              <QR data={invoice.fiscalQr} size={104} />
              <div className="cap">{t("verify_qr")}</div>
            </div>
          )}
        </div>

        <div className="inv-thanks">{t("thank_you")}</div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)" }}>{children}</div>;
}
