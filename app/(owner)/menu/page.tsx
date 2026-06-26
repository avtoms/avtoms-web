"use client";
// Pricing menu (owner-pages.jsx MenuPage): list services with localized name + price,
// add-service modal. Wired to api.listMenuItems / createMenuItem.
// NOTE: no toggle-active endpoint in the API client, so the active toggle is read-only.
import React, { useCallback, useEffect, useState } from "react";
import { Card, Badge, Btn, Modal, Field, TextInput, Spinner, Empty } from "@/components/ui";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";
import type { MenuItem } from "@/lib/types";

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

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listMenuItems(shopId)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [shopId, t, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>holat o&apos;zgartirilmaydi</span>
        <Btn variant="primary" icon="plus" onClick={() => setAdding(true)}>{t("add_service")}</Btn>
      </div>
      <Card pad={0}>
        {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={24} /></div>
          : list.length === 0 ? <div style={{ padding: 24 }}><Empty icon="list" /></div>
          : list.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 18px", borderBottom: "1px solid var(--line)", opacity: m.active ? 1 : 0.55 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))" }}>{menuName(m, lang)}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{m.nameUzLatn} · {m.nameUzCyrl} · {m.nameRu}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>{money(m.defaultPrice)}</div>
                {num(m.defaultCost) > 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-3)" }}>{t("cost")}: {money(m.defaultCost!)}</div>}
              </div>
              <Badge tone={m.active ? "ok" : "neutral"} dot>{m.active ? t("active") : t("inactive")}</Badge>
            </div>
          ))}
      </Card>
      <AddMenuModal open={adding} onClose={() => setAdding(false)} shopId={shopId} onCreated={() => load()} />
    </div>
  );
}

function AddMenuModal({ open, onClose, shopId, onCreated }: { open: boolean; onClose: () => void; shopId: string; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [f, setF] = useState({ uz: "", uzc: "", ru: "", price: "", cost: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ uz: "", uzc: "", ru: "", price: "", cost: "" }); }, [open]);

  const save = async () => {
    if (!f.uz.trim() || !f.price || busy) return;
    setBusy(true);
    try {
      await api.createMenuItem(shopId, { nameUzLatn: f.uz.trim(), nameUzCyrl: f.uzc.trim(), nameRu: f.ru.trim(), defaultPrice: parseInt(f.price, 10) || 0, defaultCost: parseInt(f.cost, 10) || 0 });
      toast(t("save"), { icon: "check" }); onClose(); onCreated();
    } catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("add_service")} maxWidth={440}
      footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Field label="O'zbekcha (Latin)"><TextInput value={f.uz} onChange={(e) => setF({ ...f, uz: e.target.value })} /></Field>
        <Field label="Ўзбекча (Кирилл)"><TextInput value={f.uzc} onChange={(e) => setF({ ...f, uzc: e.target.value })} /></Field>
        <Field label="Русский"><TextInput value={f.ru} onChange={(e) => setF({ ...f, ru: e.target.value })} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={t("default_price") + " (" + t("soum") + ")"}><TextInput value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, "") })} inputMode="numeric" style={{ fontFamily: "var(--font-mono)" }} /></Field>
          <Field label={t("default_cost") + " (" + t("soum") + ")"}><TextInput value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="0" style={{ fontFamily: "var(--font-mono)" }} /></Field>
        </div>
      </div>
    </Modal>
  );
}
