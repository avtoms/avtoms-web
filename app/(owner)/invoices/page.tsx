"use client";
// Invoices (owner-pages.jsx InvoicesPage): list with fiscal + paid badges, mark-paid,
// and a fiscal-QR modal. Wired to api.listInvoices / markPaid.
import React, { useCallback, useEffect, useState } from "react";
import { Card, Badge, Btn, Modal, Spinner, Empty, FiscalBadge, QR } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, orderLabel, vehicleTitle } from "@/lib/format";
import { fiscalFromProto, paymentFromProto, type PaymentMethod } from "@/lib/enums";
import type { Invoice, WorkOrder } from "@/lib/types";
import { Row } from "../_shared";

export default function InvoicesPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [list, setList] = useState<Invoice[]>([]);
  const [woById, setWoById] = useState<Record<string, WorkOrder>>({}); // workOrderId → work order
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Invoice | null>(null);

  // An invoice references its work order by id; resolve that to the human Z-number + the car
  // identity (plate · make model · client) so the list reads like the shop talks, not a UUID.
  const woFor = useCallback((inv: Invoice | null) => (inv ? woById[inv.workOrderId] : undefined), [woById]);
  const orderNoFor = useCallback((inv: Invoice | null) => { const w = inv ? woById[inv.workOrderId] : undefined; return w ? orderLabel(w) : "—"; }, [woById]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invs, wos] = await Promise.all([api.listInvoices(shopId), api.listWorkOrders(shopId)]);
      const map: Record<string, WorkOrder> = {};
      for (const w of wos) map[w.id] = w as WorkOrder;
      setWoById(map);
      setList(invs);
    }
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
              <div style={{ minWidth: 64, flexShrink: 0 }}><div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: 13.5 }}>{orderNoFor(inv)}</div><div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{t("invoice").toLowerCase()} {inv.id.slice(0, 6)}</div></div>
              <div style={{ flex: 1, minWidth: 120 }}>
                {(() => { const w = woFor(inv); const title = w ? vehicleTitle(w) : ""; return (<>
                  <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(13.5px * var(--scale))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title || "—"}</div>
                  {w?.customerName && <div style={{ fontSize: 12, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.customerName}</div>}
                </>); })()}
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>{money(inv.total)}</span>
              <span className="an-hide-sm"><FiscalBadge status={fiscalFromProto(inv.fiscalStatus)} /></span>
              <Badge tone={inv.paid ? "ok" : "neutral"} dot>{inv.paid ? t("paid") : t("unpaid")}</Badge>
              {inv.paid && inv.paymentMethod && <span className="an-hide-sm"><Badge tone="neutral">{t(paymentFromProto(inv.paymentMethod) === "cash" ? "pay_cash" : "pay_other")}</Badge></span>}
              <Icon name="chevR" size={16} style={{ color: "var(--ink-3)" }} />
            </button>
          ))}
      </Card>
      <InvoiceDetailModal invoice={sel} orderNo={orderNoFor(sel)} wo={woFor(sel)} onClose={() => setSel(null)} onPay={pay} />
    </div>
  );
}

function InvoiceDetailModal({ invoice, orderNo, wo, onClose, onPay }: { invoice: Invoice | null; orderNo: string; wo?: WorkOrder; onClose: () => void; onPay: (inv: Invoice, m: PaymentMethod) => void }) {
  const { t } = useLang();
  if (!invoice) return null;
  const fiscal = fiscalFromProto(invoice.fiscalStatus);
  const carTitle = wo ? vehicleTitle(wo) : "";
  return (
    <Modal open={!!invoice} onClose={onClose} title={t("invoice") + " · " + orderNo} maxWidth={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <FiscalBadge status={fiscal} />
          <Badge tone={invoice.paid ? "ok" : "neutral"} dot>{invoice.paid ? t("paid") : t("unpaid")}</Badge>
        </div>
        <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 16 }}>
          <Row label={t("work_order")} value={orderNo} mono />
          {carTitle && <Row label={t("vehicle")} value={carTitle} />}
          {wo?.customerName && <Row label={t("nav_customers")} value={wo.customerName} />}
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

        <Btn variant="ghost" icon="printer" onClick={() => window.open(`/print-invoice/${invoice.id}`, "_blank")}>{t("print")}</Btn>
      </div>
    </Modal>
  );
}
