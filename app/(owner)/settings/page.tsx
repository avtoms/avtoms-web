"use client";
// Settings (owner-pages.jsx SettingsPage): shop profile (local-only, no backend endpoint),
// UI language, theme/font/density tweaks (useTheme().set), and sign out.
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, TextInput, Btn, Segmented, Spinner, useIsMobile } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang, useTheme, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { LANGS } from "@/lib/i18n";
import { THEMES, FONTS, type ThemeName, type FontName, type Density } from "@/lib/theme";
import { loadShopProfile, saveShopProfile } from "@/lib/shop";
import { SecTitle } from "../_shared";

export default function SettingsPage() {
  const { logout } = useAuth();
  const { lang, setLang, t } = useLang();
  const { theme, font, density, set } = useTheme();
  const { toast } = useToast();
  const router = useRouter();
  const isMobile = useIsMobile();

  // shop profile is local-only for now (no shop endpoint); persisted in localStorage and
  // used for the printable-invoice header. Loaded once on mount.
  const [shop, setShop] = useState({ name: "", address: "", tin: "", hours: "" });
  useEffect(() => { setShop(loadShopProfile()); }, []);
  const saveShop = () => { saveShopProfile(shop); toast(t("save"), { icon: "check" }); };

  // Pricing policy (real): the per-shop max discount %. 100 = no cap.
  const [maxDiscount, setMaxDiscount] = useState("100");
  const [policyLoading, setPolicyLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);

  useEffect(() => {
    api.getShopSettings()
      .then((s) => setMaxDiscount(String(s.maxDiscountPercent)))
      .catch(() => {})
      .finally(() => setPolicyLoading(false));
  }, []);

  const savePolicy = async () => {
    if (savingPolicy) return;
    const pct = Math.max(0, Math.min(100, parseInt(maxDiscount, 10) || 0));
    setSavingPolicy(true);
    try {
      const s = await api.updateShopSettings(pct);
      setMaxDiscount(String(s.maxDiscountPercent));
      toast(t("save"), { icon: "check" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setSavingPolicy(false);
    }
  };

  const signOut = () => { logout(); router.replace("/login"); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, alignItems: "start" }}>
      {/* shop profile — TODO backend: no shop profile read/update endpoint yet. */}
      <Card>
        <SecTitle>{t("shop_profile")}</SecTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label={t("shop_name")}><TextInput value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} /></Field>
          <Field label={t("address")}><TextInput value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label={t("tin")}><TextInput value={shop.tin} onChange={(e) => setShop({ ...shop, tin: e.target.value })} style={{ fontFamily: "var(--font-mono)" }} /></Field>
            <Field label={t("hours")}><TextInput value={shop.hours} onChange={(e) => setShop({ ...shop, hours: e.target.value })} style={{ fontFamily: "var(--font-mono)" }} /></Field>
          </div>
          <Btn variant="primary" onClick={saveShop}>{t("save")}</Btn>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("shop_profile_local_hint")}</div>
        </div>
      </Card>

      {/* pricing policy — real backend (workorder shop settings) */}
      <Card>
        <SecTitle>{t("pricing_policy")}</SecTitle>
        {policyLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Spinner size={22} /></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label={t("max_discount")}>
              <TextInput value={maxDiscount} inputMode="numeric"
                onChange={(e) => setMaxDiscount(e.target.value.replace(/\D/g, "").slice(0, 3))}
                style={{ fontFamily: "var(--font-mono)" }} />
            </Field>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("max_discount_hint")}</div>
            <Btn variant="primary" disabled={savingPolicy} onClick={savePolicy}>{savingPolicy ? <Spinner /> : t("save")}</Btn>
          </div>
        )}
      </Card>

      {/* UI language */}
      <Card>
        <SecTitle>{t("ui_language")}</SecTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)} className="an-row-btn" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 13px", border: "1px solid " + (l.code === lang ? "var(--accent)" : "var(--line)"), borderRadius: "var(--radius-sm)", background: l.code === lang ? "var(--accent-soft)" : "var(--surface)", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
              <span style={{ fontWeight: 600, color: l.code === lang ? "var(--accent-2)" : "var(--ink)", fontSize: 14.5 }}>{l.label}</span>
              {l.code === lang && <Icon name="check" size={17} style={{ color: "var(--accent-2)" }} />}
            </button>
          ))}
        </div>
      </Card>

      {/* tweaks: theme / font / density */}
      <Card style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
        <SecTitle>Tweaks</SecTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Theme">
            <Segmented options={(Object.keys(THEMES) as ThemeName[]).map((k) => ({ value: k, label: THEMES[k].label }))} value={theme} onChange={(v) => set({ theme: v as ThemeName })} style={{ width: "100%" }} />
          </Field>
          <Field label="Font">
            <Segmented options={(Object.keys(FONTS) as FontName[]).map((k) => ({ value: k, label: FONTS[k].label }))} value={font} onChange={(v) => set({ font: v as FontName })} style={{ width: "100%" }} />
          </Field>
          <Field label="Density">
            <Segmented options={(["compact", "regular", "comfy"] as Density[]).map((d) => ({ value: d, label: d }))} value={density} onChange={(v) => set({ density: v as Density })} style={{ width: "100%" }} />
          </Field>
        </div>
      </Card>

      <Card style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
        <Btn variant="danger" icon="logout" onClick={signOut}>{t("sign_out")}</Btn>
      </Card>
    </div>
  );
}
