"use client";
// Invoices (owner-pages.jsx InvoicesPage): list with fiscal + paid badges, mark-paid,
// and a fiscal-QR modal. Wired to api.listInvoices / markPaid.
import React, { useCallback, useEffect, useState } from "react";
import { Card, Badge, Btn, Modal, Spinner, Empty, FiscalBadge, QR } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { fiscalFromProto, paymentFromProto, type PaymentMethod } from "@/lib/enums";
import type { Invoice } from "@/lib/types";
import { Row } from "../_shared";

export default function InvoicesPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [list, setList] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Invoice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listInvoices(shopId)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);

  const pay = async (inv: Invoice, method: PaymentMethod) => {
    try {
      const updated = await api.markPaid(inv.id, method);
      toast(t("paid"), { icon: "money" });
      setSel(updated);
      load();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card pad={0}>
        {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={24} /></div>
          : list.length === 0 ? <div style={{ padding: 24 }}><Empty icon="receipt" /></div>
          : list.map((inv) => (
            <button key={inv.id} onClick={() => setSel(inv)} className="an-row-btn" style={{ display: "flex", alignItems: "center", gap: 13, rowGap: 6, flexWrap: "wrap", width: "100%", padding: "13px 18px", border: "none", borderBottom: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left" }}>
              <div style={{ minWidth: 76 }}><div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: 13.5 }}>{inv.id.slice(0, 8)}</div><div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{inv.workOrderId.slice(0, 8)}</div></div>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>{money(inv.total)}</span>
              <span className="an-hide-sm"><FiscalBadge status={fiscalFromProto(inv.fiscalStatus)} /></span>
              <Badge tone={inv.paid ? "ok" : "neutral"} dot>{inv.paid ? t("paid") : t("unpaid")}</Badge>
              {inv.paid && inv.paymentMethod && <span className="an-hide-sm"><Badge tone="neutral">{t(paymentFromProto(inv.paymentMethod) === "cash" ? "pay_cash" : "pay_other")}</Badge></span>}
              <Icon name="chevR" size={16} style={{ color: "var(--ink-3)" }} />
            </button>
          ))}
      </Card>
      <InvoiceDetailModal invoice={sel} onClose={() => setSel(null)} onPay={pay} />
    </div>
  );
}

function InvoiceDetailModal({ invoice, onClose, onPay }: { invoice: Invoice | null; onClose: () => void; onPay: (inv: Invoice, m: PaymentMethod) => void }) {
  const { t } = useLang();
  if (!invoice) return null;
  const fiscal = fiscalFromProto(invoice.fiscalStatus);
  return (
    <Modal open={!!invoice} onClose={onClose} title={t("invoice") + " · " + invoice.id.slice(0, 8)} maxWidth={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <FiscalBadge status={fiscal} />
          <Badge tone={invoice.paid ? "ok" : "neutral"} dot>{invoice.paid ? t("paid") : t("unpaid")}</Badge>
        </div>
        <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 16 }}>
          <Row label={t("work_order")} value={invoice.workOrderId.slice(0, 8)} mono />
          <div style={{ height: 1, background: "var(--line)", margin: "8px 0" }} />
          <Row label={t("total")} value={money(invoice.total) + " " + t("soum")} strong mono />
        </div>

        {fiscal === "fiscalized" && invoice.fiscalQr && (
          <div style={{ display: "flex", gap: 16, alignItems: "center", padding: 14, background: "var(--ok-soft)", borderRadius: "var(--radius)" }}>
            <QR data={invoice.fiscalQr} size={104} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Badge tone="ok" dot>{t("fiscal_qr")}</Badge>
              {invoice.fiscalReceiptId && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}>{invoice.fiscalReceiptId}</div>}
            </div>
          </div>
        )}

        {!invoice.paid && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8 }}>{t("mark_paid")} · {t("payment_method")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Btn variant="soft" icon="money" onClick={() => onPay(invoice, "cash")}>{t("pay_cash")}</Btn>
              <Btn variant="soft" onClick={() => onPay(invoice, "other")}>{t("pay_other")}</Btn>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
