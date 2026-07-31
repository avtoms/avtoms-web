"use client";
// VehicleHistoryModal: everything about one car — its service book and its warranties.
// Shared by the customer detail modal and the Cars tab so both open the same per-vehicle view.
//
// The history used to be a date, a count of line items and a total per visit. That answers
// "when did they come and what did they pay"; it cannot answer what a service book is for,
// which is "when was the oil last done and how far has it gone since". <ServiceBookPanel>
// answers that, so it replaces the list here rather than sitting beside it.
import React, { useCallback, useEffect, useState } from "react";
import { Card, Badge, Btn, Modal, Field, TextInput, Spinner } from "@/components/ui";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { plateTypeFromProto } from "@/lib/enums";
import { ServiceBookPanel } from "@/components/service-book";
import { PlatePreview } from "@/components/plate";
import type { Vehicle, Warranty } from "@/lib/types";

export function warrantyStatus(w: Warranty): "active" | "expired" | "voided" {
  if (w.voided) return "voided";
  if (w.expiresOn && new Date(w.expiresOn).getTime() < Date.now()) return "expired";
  return "active";
}

export function VehicleHistoryModal({ vehicle, shopId, onClose }: { vehicle: Vehicle | null; shopId: string; onClose: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [addingW, setAddingW] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadWarranties = useCallback(() => {
    if (!vehicle) return;
    api.listWarranties(shopId, vehicle.id).then(setWarranties).catch(() => setWarranties([]));
  }, [vehicle, shopId]);

  useEffect(() => {
    if (!vehicle) return;
    setAddingW(false);
    loadWarranties();
  }, [vehicle, loadWarranties]);

  const voidW = async (id: string) => {
    if (busy) return; setBusy(true);
    try { await api.voidWarranty(id); loadWarranties(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  if (!vehicle) return null;
  const title = [vehicle.make, vehicle.model].filter(Boolean).join(" ") || t("vehicle");
  return (
    <Modal open={!!vehicle} onClose={onClose} title={t("service_book")} maxWidth={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 8 }}>{title} <PlatePreview plate={vehicle.plate} type={plateTypeFromProto(vehicle.plateType)} size="sm" /></div>

        {/* the service book */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("service_book")}</div>
        <ServiceBookPanel vehicleId={vehicle.id} />
        {/* warranties */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("warranties")}</div>
            {!addingW && <Btn variant="soft" size="sm" icon="plus" onClick={() => setAddingW(true)}>{t("add_warranty")}</Btn>}
          </div>
          {addingW && <AddWarrantyInline shopId={shopId} vehicleId={vehicle.id} onClose={() => setAddingW(false)} onCreated={() => { setAddingW(false); loadWarranties(); }} />}
          {warranties.length > 0 && (
            <Card pad={0}>
              {warranties.map((w) => {
                const s = warrantyStatus(w);
                return (
                  <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--line)", opacity: s === "active" ? 1 : 0.6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(13.5px * var(--scale))" }}>{w.title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)", display: "flex", gap: 7, flexWrap: "wrap" }}>
                        {!!w.months && <span>{w.months} {t("months")}</span>}
                        {!!Number(w.kmLimit) && <span style={{ fontFamily: "var(--font-mono)" }}>· {Number(w.kmLimit).toLocaleString()} km</span>}
                        {w.expiresOn && <span>· {t("until")} {new Date(w.expiresOn).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <Badge tone={s === "active" ? "ok" : s === "expired" ? "warn" : "neutral"} dot>{t("warranty_" + s)}</Badge>
                    {s === "active" && <Btn variant="ghost" size="sm" disabled={busy} onClick={() => voidW(w.id)} style={{ color: "var(--ink-3)" }}>{t("void")}</Btn>}
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AddWarrantyInline({ shopId, vehicleId, onClose, onCreated }: { shopId: string; vehicleId: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ title: "", months: "6", km: "" });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!f.title.trim() || busy) return;
    setBusy(true);
    try {
      await api.createWarranty(shopId, {
        title: f.title.trim(), vehicleId,
        months: parseInt(f.months, 10) || 0, kmLimit: parseInt(f.km, 10) || 0,
      });
      toast(t("save"), { icon: "check" }); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Card pad={14}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label={t("description")}><TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("description")} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("warranty_months")}><TextInput value={f.months} onChange={(e) => setF({ ...f, months: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></Field>
          <Field label={t("km_limit")}><TextInput value={f.km} onChange={(e) => setF({ ...f, km: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></Field>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>{t("cancel")}</Btn>
          <Btn variant="primary" size="sm" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn>
        </div>
      </div>
    </Card>
  );
}
