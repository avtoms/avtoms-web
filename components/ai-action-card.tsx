"use client";

import { useRef, useState } from "react";
import { api, ApiError, type AiActionDraft, type AiActionFields, type AiActionValue } from "@/lib/api";
import { useLang } from "@/components/providers";
import { Btn } from "@/components/ui";

const titles: Record<string, string> = {
  create_product: "ai_create_product", edit_product: "ai_edit_product", adjust_stock: "ai_adjust_stock",
  create_service: "ai_create_service", edit_service: "ai_edit_service", create_order: "ai_create_order",
  edit_order_notes: "ai_edit_order_notes", add_order_line: "ai_add_order_line",
};

const fieldLabels: Record<string, string> = {
  name: "name", brand: "brand", description: "description", category: "category", unit: "unit",
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

function Values({ fields, label }: { fields: AiActionFields; label: Label }) {
  return (
    <dl style={{ margin: 0, display: "grid", gap: 5 }}>
      {rows(fields).map(([key, value]) => (
        <div key={key} style={{ minWidth: 0 }}>
          <dt style={{ color: "var(--ink-3)", fontSize: 12 }}>{label(fieldLabels[key] || key)}</dt>
          <dd style={{ margin: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
            <Value value={value} label={label} money={isMoney(key)} />
          </dd>
        </div>
      ))}
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
      <ol style={{ margin: "4px 0", paddingInlineStart: 22 }}>
        {value.map((item, index) => <li key={index}><Value value={item} label={label} /></li>)}
      </ol>
    );
  }
  if (typeof value === "object") return <Values fields={value} label={label} />;
  return <>{String(value)}{money ? " soʻm" : ""}</>;
}

const inputStyle = {
  boxSizing: "border-box" as const, width: "100%", padding: "6px 8px", border: "1px solid var(--line-2)",
  borderRadius: "var(--radius-sm)", color: "var(--ink)", background: "var(--bg)", font: "inherit",
};

function EditFields({ fields, label, change }: { fields: AiActionFields; label: Label; change: (next: AiActionFields) => void }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
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
      <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8, minWidth: 0, margin: 0 }}>
        <legend>{title}</legend>
        {value.map((item, index) => (
          <div key={index} style={{ marginBlock: 5 }}>
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
      <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8, minWidth: 0, margin: "4px 0" }}>
        <legend>{title}</legend>
        <EditFields fields={value} label={label} change={change} />
      </fieldset>
    );
  }
  if (typeof value === "boolean") {
    return <label><input type="checkbox" checked={value} onChange={(e) => change(e.target.checked)} /> {title}</label>;
  }
  return (
    <label style={{ display: "grid", gap: 4 }}>
      {title}
      {name === "notes" || name === "description" ? (
        <textarea style={inputStyle} value={String(value ?? "")} onChange={(e) => change(e.target.value)} />
      ) : (
        <input style={inputStyle} value={String(value ?? "")} type={typeof value === "number" ? "number" : "text"}
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

  return (
    <section style={{ border: "1px solid var(--line-2)", borderRadius: 12, background: "var(--surface)", padding: 12, fontSize: 13, display: "grid", gap: 10 }}>
      <header>
        <strong>{t(titles[draft.kind] || "ai_draft_review")}</strong>
        <div style={{ color: "var(--ink-2)", overflowWrap: "anywhere" }}>{draft.target}</div>
      </header>
      {editing ? (
        <EditFields fields={fields} label={t} change={setFields} />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {draft.before && (
            <details>
              <summary>{t("ai_draft_before")}</summary>
              <Values fields={draft.before} label={t} />
            </details>
          )}
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{t("ai_draft_after")}</div>
            <Values fields={draft.after} label={t} />
          </div>
        </div>
      )}
      {error && <div role="alert" style={{ color: "var(--danger)" }}>{error}</div>}
      {!closed && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Btn variant="primary" disabled={pending || disabled} onClick={() => run(editing ? "revise" : "confirm")}>
            {t(editing ? "ai_draft_preview" : "ai_draft_confirm")}
          </Btn>
          {rows(draft.fields).length > 0 && (
            <Btn disabled={pending || disabled} onClick={() => { setFields(draft.fields); setEditing(!editing); }}>
              {t(editing ? "cancel" : "edit")}
            </Btn>
          )}
          {!editing && <Btn disabled={pending || disabled} onClick={() => run("discard")}>{t("ai_draft_discard")}</Btn>}
        </div>
      )}
      {closed && <Btn onClick={() => onOpen(actionPath(draft.kind))}>{t("ai_draft_open")}</Btn>}
    </section>
  );
}

export function actionPath(kind: string, id?: string) {
  if (kind.includes("order")) return id ? `/work-orders/${encodeURIComponent(id)}` : "/work-orders";
  return kind.endsWith("service") ? "/menu" : "/inventory";
}
