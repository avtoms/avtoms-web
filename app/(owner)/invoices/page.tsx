"use client";
// Invoices (owner-pages.jsx InvoicesPage): a searchable/sortable DataTable with fiscal +
// paid badges, mark-paid, and a fiscal-QR modal. Wired to api.listInvoices / markPaid.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, Printer, CreditCard, Wallet, Check } from "lucide-react";
import { FiscalBadge, QR, SkeletonRows } from "@/components/ui";
import { Card } from "@/components/ui-kit/card";
import { Button } from "@/components/ui-kit/button";
import { Badge } from "@/components/ui-kit/badge";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui-kit/dialog";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { money, num, orderLabel, vehicleTitle } from "@/lib/format";
import { fiscalFromProto, paymentFromProto, paymentLabelKey, type PaymentMethod } from "@/lib/enums";
import type { Invoice, WorkOrder, ShopCard } from "@/lib/types";
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
  const [cards, setCards] = useState<ShopCard[]>([]);

  useEffect(() => { api.listShopCards().then((c) => setCards(c.filter((x) => x.active !== false))).catch(() => {}); }, []);

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

  const pay = async (inv: Invoice, method: PaymentMethod, card?: { cardId?: string; cardNumber?: string }) => {
    try {
      const updated = await api.markPaid(inv.id, method, card);
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
            {inv.paid && inv.paymentMethod && <Badge tone="neutral">{t(paymentLabelKey(paymentFromProto(inv.paymentMethod)))}</Badge>}
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
      <InvoiceDetailModal invoice={sel} orderNo={orderNoFor(sel)} wo={woFor(sel)} cards={cards} onClose={() => setSel(null)} onPay={pay} />
    </div>
  );
}

function InvoiceDetailModal({ invoice, orderNo, wo, cards, onClose, onPay }: { invoice: Invoice | null; orderNo: string; wo?: WorkOrder; cards: ShopCard[]; onClose: () => void; onPay: (inv: Invoice, m: PaymentMethod, card?: { cardId?: string; cardNumber?: string }) => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [cardMode, setCardMode] = useState(false);
  const [pickedCard, setPickedCard] = useState("");
  const [adhoc, setAdhoc] = useState("");
  useEffect(() => { if (!invoice) { setCardMode(false); setPickedCard(""); setAdhoc(""); } }, [invoice]);
  if (!invoice) return null;
  const fiscal = fiscalFromProto(invoice.fiscalStatus);
  const carTitle = wo ? vehicleTitle(wo) : "";
  const payCard = () => {
    const chosen = cards.find((c) => c.id === pickedCard);
    const number = chosen ? chosen.cardNumber : adhoc.trim();
    if (!number) { toast(t("card_required"), { icon: "alert", tone: "danger" }); return; }
    onPay(invoice, "card", { cardId: chosen ? chosen.id : undefined, cardNumber: number });
  };
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

          {invoice.paid && invoice.cardNumber && (
            <div className="flex items-center gap-2 rounded-[9px] border border-border bg-secondary px-3 py-2 text-[13px]">
              <CreditCard className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("received_on")}</span>
              <span className="ml-auto font-mono font-semibold">{invoice.cardNumber}</span>
            </div>
          )}

          {!invoice.paid && !cardMode && (
            <div>
              <div className="mb-2 text-[12.5px] font-semibold text-muted-foreground">{t("mark_paid")} · {t("payment_method")}</div>
              <div className="grid grid-cols-3 gap-2.5">
                <Button variant="soft" onClick={() => onPay(invoice, "cash")}><Banknote /> {t("pay_cash")}</Button>
                <Button variant="soft" onClick={() => setCardMode(true)}><CreditCard /> {t("pay_card")}</Button>
                <Button variant="soft" onClick={() => onPay(invoice, "other")}><Wallet /> {t("pay_other")}</Button>
              </div>
            </div>
          )}

          {!invoice.paid && cardMode && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="text-[12.5px] font-semibold text-muted-foreground">{t("pay_card")} · {t("select_card")}</div>
                <button className="text-[12.5px] font-semibold text-muted-foreground hover:text-foreground" onClick={() => { setCardMode(false); setPickedCard(""); setAdhoc(""); }}>← {t("back")}</button>
              </div>
              {cards.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {cards.map((c) => (
                    <button key={c.id} onClick={() => { setPickedCard(c.id); setAdhoc(""); }}
                      className={cn("flex items-center gap-3 rounded-[9px] border px-3 py-2.5 text-left transition-colors", pickedCard === c.id ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary")}>
                      <CreditCard className="size-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        {c.label && <div className="truncate text-[13.5px] font-semibold">{c.label}</div>}
                        <div className="truncate font-mono text-[13px] text-muted-foreground">{c.cardNumber}</div>
                      </div>
                      {pickedCard === c.id && <Check className="size-[17px] text-primary-emphasis" />}
                    </button>
                  ))}
                </div>
              )}
              <Field label={cards.length > 0 ? t("new_card") : t("card_number")}>
                <Input value={adhoc} inputMode="numeric" placeholder="8600 0000 0000 0000"
                  onChange={(e) => { setAdhoc(e.target.value); if (e.target.value) setPickedCard(""); }} className="font-mono" />
              </Field>
              <Button disabled={!pickedCard && !adhoc.trim()} onClick={payCard}>{t("mark_paid")}</Button>
            </div>
          )}

          <Button variant="ghost" onClick={() => window.open(`/print-invoice/${invoice.id}`, "_blank")}><Printer /> {t("print")}</Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
