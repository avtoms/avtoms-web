"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/components/providers";
import { Card } from "@/components/ui-kit/card";
import { Spinner, Switch } from "@/components/ui-kit/misc";
import { api, ApiError } from "@/lib/api";

export function GarageAiActions() {
  const { t } = useLang();
  const [actions, setActions] = useState<Record<string, boolean> | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    api.getGarageAiActions()
      .then((result) => { if (active) setActions(result.actions ?? {}); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  const toggle = async (action: string, enabled: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await api.setGarageAiAction(action, enabled);
      setActions((current) => ({ ...current, [action]: result.enabled }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error"));
      // An administrator may have changed the garage's grants since this card loaded.
      await api.getGarageAiActions().then((result) => setActions(result.actions ?? {})).catch(() => {});
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const entries = Object.entries(actions ?? {});
  return (
    <Card className="p-6">
      <h2 className="text-[16px] font-bold text-foreground">{t("set_ai_actions")}</h2>
      <p className="mt-1 mb-4 text-[12.5px] text-muted-foreground">{t("set_ai_actions_hint")}</p>
      {failed && <p role="alert" className="text-sm text-destructive">{t("set_ai_actions_error")}</p>}
      {!actions && !failed && <Spinner />}
      {actions && entries.length === 0 && <p className="text-sm text-muted-foreground">{t("set_ai_actions_empty")}</p>}
      {entries.map(([action, enabled]) => (
        <label key={action} className="flex min-h-11 items-center justify-between gap-4 border-t border-border py-2 text-sm">
          <span>{t(action)}</span>
          <Switch checked={enabled} disabled={saving} onCheckedChange={(checked) => { void toggle(action, checked); }} />
        </label>
      ))}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </Card>
  );
}
