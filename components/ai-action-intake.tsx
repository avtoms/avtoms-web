"use client";

import { useState } from "react";
import { useLang } from "@/components/providers";
import { Btn } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { AiActionIntake as Intake } from "@/lib/api";
import { actionTitleKeys } from "./ai-action-card";
import styles from "./ai-action-card.module.css";

export function AiActionIntake({ intake, disabled, answered, onSend }: {
  intake: Intake;
  disabled: boolean;
  answered: boolean;
  onSend: (answer: string) => void;
}) {
  const { t } = useLang();
  const [answers, setAnswers] = useState<string[]>(() => intake.questions.map(() => ""));
  const reply = () => {
    const supplied = intake.questions.flatMap((question, index) => {
      const answer = answers[index]?.trim();
      return answer ? [`${question}\n${answer}`] : [];
    });
    if (!disabled && supplied.length) onSend(supplied.join("\n\n"));
  };
  return (
    <form className={styles.card} data-chat-review onSubmit={(e) => { e.preventDefault(); reply(); }}>
      <header className={styles.header}>
        <div className={styles.icon}><Icon name="list" size={18} /></div>
        <div className={styles.headerCopy}>
          <div className={styles.eyebrow}>{t(actionTitleKeys[intake.action] || "ai_assistant")}</div>
          <h3 className={styles.title}>{t("ai_intake_title")}</h3>
        </div>
      </header>
      {answered ? (
        <div className={styles.body}>
          <ul className={styles.muted} style={{ paddingInlineStart: 18 }}>
            {intake.questions.map((question, index) => <li key={index}>{question}</li>)}
          </ul>
        </div>
      ) : (
        <>
          <div className={styles.body}>
            {intake.questions.map((question, index) => (
              <label key={index} className={styles.label}>
                {question}
                <textarea className={styles.input} rows={1} value={answers[index] || ""} maxLength={2000} disabled={disabled}
                  onChange={(e) => setAnswers((current) => current.map((answer, i) => i === index ? e.target.value : answer))} />
              </label>
            ))}
          </div>
          <footer className={styles.footer}>
            <Btn type="submit" variant="primary" size="sm" iconRight="send"
              disabled={disabled || !answers.some((answer) => answer.trim())}>{t("ai_intake_send")}</Btn>
          </footer>
        </>
      )}
    </form>
  );
}
