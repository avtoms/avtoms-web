"use client";
// Parts inventory: stock list with low-stock flag, add part, and receive/consume stock.
import React, { useCallback, useEffect, useState } from "react";
import { Card, Badge, Btn, Modal, Field, TextInput, Segmented, Spinner, Empty, SkeletonRows } from "@/components/ui";
import { MoneyInput, UnitSelect } from "@/components/catalog-fields";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn variant="primary" icon="plus" onClick={() => setAdding(true)}>{t("add_part")}</Btn>
      </div>
      <Card pad={0}>
        {loading && list.length === 0 ? <SkeletonRows rows={7} avatar={false} />
          : list.length === 0 ? <div style={{ padding: 24 }}><Empty icon="wrench" /></div>
          : list.map((p) => {
            const low = num(p.quantityOnHand) <= num(p.reorderLevel);
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 18px", borderBottom: "1px solid var(--line)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {p.sku && <span style={{ fontFamily: "var(--font-mono)" }}>{p.sku}</span>}
                    {p.supplier && <span>· {p.supplier}</span>}
                    {num(p.unitPrice) > 0 && <span>· {money(p.unitPrice!)}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 84 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: low ? "var(--danger)" : "var(--ink)", fontSize: 15 }}>
                    {num(p.quantityOnHand)}{p.unit ? " " + p.unit : ""}
                  </div>
                  {low && <Badge tone="danger" dot>{t("low_stock")}</Badge>}
                </div>
                <Btn variant="soft" size="sm" onClick={() => setAdjust(p)}>{t("adjust_stock")}</Btn>
              </div>
            );
          })}
      </Card>
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
    <Modal open={open} onClose={onClose} title={t("add_part")} maxWidth={480}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label={t("material_name")}><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 10 }}>
          <Field label="SKU"><TextInput value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} style={{ fontFamily: "var(--font-mono)" }} /></Field>
          <Field label={t("supplier")}><TextInput value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
          <Field label={t("unit")}><UnitSelect value={f.unit} onChange={(v) => setF({ ...f, unit: v })} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          <Field label={t("in_stock")}><TextInput value={f.qty} onChange={(e) => setF({ ...f, qty: dec(e.target.value) })} inputMode="decimal" placeholder="0" style={{ fontFamily: "var(--font-mono)" }} /></Field>
          <Field label={t("reorder_level")}><TextInput value={f.reorder} onChange={(e) => setF({ ...f, reorder: dec(e.target.value) })} inputMode="decimal" placeholder="0" style={{ fontFamily: "var(--font-mono)" }} /></Field>
          <Field label={t("cost")}><MoneyInput value={f.cost} onChange={(v) => setF({ ...f, cost: v })} /></Field>
          <Field label={t("price")}><MoneyInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>
        </div>
      </div>
    </Modal>
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
  if (!part) return null;

  const save = async () => {
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
    <Modal open={!!part} onClose={onClose} title={`${part.name} · ${num(part.quantityOnHand)}${part.unit ? " " + part.unit : ""}`} maxWidth={400}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Segmented options={[{ value: "receive", label: t("receive") }, { value: "consume", label: t("consume") }]} value={mode} onChange={(v) => setMode(v as "receive" | "consume")} style={{ width: "100%" }} />
        <Field label={t("qty")}><TextInput value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0" style={{ fontFamily: "var(--font-mono)" }} /></Field>
        <Field label={t("notes")}><TextInput value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
