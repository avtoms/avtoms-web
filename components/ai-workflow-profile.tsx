"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/components/providers";
import { Btn, Spinner } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api, ApiError, type AiWorkflowProfile } from "@/lib/api";
import { actionTitleKeys } from "./ai-action-card";
import styles from "./ai-action-card.module.css";

export function AiWorkflowProfile() {
  const { t } = useLang();
  const [profile, setProfile] = useState<AiWorkflowProfile | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    api.getAiWorkflowProfile()
      .then((data) => { if (active) setProfile(data); })
      .catch((e) => { if (active) setError(e instanceof ApiError ? e.message : t("ai_error")); });
    return () => { active = false; };
  }, [t]);

  const update = async (operation: "enable" | "disable" | "clear") => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      setProfile(await api.updateAiWorkflowProfile(operation));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("ai_error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const counts = Object.entries(profile?.actionCounts ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <section className={styles.card} aria-busy={pending}>
      <header className={styles.header}>
        <div className={styles.icon}><Icon name="settings" size={18} /></div>
        <div className={styles.headerCopy}><h3 className={styles.title}>{t("ai_memory")}</h3></div>
      </header>
      <div className={styles.body}>
        <p className={styles.muted}>{t("ai_memory_description")}</p>
        {!profile && !error && <Spinner size={18} />}
        {profile?.enabled && (
          <>
            {!counts.length && !profile.preferredUnit && !profile.suggestedUnit && !profile.responseStyle && (
              <p className={styles.muted}>{t("ai_memory_empty")}</p>
            )}
            {(profile.preferredUnit || profile.suggestedUnit || profile.responseStyle || counts.length > 0) && (
              <dl className={styles.fields}>
                {profile.preferredUnit && <div className={styles.field}><dt>{t("ai_memory_preferred_unit")}</dt><dd>{profile.preferredUnit}</dd></div>}
                {profile.suggestedUnit && <div className={styles.field}><dt>{t("ai_memory_suggested_unit")}</dt><dd>{profile.suggestedUnit}</dd></div>}
                {profile.responseStyle && <div className={styles.field}><dt>{t("ai_memory_response_style")}</dt><dd>{t(`ai_memory_${profile.responseStyle}`)}</dd></div>}
                {counts.map(([key, count]) => <div key={key} className={styles.field}><dt>{t(actionTitleKeys[key] || key)}</dt><dd>{count}</dd></div>)}
              </dl>
            )}
          </>
        )}
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {profile && (
        <footer className={styles.footer}>
          {profile.enabled && <Btn size="sm" disabled={pending} onClick={() => update("clear")}>{t("ai_memory_clear")}</Btn>}
          <Btn size="sm" variant={profile.enabled ? "secondary" : "primary"} disabled={pending}
            onClick={() => update(profile.enabled ? "disable" : "enable")}>
            {t(profile.enabled ? "ai_memory_disable" : "ai_memory_enable")}
          </Btn>
        </footer>
      )}
    </section>
  );
}
