"use client";
// Parts inventory: stock list with low-stock flag, add part, and receive/consume stock.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
import { MoneyInput, UnitSelect } from "@/components/catalog-fields";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Part } from "@/lib/types";

export default function InventoryPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [list, setList] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [adjust, setAdjust] = useState<Part | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listParts(shopId)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo<ColumnDef<Part>[]>(() => [
    {
      id: "name",
      accessorFn: (p) => `${p.name || ""} ${p.sku || ""} ${p.supplier || ""}`,
      header: ({ column }) => <SortHeader column={column}>{t("material_name")}</SortHeader>,
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-foreground">{p.name}</div>
            <div className="flex flex-wrap gap-x-2 text-[11.5px] text-muted-foreground">
              {p.sku && <span className="font-mono">{p.sku}</span>}
              {p.supplier && <span>· {p.supplier}</span>}
              {num(p.unitPrice) > 0 && <span>· {money(p.unitPrice!)}</span>}
            </div>
          </div>
        );
      },
    },
    {
      id: "stock",
      accessorFn: (p) => num(p.quantityOnHand),
      header: ({ column }) => <SortHeader column={column}>{t("in_stock")}</SortHeader>,
      cell: ({ row }) => {
        const p = row.original;
        const low = num(p.quantityOnHand) <= num(p.reorderLevel);
        return (
          <div className="flex flex-col items-start gap-1">
            <span className={cn("font-mono text-[15px] font-bold", low ? "text-destructive" : "text-foreground")}>
              {num(p.quantityOnHand)}{p.unit ? " " + p.unit : ""}
            </span>
            {low && <Badge tone="danger" dot>{t("low_stock")}</Badge>}
          </div>
        );
      },
    },
    {
      id: "actions",
      enableHiding: false,
      header: () => <span className="sr-only">{t("adjust_stock")}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button variant="soft" size="sm" onClick={() => setAdjust(row.original)}>{t("adjust_stock")}</Button>
        </div>
      ),
    },
  ], [t]);

  return (
    <div className="flex flex-col gap-4">
      {loading && list.length === 0 ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="an-skel h-11 w-full rounded-[8px]" />)}</Card>
      ) : (
        <DataTable
          columns={columns}
          data={list}
          searchPlaceholder={t("search") + "…"}
          emptyText={t("empty")}
          toolbar={<Button onClick={() => setAdding(true)}><Plus /> {t("add_part")}</Button>}
          columnLabels={{ name: t("material_name"), stock: t("in_stock") }}
          pageSize={12}
        />
      )}
      <AddPartModal open={adding} onClose={() => setAdding(false)} shopId={shopId} onCreated={load} />
      <AdjustModal part={adjust} onClose={() => setAdjust(null)} onDone={load} />
    </div>
  );
}

const emptyPart = { name: "", sku: "", unit: "pcs", qty: "", reorder: "", cost: "", price: "", supplier: "" };

function AddPartModal({ open, onClose, shopId, onCreated }: { open: boolean; onClose: () => void; shopId: string; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState(emptyPart);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(emptyPart); }, [open]);

  const dec = (v: string) => v.replace(/[^\d.]/g, "");

  const save = async () => {
    if (!f.name.trim() || busy) return;
    setBusy(true);
    try {
      await api.createPart(shopId, {
        name: f.name.trim(), sku: f.sku.trim(), unit: f.unit, supplier: f.supplier.trim(),
        quantityOnHand: parseFloat(f.qty) || 0, reorderLevel: parseFloat(f.reorder) || 0,
        unitCost: parseInt(f.cost, 10) || 0, unitPrice: parseInt(f.price, 10) || 0,
      });
      toast(t("save"), { icon: "check" }); onClose(); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader><DialogTitle>{t("add_part")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          <Field label={t("material_name")}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-[1fr_1fr_80px] gap-2.5">
            <Field label="SKU"><Input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} className="font-mono" /></Field>
            <Field label={t("supplier")}><Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
            <Field label={t("unit")}><UnitSelect value={f.unit} onChange={(v) => setF({ ...f, unit: v })} /></Field>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            <Field label={t("in_stock")}><Input value={f.qty} onChange={(e) => setF({ ...f, qty: dec(e.target.value) })} inputMode="decimal" placeholder="0" className="font-mono" /></Field>
            <Field label={t("reorder_level")}><Input value={f.reorder} onChange={(e) => setF({ ...f, reorder: dec(e.target.value) })} inputMode="decimal" placeholder="0" className="font-mono" /></Field>
            <Field label={t("cost")}><MoneyInput value={f.cost} onChange={(v) => setF({ ...f, cost: v })} /></Field>
            <Field label={t("price")}><MoneyInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustModal({ part, onClose, onDone }: { part: Part | null; onClose: () => void; onDone: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [mode, setMode] = useState<"receive" | "consume">("receive");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (part) { setMode("receive"); setAmount(""); setReason(""); } }, [part]);

  const save = async () => {
    if (!part) return;
    const amt = parseFloat(amount) || 0;
    if (amt <= 0 || busy) return;
    setBusy(true);
    try {
      await api.adjustStock(part.id, mode === "consume" ? -amt : amt, reason.trim() || mode);
      toast(t("save"), { icon: "check" }); onClose(); onDone();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!part} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader><DialogTitle>{part ? `${part.name} · ${num(part.quantityOnHand)}${part.unit ? " " + part.unit : ""}` : ""}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "receive" | "consume")}>
            <TabsList className="w-full">
              <TabsTrigger value="receive" className="flex-1">{t("receive")}</TabsTrigger>
              <TabsTrigger value="consume" className="flex-1">{t("consume")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Field label={t("qty")}><Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0" className="font-mono" /></Field>
          <Field label={t("notes")}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
