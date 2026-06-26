"use client";
// Super-admin integration credentials. For now: the PlayMobile SMS gateway. Secret fields
// are write-only — the backend never returns them, so a blank password keeps the stored one.
import React, { useCallback, useEffect, useState } from "react";
import { Card, Badge, Btn, Field, TextInput, Spinner } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";

type FieldDef = { key: string; label: string; secret?: boolean; placeholder?: string };

const PROVIDERS: { provider: string; title: string; note: string; fields: FieldDef[] }[] = [
  {
    provider: "playmobile",
    title: "PlayMobile SMS",
    note: "SMS gateway (send.smsxabar.uz) used for OTP and customer notifications.",
    fields: [
      { key: "url", label: "API URL", placeholder: "https://send.smsxabar.uz/broker-api/send" },
      { key: "login", label: "Login", placeholder: "login" },
      { key: "password", label: "Password", secret: true, placeholder: "••••••" },
      { key: "originator", label: "Originator", placeholder: "3700" },
    ],
  },
];

export default function IntegrationsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {PROVIDERS.map((p) => (
        <IntegrationCard key={p.provider} {...p} />
      ))}
    </div>
  );
}

function IntegrationCard({ provider, title, note, fields }: { provider: string; title: string; note: string; fields: FieldDef[] }) {
  const { toast } = useToast();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const got = await api.getIntegration(provider);
      setVals(got.values || {});
      setConfigured(got.configured);
    } catch { /* leave empty */ }
    finally { setLoading(false); }
  }, [provider]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const got = await api.updateIntegration(provider, vals);
      setVals(got.values || {});
      setConfigured(got.configured);
      toast("Saqlandi", { icon: "check" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Xatolik", { icon: "alert", tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <Card pad={0}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="bell" size={18} style={{ color: "var(--ink-3)" }} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(15px * var(--scale))" }}>{title}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{note}</div>
          </div>
        </div>
        <Badge tone={configured ? "ok" : "neutral"} dot>{configured ? "Sozlangan" : "Sozlanmagan"}</Badge>
      </div>
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 28 }}><Spinner size={22} /></div>
      ) : (
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 13 }}>
          {fields.map((f) => (
            <Field key={f.key} label={f.label + (f.secret ? " (yashirin)" : "")} hint={f.secret && configured ? "Saqlangan — o'zgartirmaslik uchun bo'sh qoldiring" : undefined}>
              <TextInput
                value={vals[f.key] ?? ""}
                type={f.secret ? "password" : undefined}
                placeholder={f.placeholder}
                onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
                style={{ fontFamily: "var(--font-mono)" }}
              />
            </Field>
          ))}
          <div><Btn variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : "Saqlash"}</Btn></div>
        </div>
      )}
    </Card>
  );
}
