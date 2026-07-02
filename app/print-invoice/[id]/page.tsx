"use client";
// Standalone printable fiscal check (no app chrome). Opened in a new tab from the invoices
// list and the order detail. Renders the shared <FiscalCheck> and adds print + "download PDF
// (also stored to R2)" actions.
import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { orderLabel } from "@/lib/format";
import { loadShopProfile, type ShopProfile } from "@/lib/shop";
import { FiscalCheck } from "@/components/fiscal-check";
import type { Invoice, WorkOrder } from "@/lib/types";

export default function PrintInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, ready } = useAuth();
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
    // Wait for the auth provider to hydrate the session from the cookie before deciding.
    // Otherwise the very first render (session still null) bounces to /login → home.
    if (!ready) return;
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
  }, [id, session, ready, router]);

  if (error) return <Center>{t("error")}</Center>;
  if (!invoice || !shop) return <Center>…</Center>;

  const orderNo = wo ? orderLabel(wo) : "";

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
        .inv-bar { max-width: 760px; margin: 0 auto 16px; display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
        .inv-bar button { font: inherit; font-weight: 600; padding: 9px 16px; border-radius: 9px; border: 1px solid #d4d4d8; background: #fff; cursor: pointer; }
        .inv-bar button.primary { background: #18181b; color: #fff; border-color: #18181b; }
        .inv-bar button:disabled { opacity: .5; cursor: default; }
        .inv-root .inv-paper { max-width: 760px; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
        @media print {
          .inv-root { background: #fff; padding: 0; }
          .inv-bar { display: none !important; }
          .inv-root .inv-paper { box-shadow: none; max-width: none; }
        }
      `}</style>

      <div className="inv-bar">
        <button onClick={() => router.back()}>← {t("back")}</button>
        {pdfUrl && <button onClick={() => window.open(pdfUrl, "_blank")}>{t("open_link")}</button>}
        <button onClick={genPdf} disabled={pdfBusy}>{pdfBusy ? t("generating_pdf") : t("download_pdf")}</button>
        <button className="primary" onClick={() => window.print()}>{t("print")}</button>
      </div>

      <FiscalCheck invoice={invoice} wo={wo} shop={shop} innerRef={paperRef} />
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)" }}>{children}</div>;
}
