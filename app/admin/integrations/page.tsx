"use client";
// Super-admin integration credentials. For now: the PlayMobile SMS gateway. Secret fields
// are write-only — the backend never returns them, so a blank password keeps the stored one.
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plug, ShieldCheck, Send, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui-kit/card";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Button } from "@/components/ui-kit/button";
import { Badge } from "@/components/ui-kit/badge";
import { Separator, Spinner } from "@/components/ui-kit/misc";
import { cn } from "@/lib/utils";
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
  {
    provider: "telegram",
    title: "Telegram bot",
    note: "Bot for customer estimate approvals. Create one with @BotFather, then paste its token and username.",
    fields: [
      { key: "token", label: "Bot token", secret: true, placeholder: "123456:ABC-DEF…" },
      { key: "username", label: "Bot username", placeholder: "my_shop_bot" },
    ],
  },
  {
    provider: "r2",
    title: "Cloudflare R2 (image uploads)",
    note: "Object storage for avatars and photos. Endpoint host only (no https://); the bucket must allow public read for images to display.",
    fields: [
      { key: "endpoint", label: "Endpoint", placeholder: "<account-id>.r2.cloudflarestorage.com" },
      { key: "bucket", label: "Bucket", placeholder: "avtoms-media" },
      { key: "access_key_id", label: "Access Key ID", secret: true, placeholder: "••••••" },
      { key: "secret_access_key", label: "Secret Access Key", secret: true, placeholder: "••••••" },
      { key: "public_url", label: "Public URL", placeholder: "https://pub-xxxx.r2.dev" },
    ],
  },
  {
    provider: "openai",
    title: "OpenAI (AI yordamchi)",
    note: "Egalar va superadmin uchun AI chat yordamchisini yoqadi. API kalitni kiriting, modelni tanlang va javob uchun token limitini belgilang. Faqat o'qish uchun — AI hech narsani o'zgartira olmaydi.",
    fields: [
      { key: "api_key", label: "API Key", secret: true, placeholder: "sk-…" },
      { key: "model", label: "Model", placeholder: "gpt-4o-mini" },
      { key: "max_tokens", label: "Javob uchun maksimal tokenlar", placeholder: "1200" },
      { key: "base_url", label: "Base URL (ixtiyoriy)", placeholder: "https://api.openai.com/v1" },
    ],
  },
];

export default function IntegrationsPage() {
  return (
    <div className="flex flex-col gap-4">
      {PROVIDERS.map((p) => (
        <IntegrationCard key={p.provider} {...p} />
      ))}
    </div>
  );
}

function ResultLine({ ok, detail }: { ok: boolean; detail: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 rounded-[8px] px-3 py-2 font-mono text-[12.5px] break-words", ok ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive")}>
      {ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
      {detail}
    </div>
  );
}

function IntegrationCard({ provider, title, note, fields }: { provider: string; title: string; note: string; fields: FieldDef[] }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; detail: string } | null>(null);

  const runHealthCheck = async () => {
    if (checking) return;
    setChecking(true); setHealth(null);
    try {
      const r = await api.testIntegration(provider);
      setHealth({ ok: !!r.ok, detail: r.detail || (r.ok ? "OK" : "Failed") });
    } catch (e) {
      setHealth({ ok: false, detail: e instanceof ApiError ? e.message : "Xatolik" });
    } finally { setChecking(false); }
  };

  const sendTest = async () => {
    if (!testPhone.trim() || testing) return;
    setTesting(true); setTestResult(null);
    try {
      const r = await api.sendTestSms(testPhone.trim());
      setTestResult({ ok: !!r.delivered, detail: r.detail || (r.delivered ? "Sent" : "Failed") });
    } catch (e) {
      setTestResult({ ok: false, detail: e instanceof ApiError ? e.message : "Xatolik" });
    } finally { setTesting(false); }
  };

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
      toast.success("Saqlandi");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Xatolik");
    } finally { setBusy(false); }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-secondary text-muted-foreground">
            <Plug className="size-[18px]" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-foreground">{title}</div>
            <div className="mt-0.5 max-w-prose text-[12px] text-muted-foreground">{note}</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {health && (
            <span className={cn("max-w-[280px] text-right text-[12px] font-semibold", health.ok ? "text-success" : "text-destructive")}>
              {health.ok ? "✓ " : "✗ "}{health.detail}
            </span>
          )}
          <Button variant="soft" size="sm" disabled={checking} onClick={runHealthCheck}>
            {checking ? <Spinner /> : <><ShieldCheck /> Tekshirish</>}
          </Button>
          <Badge tone={configured ? "ok" : "neutral"} dot>{configured ? "Sozlangan" : "Sozlanmagan"}</Badge>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-muted-foreground"><Spinner className="size-6" /></div>
      ) : (
        <CardContent className="flex flex-col gap-3.5">
          {fields.map((f) => (
            <Field
              key={f.key}
              label={f.label + (f.secret ? " (yashirin)" : "")}
              hint={f.secret && configured ? "Saqlangan — o'zgartirmaslik uchun bo'sh qoldiring" : undefined}
            >
              <Input
                value={vals[f.key] ?? ""}
                type={f.secret ? "password" : undefined}
                placeholder={f.placeholder}
                onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
                className="font-mono"
              />
            </Field>
          ))}
          <div><Button disabled={busy} onClick={save}>{busy ? <Spinner /> : "Saqlash"}</Button></div>

          {provider === "playmobile" && (
            <>
              <Separator className="mt-1.5" />
              <div className="flex flex-col gap-2.5">
                <div className="text-[12.5px] font-semibold text-muted-foreground">Sinov SMS (test)</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+998901234567" inputMode="tel" className="min-w-[180px] flex-1 font-mono" />
                  <Button variant="soft" disabled={testing} onClick={sendTest}>{testing ? <Spinner /> : <><Send /> Yuborish</>}</Button>
                </div>
                {testResult && <ResultLine ok={testResult.ok} detail={testResult.detail} />}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
