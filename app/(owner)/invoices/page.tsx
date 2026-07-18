"use client";
// Invoices (owner-pages.jsx InvoicesPage): a searchable/sortable DataTable with fiscal +
// paid badges, mark-paid, and a fiscal-QR modal. Wired to api.listInvoices / markPaid.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, Printer } from "lucide-react";
import { FiscalBadge, QR, SkeletonRows } from "@/components/ui";
import { Card } from "@/components/ui-kit/card";
import { Button } from "@/components/ui-kit/button";
import { Badge } from "@/components/ui-kit/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui-kit/dialog";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num, orderLabel, vehicleTitle } from "@/lib/format";
import { fiscalFromProto, paymentFromProto, type PaymentMethod } from "@/lib/enums";
import type { Invoice, WorkOrder } from "@/lib/types";
import { Row, PaidBadge } from "../_shared";

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

  const columns = useMemo<ColumnDef<Invoice>[]>(() => [
    {
      id: "order",
      accessorFn: (inv) => { const w = woById[inv.workOrderId]; return w ? orderLabel(w) : "—"; },
      header: ({ column }) => <SortHeader column={column}>{t("work_order")}</SortHeader>,
      cell: ({ row }) => {
        const inv = row.original;
        const w = woById[inv.workOrderId];
        return (
          <div className="flex flex-col">
            <span className="font-mono text-[13.5px] font-bold text-foreground">{w ? orderLabel(w) : "—"}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{t("invoice").toLowerCase()} {inv.id.slice(0, 6)}</span>
          </div>
        );
      },
    },
    {
      id: "vehicle",
      accessorFn: (inv) => { const w = woById[inv.workOrderId]; return w ? `${vehicleTitle(w)} ${w.customerName || ""}` : ""; },
      header: ({ column }) => <SortHeader column={column}>{t("vehicle")}</SortHeader>,
      cell: ({ row }) => {
        const w = woById[row.original.workOrderId];
        const title = w ? vehicleTitle(w) : "";
        return (
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-foreground">{title || "—"}</div>
            {w?.customerName && <div className="truncate text-[12px] text-muted-foreground">{w.customerName}</div>}
          </div>
        );
      },
    },
    {
      id: "total",
      accessorFn: (inv) => num(inv.total),
      header: ({ column }) => <SortHeader column={column}>{t("total")}</SortHeader>,
      cell: ({ row }) => <span className="font-mono text-[13.5px] font-bold text-foreground">{money(row.original.total)}</span>,
    },
    {
      id: "fiscal",
      accessorFn: (inv) => fiscalFromProto(inv.fiscalStatus),
      header: ({ column }) => <SortHeader column={column}>{t("fiscal_status")}</SortHeader>,
      cell: ({ row }) => <FiscalBadge status={fiscalFromProto(row.original.fiscalStatus)} />,
    },
    {
      id: "paid",
      accessorFn: (inv) => (inv.paid ? t("paid") : t("unpaid")),
      header: ({ column }) => <SortHeader column={column}>{t("paid")}</SortHeader>,
      cell: ({ row }) => {
        const inv = row.original;
        return (
          <div className="flex items-center gap-2">
            <PaidBadge paid={inv.paid} />
            {inv.paid && inv.paymentMethod && <Badge tone="neutral">{t(paymentFromProto(inv.paymentMethod) === "cash" ? "pay_cash" : "pay_other")}</Badge>}
          </div>
        );
      },
    },
  ], [woById, t]);

  const columnLabels = useMemo(
    () => ({ order: t("work_order"), vehicle: t("vehicle"), total: t("total"), fiscal: t("fiscal_status"), paid: t("paid") }),
    [t],
  );

  return (
    <div className="flex flex-col gap-4">
      {loading && list.length === 0 ? (
        <Card className="overflow-hidden"><SkeletonRows rows={6} avatar={false} /></Card>
      ) : (
        <DataTable
          columns={columns}
          data={list}
          searchPlaceholder={t("search")}
          columnLabels={columnLabels}
          emptyText={t("empty")}
          onRowClick={(inv) => setSel(inv)}
          pageSize={12}
        />
      )}
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
    <Dialog open={!!invoice} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t("invoice") + " · " + orderNo}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 pb-5">
          <div className="flex items-center justify-between">
            <FiscalBadge status={fiscal} />
            <PaidBadge paid={invoice.paid} />
          </div>
          <div className="rounded-[12px] bg-secondary/60 p-4">
            <Row label={t("work_order")} value={orderNo} mono />
            {carTitle && <Row label={t("vehicle")} value={carTitle} />}
            {wo?.customerName && <Row label={t("nav_customers")} value={wo.customerName} />}
            <div className="my-2 h-px bg-border" />
            <Row label={t("total")} value={money(invoice.total) + " " + t("soum")} strong mono />
          </div>

          {fiscal === "fiscalized" && invoice.fiscalQr && (
            <div className="flex items-center gap-4 rounded-[12px] bg-success-soft p-3.5">
              <QR data={invoice.fiscalQr} size={104} />
              <div className="flex flex-col gap-1.5">
                <Badge tone="ok" dot>{t("fiscal_qr")}</Badge>
                {invoice.fiscalReceiptId && <div className="font-mono text-[12.5px] font-semibold text-ink-2">{invoice.fiscalReceiptId}</div>}
              </div>
            </div>
          )}

          {!invoice.paid && (
            <div>
              <div className="mb-2 text-[12.5px] font-semibold text-muted-foreground">{t("mark_paid")} · {t("payment_method")}</div>
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="soft" onClick={() => onPay(invoice, "cash")}><Banknote /> {t("pay_cash")}</Button>
                <Button variant="soft" onClick={() => onPay(invoice, "other")}>{t("pay_other")}</Button>
              </div>
            </div>
          )}

          <Button variant="ghost" onClick={() => window.open(`/print-invoice/${invoice.id}`, "_blank")}><Printer /> {t("print")}</Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
