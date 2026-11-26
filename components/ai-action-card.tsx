"use client";

import { useRef, useState } from "react";
import { api, ApiError, type AiActionDraft, type AiActionFields, type AiActionValue } from "@/lib/api";
import { useLang } from "@/components/providers";
import { Btn, Spinner } from "@/components/ui";
import { Icon } from "@/components/icons";
import styles from "./ai-action-card.module.css";

export const actionTitleKeys: Record<string, string> = {
  create_product: "ai_create_product", edit_product: "ai_edit_product", adjust_stock: "ai_adjust_stock",
  create_service: "ai_create_service", edit_service: "ai_edit_service", create_order: "ai_create_order",
  edit_order_notes: "ai_edit_order_notes", add_order_line: "ai_add_order_line",
};

const fieldLabels: Record<string, string> = {
  name: "ai_field_title", brand: "brand", description: "description", category: "category", unit: "unit",
  active: "ai_field_active", properties: "ai_field_properties", variants: "ai_field_variants",
  variantEdits: "ai_field_variants", newVariants: "ai_field_new_variants", sku: "ai_field_sku",
  barcode: "ai_field_barcode", attributes: "ai_field_attributes", property: "ai_field_property",
  value: "ai_field_value", values: "ai_field_values", quantityOnHand: "ai_field_on_hand",
  reorderLevel: "ai_field_reorder", unitCost: "ai_field_cost", unitPrice: "ai_field_price",
  defaultCost: "ai_field_cost", defaultPrice: "ai_field_price", cost: "ai_field_cost",
  delta: "ai_field_delta", reason: "ai_field_reason", skipDebt: "ai_field_skip_debt",
  nameUzLatn: "ai_field_name_uz", nameUzCyrl: "ai_field_name_uzc", nameRu: "ai_field_name_ru",
  estimatedMinutes: "ai_field_minutes", odometer: "ai_field_odometer", notes: "ai_field_notes",
  kind: "ai_field_kind", quantity: "ai_field_quantity",
};

const isID = (key: string) => key === "id" || key.endsWith("Id");
const isMoney = (key: string) => /(?:Cost|Price)$/.test(key) || key === "cost";
type Label = (key: string) => string;

function rows(fields: AiActionFields) {
  return Object.entries(fields).filter(([key]) => !isID(key));
}

const isGroup = (value: AiActionValue) => value !== null && typeof value === "object";
const numericFields = new Set(["quantityOnHand", "reorderLevel", "delta", "estimatedMinutes", "quantity"]);

function Values({ fields, previous, label }: { fields: AiActionFields; previous?: AiActionFields; label: Label }) {
  const entries = rows(fields).filter(([key, value]) => previous?.[key] !== undefined || (value !== "" && value !== null && !(Array.isArray(value) && !value.length)));
  return (
    <dl className={styles.fields}>
      {entries.map(([key, value]) => {
        const old = previous?.[key];
        const labelKey = fieldLabels[key] || key;
        return (
          <div key={key} className={isGroup(value) ? `${styles.field} ${styles.group}` : styles.field}>
            <dt>{label(labelKey)}</dt>
            <dd>
              {old !== undefined && !isGroup(old) && !isGroup(value) && (
                <del className={styles.previous}><Value value={old} label={label} money={isMoney(key)} /></del>
              )}
              <Value value={value} label={label} money={isMoney(key)} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Value({ value, label, money }: { value: AiActionValue; label: Label; money?: boolean }) {
  if (value === null || value === "") return <>—</>;
  if (typeof value === "boolean") return <>{label(value ? "yes" : "no")}</>;
  if (Array.isArray(value)) {
    if (!value.length) return <>—</>;
    if (value.every((item) => typeof item === "string")) return <>{value.join(", ")}</>;
    return (
      <ul className={styles.rows}>
        {value.map((item, index) => <li key={index} className={styles.row}><Value value={item} label={label} /></li>)}
      </ul>
    );
  }
  if (typeof value === "object") return <Values fields={value} label={label} />;
  const display = String(value);
  return <>{money ? `${display.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f")} soʻm` : display}</>;
}

function EditFields({ fields, label, change }: { fields: AiActionFields; label: Label; change: (next: AiActionFields) => void }) {
  return (
    <div className={styles.editor}>
      {rows(fields).map(([key, value]) => (
        <EditValue key={key} name={key} value={value} label={label} change={(v) => change({ ...fields, [key]: v })} />
      ))}
    </div>
  );
}

const newListEntry: Record<string, () => AiActionValue> = {
  properties: () => ({ name: "", values: [""] }),
  values: () => "",
  variants: () => ({ sku: "", attributes: [], unitPrice: "0", unitCost: "0", quantityOnHand: 0, reorderLevel: 0 }),
  newVariants: () => ({ sku: "", attributes: [], unitPrice: "0", unitCost: "0", reorderLevel: 0 }),
  attributes: () => ({ property: "", value: "" }),
};

function EditValue({ name, value, label, change }: { name: string; value: AiActionValue; label: Label; change: (value: AiActionValue) => void }) {
  const title = label(fieldLabels[name] || name);
  if (Array.isArray(value)) {
    return (
      <fieldset className={styles.editorField}>
        <legend>{title}</legend>
        {value.map((item, index) => (
          <div key={index} className={styles.editorRow}>
            <EditValue name={String(index + 1)} value={item} label={label}
              change={(next) => change(value.map((v, i) => i === index ? next : v))} />
            {newListEntry[name] && <Btn size="sm" onClick={() => change(value.filter((_, i) => i !== index))}>{label("ai_draft_remove_row")}</Btn>}
          </div>
        ))}
        {newListEntry[name] && value.length < 100 && (
          <Btn size="sm" onClick={() => change([...value, newListEntry[name]()])}>{label("ai_draft_add_row")}</Btn>
        )}
      </fieldset>
    );
  }
  if (value !== null && typeof value === "object") {
    return (
      <fieldset className={styles.editorField}>
        <legend>{title}</legend>
        <EditFields fields={value} label={label} change={change} />
      </fieldset>
    );
  }
  if (typeof value === "boolean") {
    return <label><input type="checkbox" checked={value} onChange={(e) => change(e.target.checked)} /> {title}</label>;
  }
  return (
    <label className={styles.label}>
      {title}
      {name === "notes" || name === "description" ? (
        <textarea className={styles.input} value={String(value ?? "")} onChange={(e) => change(e.target.value)} />
      ) : (
        <input className={styles.input} value={String(value ?? "")} type={numericFields.has(name) || typeof value === "number" ? "number" : "text"}
          step="any" inputMode={isMoney(name) ? "numeric" : undefined}
          onChange={(e) => change(e.target.type === "number" ? (Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : null) : e.target.value)} />
      )}
    </label>
  );
}

export function AiActionCard({ draft, onRevise, onFinish, onOpen, disabled }: {
  draft: AiActionDraft;
  onRevise: (next: AiActionDraft) => void;
  onFinish: (status: "saved" | "discarded", recordId?: string) => void;
  onOpen: (path: string) => void;
  disabled: boolean;
}) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(draft.fields);
  const [pending, setPending] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const run = async (operation: "revise" | "confirm" | "discard") => {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const result = await api.aiAction(draft.id, operation, operation === "revise" ? fields : undefined);
      if (operation === "revise" && result.draft) onRevise(result.draft);
      if (operation === "confirm" && result.ok) onFinish("saved", result.recordId);
      if (operation === "discard" && result.ok) onFinish("discarded");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("ai_error"));
      if (operation === "confirm" || (e instanceof ApiError && e.status === 410)) setClosed(true);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const beforeGroups = Object.fromEntries(
    Object.entries(draft.before ?? {}).filter(([, value]) => isGroup(value)),
  );
  const icon = draft.kind.includes("order") ? "list" : draft.kind.endsWith("service") ? "wrench" : "clipboard";

  return (
    <section className={styles.card} data-chat-review aria-label={t("ai_draft_review")} aria-busy={pending}>
      <header className={styles.header}>
        <div className={styles.icon}><Icon name={icon} size={19} /></div>
        <div className={styles.headerCopy}>
          <div className={styles.eyebrow}>{t("ai_draft_review")}</div>
          <h3 className={styles.title}>{t(actionTitleKeys[draft.kind] || "ai_draft_review")}</h3>
          {draft.target && <div className={styles.target}>{draft.target}</div>}
        </div>
      </header>
      <div className={styles.body}>
        {editing ? (
          <EditFields fields={fields} label={t} change={setFields} />
        ) : (
          <>
            <Values fields={draft.after} previous={draft.before} label={t} />
            {Object.keys(beforeGroups).length > 0 && (
              <details className={styles.details}>
                <summary>{t("ai_draft_before")}</summary>
                <Values fields={beforeGroups} label={t} />
              </details>
            )}
          </>
        )}
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <footer className={styles.footer}>
        {closed ? (
          <Btn onClick={() => onOpen(actionPath(draft.kind))}>{t("ai_draft_open")}</Btn>
        ) : (
          <>
            <div className={styles.controls}>
              {rows(draft.fields).length > 0 && (
                <Btn size="sm" disabled={pending || disabled} onClick={() => { setFields(draft.fields); setEditing(!editing); }}>
                  {t(editing ? "cancel" : "edit")}
                </Btn>
              )}
              {!editing && <Btn size="sm" variant="ghost" disabled={pending || disabled} onClick={() => run("discard")}>{t("ai_draft_discard")}</Btn>}
            </div>
            <Btn size="sm" variant="primary" icon={!editing && !pending ? "check" : undefined}
              disabled={pending || disabled} onClick={() => run(editing ? "revise" : "confirm")}>
              {pending && <Spinner size={13} />}
              {t(editing ? "ai_draft_preview" : "ai_draft_confirm")}
            </Btn>
          </>
        )}
      </footer>
    </section>
  );
}

export function actionPath(kind: string, id?: string) {
  if (kind.includes("order")) return id ? `/work-orders/${encodeURIComponent(id)}` : "/work-orders";
  return kind.endsWith("service") ? "/menu" : "/inventory";
}
