"use client";
// Settings (owner-pages.jsx SettingsPage): shop profile (local-only, no backend endpoint),
// UI language, theme/font/density tweaks (useTheme().set), and sign out.
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LogOut, CreditCard, Plus, Trash2, Pencil } from "lucide-react";
import { useIsMobile } from "@/components/ui";
import { Card } from "@/components/ui-kit/card";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Button } from "@/components/ui-kit/button";
import { Spinner } from "@/components/ui-kit/misc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import { cn } from "@/lib/utils";
import { useAuth, useLang, useTheme, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import {
  WO_STATES, STATE_LABEL, LOCKED_STATES, OPTIONAL_STATES, enabledSet, woStateToProto, type WoState,
} from "@/lib/enums";
import type { ShopCard, CompanyDetails } from "@/lib/types";
import { CompanyFields } from "@/components/company-details";
import { LANGS } from "@/lib/i18n";
import { THEMES, FONTS, type ThemeName, type FontName, type Density } from "@/lib/theme";
import { loadShopProfile, mergeShopProfile } from "@/lib/shop";
import { SecTitle } from "../_shared";
import { CurrencyRates } from "./_currency-rates";

export default function SettingsPage() {
  const { logout } = useAuth();
  const { lang, setLang, t } = useLang();
  const { theme, font, density, set } = useTheme();
  const { toast } = useToast();
  const router = useRouter();
  const isMobile = useIsMobile();

  // Shop identity now lives on the server (shop_settings), because a receipt rendered for
  // a customer has to say who issued it and cannot read one browser's localStorage. The old
  // local copy is still read once, to pre-fill the form for shops that filled it in before
  // this moved — they press Save and it is on the server for good.
  const [shop, setShop] = useState({ name: "", address: "", tin: "", phone: "", hours: "" });
  const [savingShop, setSavingShop] = useState(false);
  // The shop's own side of a bank transfer. A payment order names two parties, and until this
  // existed the system knew the supplier's account and never its own.
  const [company, setCompany] = useState<CompanyDetails>({});
  const [savingCompany, setSavingCompany] = useState(false);

  // Shop policy (real backend): the max discount %, and which statuses the order flow uses.
  // Both live on the same record, so each save sends the current value of the other.
  const [maxDiscount, setMaxDiscount] = useState("100");
  const [flow, setFlow] = useState<Set<WoState>>(() => new Set(WO_STATES));
  const [policyLoading, setPolicyLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingFlow, setSavingFlow] = useState(false);

  useEffect(() => {
    api.getShopSettings()
      .then((s) => {
        setMaxDiscount(String(s.maxDiscountPercent));
        setFlow(enabledSet(s.enabledStates));
        // Seed from the browser's old copy only where the server has nothing, so a shop
        // that never re-saved still sees its details instead of blank boxes.
        setShop(mergeShopProfile(s));
        setCompany(s.company ?? {});
      })
      .catch(() => setShop(loadShopProfile()))
      .finally(() => setPolicyLoading(false));
  }, []);

  // Profile and policy share one record, so every save carries the current value of both.
  const saveShop = async () => {
    if (savingShop) return;
    setSavingShop(true);
    try {
      const s = await api.updateShopSettings({
        maxDiscountPercent: currentPct(), enabledStates: flowList(flow),
        name: shop.name, address: shop.address, tin: shop.tin, phone: shop.phone, hours: shop.hours,
        company: companyBody(),
      });
      setShop({ name: s.name ?? "", address: s.address ?? "", tin: s.tin ?? "", phone: s.phone ?? "", hours: s.hours ?? "" });
      setCompany(s.company ?? {});
      toast(t("save"), { icon: "check" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setSavingShop(false);
    }
  };

  // The requisites block travels without its STIR: that value belongs to the profile field
  // above, and sending both would mean clearing the profile field silently restores it from
  // the block's copy — see the fallback in UpdateShopSettings.
  const companyBody = () => ({ ...company, tin: "" });

  const currentPct = () => Math.max(0, Math.min(100, parseInt(maxDiscount, 10) || 0));
  const flowList = (f: Set<WoState>) => WO_STATES.filter((s) => f.has(s)).map(woStateToProto);

  const savePolicy = async () => {
    if (savingPolicy) return;
    setSavingPolicy(true);
    try {
      const s = await api.updateShopSettings({ maxDiscountPercent: currentPct(), enabledStates: flowList(flow), ...shop, company: companyBody() });
      setMaxDiscount(String(s.maxDiscountPercent));
      toast(t("save"), { icon: "check" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setSavingPolicy(false);
    }
  };

  const saveFlow = async (next: Set<WoState>) => {
    if (savingFlow) return;
    const prev = flow;
    setFlow(next); // optimistic: the toggle should feel instant
    setSavingFlow(true);
    try {
      const s = await api.updateShopSettings({ maxDiscountPercent: currentPct(), enabledStates: flowList(next), ...shop, company: companyBody() });
      setFlow(enabledSet(s.enabledStates)); // trust the server's resolved set
      toast(t("save"), { icon: "check" });
    } catch (e) {
      setFlow(prev);
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setSavingFlow(false);
    }
  };

  const saveCompany = async () => {
    if (savingCompany) return;
    setSavingCompany(true);
    try {
      const s = await api.updateShopSettings({
        maxDiscountPercent: currentPct(), enabledStates: flowList(flow), ...shop, company: companyBody(),
      });
      setCompany(s.company ?? {});
      // The STIR is one column, shared with the receipt identity above: saving it here has to
      // show up there too, or the two boxes disagree until the page is reloaded.
      setShop((p) => ({ ...p, tin: s.tin ?? p.tin }));
      toast(t("save"), { icon: "check" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setSavingCompany(false);
    }
  };

  const signOut = () => { logout(); router.replace("/login"); };

  return (
    <div className="grid items-start gap-4" style={{ gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>
      {/* shop profile — stored server-side on shop_settings; printed on every receipt. */}
      <Card className="p-5">
        <SecTitle>{t("shop_profile")}</SecTitle>
        <div className="flex flex-col gap-3">
          <Field label={t("shop_name")}><Input value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} /></Field>
          <Field label={t("address")}><Input value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("tin")}><Input value={shop.tin} onChange={(e) => setShop({ ...shop, tin: e.target.value })} className="font-mono" /></Field>
            <Field label={t("hours")}><Input value={shop.hours} onChange={(e) => setShop({ ...shop, hours: e.target.value })} className="font-mono" /></Field>
          </div>
          <Field label={t("phone")}><Input value={shop.phone} onChange={(e) => setShop({ ...shop, phone: e.target.value })} className="font-mono" /></Field>
          <Button disabled={savingShop} onClick={saveShop}>{savingShop ? <Spinner /> : t("save")}</Button>
          <div className="text-[12px] text-muted-foreground">{t("shop_profile_hint")}</div>
        </div>
      </Card>

      {/* The shop as a legal entity: what a payment order needs to name the paying side.
          Its own card rather than more fields on the profile above, because the two are filled
          in by different people — the profile is what a customer's receipt prints, this is
          what the bank needs — and neither should look like a prerequisite for the other. */}
      <Card className="p-5">
        <SecTitle>{t("shop_requisites")}</SecTitle>
        <div className="flex flex-col gap-3">
          <p className="-mt-1 text-[12px] leading-snug text-muted-foreground">{t("shop_requisites_hint")}</p>
          {/* The STIR is shown, not asked for: it is the same column the profile card edits. */}
          <CompanyFields value={company} onChange={setCompany} disabled={savingCompany} hideTin tinNote={shop.tin} />
          <Button disabled={savingCompany} onClick={saveCompany}>{savingCompany ? <Spinner /> : t("save")}</Button>
        </div>
      </Card>

      {/* pricing policy — real backend (workorder shop settings) */}
      <Card className="p-5">
        <SecTitle>{t("pricing_policy")}</SecTitle>
        {policyLoading ? (
          <div className="flex justify-center py-6 text-muted-foreground"><Spinner className="size-5" /></div>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label={t("max_discount")}>
              <Input value={maxDiscount} inputMode="numeric"
                onChange={(e) => setMaxDiscount(e.target.value.replace(/\D/g, "").slice(0, 3))}
                className="font-mono" />
            </Field>
            <div className="text-[12px] text-muted-foreground">{t("max_discount_hint")}</div>
            <Button disabled={savingPolicy} onClick={savePolicy}>{savingPolicy ? <Spinner /> : t("save")}</Button>
          </div>
        )}
      </Card>

      {/* the shop's own exchange rates — hides itself when only so'm is published */}
      <CurrencyRates span={!isMobile} />

      {/* order status flow — which statuses this shop's board uses */}
      <Card className="p-5" style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
        <SecTitle>{t("status_flow")}</SecTitle>
        <div className="mb-3 text-[12px] text-muted-foreground">{t("status_flow_hint")}</div>
        {policyLoading ? (
          <div className="flex justify-center py-6 text-muted-foreground"><Spinner className="size-5" /></div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              {OPTIONAL_STATES.map((s) => {
                const on = flow.has(s);
                return (
                  <button key={s} disabled={savingFlow}
                    onClick={() => { const n = new Set(flow); if (on) n.delete(s); else n.add(s); void saveFlow(n); }}
                    className={cn(
                      "flex min-h-11 items-center justify-between rounded-[9px] border px-3.5 py-2.5 text-left transition-colors",
                      on ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary",
                    )}>
                    <span className={cn("text-[14.5px] font-semibold", on ? "text-primary-emphasis" : "text-foreground")}>
                      {t(STATE_LABEL[s])}
                    </span>
                    {on && <Check className="size-[17px] text-primary-emphasis" />}
                  </button>
                );
              })}
            </div>
            <div className="rounded-[9px] border border-dashed border-border px-3.5 py-2.5">
              <div className="mb-1 text-[12px] font-semibold text-muted-foreground">{t("status_always_on")}</div>
              <div className="flex flex-wrap gap-1.5">
                {LOCKED_STATES.map((s) => (
                  <span key={s} className="rounded-full bg-secondary px-2.5 py-1 text-[12px] text-muted-foreground">{t(STATE_LABEL[s])}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* payment cards — real backend (invoice service) */}
      <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
        <PaymentCardsCard />
      </div>

      {/* UI language */}
      <Card className="p-5">
        <SecTitle>{t("ui_language")}</SecTitle>
        <div className="flex flex-col gap-2">
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)} className={cn(
              "flex min-h-11 items-center justify-between rounded-[9px] border px-3.5 py-2.5 text-left transition-colors",
              l.code === lang ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary",
            )}>
              <span className={cn("text-[14.5px] font-semibold", l.code === lang ? "text-primary-emphasis" : "text-foreground")}>{l.label}</span>
              {l.code === lang && <Check className="size-[17px] text-primary-emphasis" />}
            </button>
          ))}
        </div>
      </Card>

      {/* tweaks: theme / font / density */}
      <Card className="p-5" style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
        <SecTitle>Tweaks</SecTitle>
        <div className="flex flex-col gap-4">
          <Field label="Theme">
            <Tabs value={theme} onValueChange={(v) => set({ theme: v as ThemeName })}>
              <TabsList className="w-full">
                {(Object.keys(THEMES) as ThemeName[]).map((k) => <TabsTrigger key={k} value={k} className="flex-1">{THEMES[k].label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </Field>
          <Field label="Font">
            <Tabs value={font} onValueChange={(v) => set({ font: v as FontName })}>
              <TabsList className="w-full">
                {(Object.keys(FONTS) as FontName[]).map((k) => <TabsTrigger key={k} value={k} className="flex-1">{FONTS[k].label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </Field>
          <Field label="Density">
            <Tabs value={density} onValueChange={(v) => set({ density: v as Density })}>
              <TabsList className="w-full">
                {(["compact", "regular", "comfy"] as Density[]).map((d) => <TabsTrigger key={d} value={d} className="flex-1 capitalize">{d}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </Field>
        </div>
      </Card>

      <Card className="p-5" style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
        <Button variant="destructive" onClick={signOut}><LogOut /> {t("sign_out")}</Button>
      </Card>
    </div>
  );
}

/* ── Payment cards: the shop's own receiving cards used for card payments ── */
function PaymentCardsCard() {
  const { t } = useLang();
  const { toast } = useToast();
  const [cards, setCards] = useState<ShopCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ShopCard | "new" | null>(null);

  const load = () => api.listShopCards().then(setCards).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const remove = async (c: ShopCard) => {
    try { await api.deleteShopCard(c.id); toast(t("save"), { icon: "check" }); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <SecTitle>{t("payment_cards")}</SecTitle>
        <Button size="sm" onClick={() => setEditing("new")}><Plus /> {t("add_card")}</Button>
      </div>
      <div className="mb-3 text-[12px] text-muted-foreground">{t("payment_cards_hint")}</div>
      {loading ? (
        <div className="flex justify-center py-6 text-muted-foreground"><Spinner className="size-5" /></div>
      ) : cards.length === 0 ? (
        <div className="rounded-[9px] border border-dashed border-border py-6 text-center text-[13px] text-muted-foreground">{t("no_cards")}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {cards.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-[9px] border border-border bg-card px-3 py-2.5">
              <CreditCard className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                {c.label && <div className="truncate text-[13.5px] font-semibold">{c.label}</div>}
                <div className="truncate font-mono text-[13px] text-muted-foreground">{c.cardNumber}{c.holder ? " · " + c.holder : ""}</div>
              </div>
              <button aria-label={t("edit")} className="grid size-9 touch:size-11 shrink-0 place-items-center rounded-[8px] text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => setEditing(c)}><Pencil className="size-4" /></button>
              <button aria-label={t("delete")} className="grid size-9 touch:size-11 shrink-0 place-items-center rounded-[8px] text-muted-foreground hover:bg-destructive-soft hover:text-destructive" onClick={() => remove(c)}><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
      )}
      <CardModal open={editing !== null} card={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </Card>
  );
}

function CardModal({ open, card, onClose, onSaved }: { open: boolean; card: ShopCard | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(card?.label ?? "");
    setNumber(card?.cardNumber ?? "");
    setHolder(card?.holder ?? "");
  }, [open, card]);

  const save = async () => {
    if (busy) return;
    if (!number.trim()) { toast(t("card_required"), { icon: "alert", tone: "danger" }); return; }
    setBusy(true);
    try {
      if (card) await api.updateShopCard(card.id, { label: label.trim(), cardNumber: number.trim(), holder: holder.trim(), active: card.active ?? true });
      else await api.createShopCard({ label: label.trim(), cardNumber: number.trim(), holder: holder.trim() });
      toast(t("save"), { icon: "check" });
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader><DialogTitle>{card ? t("edit") : t("add_card")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          <Field label={t("card_label")}>
            <Input value={label} placeholder={t("card_label_ph")} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label={t("card_number")}>
            <Input value={number} inputMode="numeric" placeholder="8600 0000 0000 0000" onChange={(e) => setNumber(e.target.value)} className="font-mono" />
          </Field>
          <Field label={t("card_holder")}>
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
