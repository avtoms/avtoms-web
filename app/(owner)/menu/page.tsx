"use client";
// Pricing menu (price list): list services with localized name + price; create AND edit
// each item. Editing logs a price-change history (viewable in the edit modal); existing
// work orders keep the price they were created with (line-item snapshot), so edits are safe.
import React, { useCallback, useEffect, useState } from "react";
import { Card, Badge, Btn, IconBtn, Modal, Field, TextInput, Spinner, Empty } from "@/components/ui";
import { Icon } from "@/components/icons";
import { MoneyInput, UnitSelect } from "@/components/catalog-fields";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num, durationFmt } from "@/lib/format";
import type { MenuItem, MenuPriceChange } from "@/lib/types";

function menuName(m: MenuItem, lang: string): string {
  return lang === "uzc" ? m.nameUzCyrl : lang === "ru" ? m.nameRu : m.nameUzLatn;
}

export default function MenuPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { lang, t } = useLang();
  const { toast } = useToast();

  const [list, setList] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listMenuItems(shopId)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Btn variant="primary" icon="plus" onClick={() => setAdding(true)}>{t("add_service")}</Btn>
      </div>
      <Card pad={0}>
        {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={24} /></div>
          : list.length === 0 ? <div style={{ padding: 24 }}><Empty icon="list" /></div>
          : list.map((m) => (
            <div key={m.id} className="an-row-btn" onClick={() => setEditing(m)} style={{ display: "flex", alignItems: "flex-start", gap: 13, padding: "13px 18px", borderBottom: "1px solid var(--line)", opacity: m.active ? 1 : 0.55, cursor: "pointer" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{menuName(m, lang)}</div>
                {(m.category || num(m.estimatedMinutes) > 0) && (
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                    {m.category && <span>{m.category}</span>}
                    {num(m.estimatedMinutes) > 0 && <span>· {durationFmt(num(m.estimatedMinutes))}</span>}
                  </div>
                )}
                {m.materials && m.materials.length > 0 && (
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>
                    <span style={{ fontWeight: 600 }}>{t("materials_needed")}:</span>{" "}
                    {m.materials.map((x) => x.name + (x.unit ? ` · ${x.quantity} ${x.unit}` : x.quantity > 1 ? " ×" + x.quantity : "")).join(", ")}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>{money(m.defaultPrice)}</div>
                {num(m.defaultCost) > 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-3)" }}>{t("cost")}: {money(m.defaultCost!)}</div>}
              </div>
              <Badge tone={m.active ? "ok" : "neutral"} dot>{m.active ? t("active") : t("inactive")}</Badge>
              <IconBtn icon="chevR" onClick={(ev) => { ev.stopPropagation(); setEditing(m); }} />
            </div>
          ))}
      </Card>
      <MenuModal open={adding} onClose={() => setAdding(false)} shopId={shopId} onSaved={() => load()} />
      <MenuModal open={!!editing} item={editing} onClose={() => setEditing(null)} shopId={shopId} onSaved={() => load()} />
    </div>
  );
}

type MatRow = { name: string; qty: string; unit: string; cost: string; price: string };
const emptyForm = { name: "", category: "", minutes: "", price: "", cost: "" };

function MenuModal({ open, onClose, shopId, item, onSaved }: { open: boolean; onClose: () => void; shopId: string; item?: MenuItem | null; onSaved: () => void }) {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const isEdit = !!item;
  const [f, setF] = useState(emptyForm);
  const [active, setActive] = useState(true);
  const [materials, setMaterials] = useState<MatRow[]>([]);
  const [history, setHistory] = useState<MenuPriceChange[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setF({ name: menuName(item, lang), category: item.category ?? "", minutes: item.estimatedMinutes ? String(item.estimatedMinutes) : "", price: String(num(item.defaultPrice)), cost: item.defaultCost ? String(num(item.defaultCost)) : "" });
      setActive(item.active);
      setMaterials((item.materials ?? []).map((x) => ({ name: x.name, qty: String(x.quantity), unit: x.unit ?? "pcs", cost: x.unitCost ? String(num(x.unitCost)) : "", price: x.unitPrice ? String(num(x.unitPrice)) : "" })));
      setHistory(null);
      api.listMenuPriceHistory(item.id).then(setHistory).catch(() => setHistory([]));
    } else {
      setF(emptyForm); setActive(true); setMaterials([]); setHistory(null);
    }
  }, [open, item, lang]);

  const setMat = (i: number, patch: Partial<MatRow>) => setMaterials((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addMat = () => setMaterials((rows) => [...rows, { name: "", qty: "1", unit: "pcs", cost: "", price: "" }]);
  const delMat = (i: number) => setMaterials((rows) => rows.filter((_, j) => j !== i));

  const save = async () => {
    if (!f.name.trim() || !f.price || busy) return;
    setBusy(true);
    const payload = {
      name: f.name.trim(),
      defaultPrice: parseInt(f.price, 10) || 0,
      defaultCost: parseInt(f.cost, 10) || 0,
      category: f.category.trim(),
      estimatedMinutes: parseInt(f.minutes, 10) || 0,
      materials: materials.filter((m) => m.name.trim()).map((m) => ({
        name: m.name.trim(), quantity: parseFloat(m.qty) || 1, unit: m.unit,
        unitCost: parseInt(m.cost, 10) || 0, unitPrice: parseInt(m.price, 10) || 0,
      })),
    };
    try {
      if (item) await api.updateMenuItem(item.id, { ...payload, active });
      else await api.createMenuItem(shopId, payload);
      toast(t("save"), { icon: "check" }); onClose(); onSaved();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  const numInput = (v: string, on: (s: string) => void, ph = "0") => (
    <TextInput value={v} onChange={(e) => on(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={ph} style={{ fontFamily: "var(--font-mono)" }} />
  );

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? t("edit") : t("add_service")} maxWidth={520}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Field label={t("service_name")}><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={t("category")}><TextInput value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
          <Field label={t("est_time")}>{numInput(f.minutes, (s) => setF({ ...f, minutes: s }))}</Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={t("default_price") + " (" + t("soum") + ")"}><MoneyInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>
          <Field label={t("default_cost") + " (" + t("soum") + ")"}><MoneyInput value={f.cost} onChange={(v) => setF({ ...f, cost: v })} /></Field>
        </div>

        {isEdit && (
          <button onClick={() => setActive((a) => !a)} className="an-btn" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 13px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--surface)", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
            <span style={{ fontWeight: 600, color: "var(--ink-2)", fontSize: 13.5 }}>{t("active")}</span>
            <Badge tone={active ? "ok" : "neutral"} dot>{active ? t("active") : t("inactive")}</Badge>
          </button>
        )}

        {/* materials editor */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-3)" }}>{t("materials_needed")}</span>
          <Btn variant="soft" size="sm" icon="plus" onClick={addMat}>{t("add_material")}</Btn>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {materials.map((m, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 56px 64px 1fr 1fr 28px", gap: 6, alignItems: "center" }}>
              <TextInput value={m.name} placeholder={t("material_name")} onChange={(e) => setMat(i, { name: e.target.value })} />
              <TextInput value={m.qty} placeholder="0" inputMode="decimal" onChange={(e) => setMat(i, { qty: e.target.value.replace(/[^\d.]/g, "") })} style={{ fontFamily: "var(--font-mono)", textAlign: "center" }} />
              <UnitSelect value={m.unit} onChange={(v) => setMat(i, { unit: v })} />
              <MoneyInput value={m.cost} onChange={(v) => setMat(i, { cost: v })} placeholder={t("cost")} />
              <MoneyInput value={m.price} onChange={(v) => setMat(i, { price: v })} placeholder={t("price")} />
              <Btn variant="ghost" size="sm" icon="trash" onClick={() => delMat(i)} aria-label="remove" />
            </div>
          ))}
          {materials.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 56px 64px 1fr 1fr 28px", gap: 6, fontSize: 10.5, color: "var(--ink-3)", padding: "0 2px" }}>
              <span>{t("material_name")}</span><span>{t("qty")}</span><span>{t("unit")}</span><span>{t("cost")}</span><span>{t("price")}</span><span />
            </div>
          )}
        </div>

        {/* price-change history (edit only) */}
        {isEdit && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{t("price_history")}</div>
            {history === null ? <div style={{ display: "flex", justifyContent: "center", padding: 14 }}><Spinner size={16} /></div>
              : history.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--ink-3)", padding: "4px 2px" }}>{t("no_price_changes")}</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {history.map((h) => (
                  <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-2)", background: "var(--surface-2)", borderRadius: 8, padding: "7px 10px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>{money(h.oldPrice)}</span>
                    <Icon name="chevR" size={13} style={{ color: "var(--ink-3)" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)" }}>{money(h.newPrice)}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{new Date(h.changedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>}
          </div>
        )}
      </div>
    </Modal>
  );
}
