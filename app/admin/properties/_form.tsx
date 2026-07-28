"use client";
// Client island for the super-admin property catalog. Create new property
// definitions and edit existing ones. A definition's `kind` drives the value UI:
//   number -> the product form lets clients type values (only a unit is defined here)
//   select -> a list of predefined text values
//   color  -> a list of predefined values, each with a hex swatch
//   text   -> free text on the product (no predefined values)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Check, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui-kit/card";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Button } from "@/components/ui-kit/button";
import { Spinner } from "@/components/ui-kit/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import { api, ApiError, type PropertyDefinitionInput } from "@/lib/api";
import type { PropertyDefinition } from "@/lib/types";

type Kind = PropertyDefinition["kind"];
type ValRow = { value: string; colorHex: string; uz: string; uzc: string; ru: string };
// Names/values carry a canonical text (the stable identifier products reference) plus a
// display translation per language; a blank translation falls back to the canonical text.
type Tr = { uz: string; uzc: string; ru: string };
const EMPTY_TR: Tr = { uz: "", uzc: "", ru: "" };
const LANG_FIELDS: { key: keyof Tr; label: string }[] = [
  { key: "uz", label: "O'zbekcha" },
  { key: "uzc", label: "Ўзбекча" },
  { key: "ru", label: "Русский" },
];

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "select", label: "Ro'yxat (tanlanadigan)", hint: "Oldindan belgilangan qiymatlar ro'yxati" },
  { value: "color", label: "Rang (palitra)", hint: "Har biri rang namunasi bilan" },
  { value: "number", label: "Raqam (kiritiladigan)", hint: "Mijoz qiymatni o'zi yozadi (birlik bilan)" },
  { value: "text", label: "Matn (erkin)", hint: "Mahsulotda erkin matn" },
];
const hasValues = (k: Kind) => k === "select" || k === "color";
const DEFAULT_HEX = "#888888";

// TranslationFields renders the three per-language display inputs for a name or value.
function TranslationFields({ tr, onChange, placeholder }: { tr: Tr; onChange: (t: Tr) => void; placeholder: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {LANG_FIELDS.map((f) => (
        <Field key={f.key} label={f.label}>
          <Input
            value={tr[f.key]}
            onChange={(e) => onChange({ ...tr, [f.key]: e.target.value })}
            placeholder={placeholder}
            className="h-9"
          />
        </Field>
      ))}
    </div>
  );
}

// ValueEditor edits the predefined values for select/color kinds. Each value has a canonical
// text (stored on products) plus optional per-language display translations.
function ValueEditor({ kind, values, onChange }: { kind: Kind; values: ValRow[]; onChange: (v: ValRow[]) => void }) {
  const set = (i: number, patch: Partial<ValRow>) => onChange(values.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Qiymatlar</span>
      {values.map((v, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-[10px] border border-border bg-card p-2.5">
          <div className="flex items-center gap-2">
            {kind === "color" && (
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(v.colorHex) ? v.colorHex : DEFAULT_HEX}
                onChange={(e) => set(i, { colorHex: e.target.value })}
                className="size-9 shrink-0 cursor-pointer rounded-[8px] border border-input bg-transparent p-0.5"
                title="Rang"
              />
            )}
            <Input value={v.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="Qiymat (asosiy)" className="h-9" />
            <Button variant="ghost" size="sm" onClick={() => onChange(values.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
          <TranslationFields
            tr={{ uz: v.uz, uzc: v.uzc, ru: v.ru }}
            onChange={(t) => set(i, { uz: t.uz, uzc: t.uzc, ru: t.ru })}
            placeholder="Tarjima (ixtiyoriy)"
          />
        </div>
      ))}
      <Button variant="soft" size="sm" className="self-start" onClick={() => onChange([...values, { value: "", colorHex: DEFAULT_HEX, ...EMPTY_TR }])}>
        <Plus /> Qiymat qo'shish
      </Button>
    </div>
  );
}

function buildInput(name: string, kind: Kind, unit: string, values: ValRow[], tr: Tr): PropertyDefinitionInput {
  return {
    name: name.trim(),
    kind,
    unit: kind === "number" ? unit.trim() : "",
    nameUzLatn: tr.uz.trim(),
    nameUzCyrl: tr.uzc.trim(),
    nameRu: tr.ru.trim(),
    values: hasValues(kind)
      ? values.filter((v) => v.value.trim()).map((v) => ({
        value: v.value, colorHex: v.colorHex,
        valueUzLatn: v.uz, valueUzCyrl: v.uzc, valueRu: v.ru,
      }))
      : [],
  };
}

export function CreatePropertyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("select");
  const [unit, setUnit] = useState("");
  const [tr, setTr] = useState<Tr>(EMPTY_TR);
  const [values, setValues] = useState<ValRow[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => { setName(""); setKind("select"); setUnit(""); setTr(EMPTY_TR); setValues([]); };

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.createPropertyDefinition(buildInput(name, kind, unit, values, tr));
      reset();
      toast.success("Saqlandi");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="text-[13.5px] font-bold tracking-[-0.01em] text-ink-2">Yangi xususiyat qo'shish</div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Nomi (asosiy)" className="flex-[2_1_200px]" hint="Mahsulotlar shu nom bilan bog'lanadi">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Color, Size, Volume..." />
          </Field>
          <Field label="Turi" className="flex-[1_1_180px]">
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {kind === "number" && (
            <Field label="Birlik" className="flex-[1_1_120px]">
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="L, mm, kg..." />
            </Field>
          )}
        </div>
        <TranslationFields tr={tr} onChange={setTr} placeholder="Tarjima (ixtiyoriy)" />
        {hasValues(kind) && <ValueEditor kind={kind} values={values} onChange={setValues} />}
        <div className="flex justify-end">
          <Button disabled={busy || !name.trim()} onClick={save}>
            {busy ? <Spinner /> : <><Plus /> Qo'shish</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// One editable row for an existing definition: name, kind, unit, values, active + delete.
export function PropertyRow({ def }: { def: PropertyDefinition }) {
  const router = useRouter();
  const [name, setName] = useState(def.name);
  const [kind, setKind] = useState<Kind>(def.kind);
  const [unit, setUnit] = useState(def.unit ?? "");
  const [active, setActive] = useState(def.active);
  const [tr, setTr] = useState<Tr>({ uz: def.nameUzLatn ?? "", uzc: def.nameUzCyrl ?? "", ru: def.nameRu ?? "" });
  const [values, setValues] = useState<ValRow[]>((def.values ?? []).map((v) => ({
    value: v.value, colorHex: v.colorHex || DEFAULT_HEX,
    uz: v.valueUzLatn ?? "", uzc: v.valueUzCyrl ?? "", ru: v.valueRu ?? "",
  })));
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.updatePropertyDefinition(def.id, { ...buildInput(name, kind, unit, values, tr), active });
      toast.success("Saqlandi");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (busy || !confirm(`"${def.name}" xususiyatini o'chirasizmi?`)) return;
    setBusy(true);
    try {
      await api.deletePropertyDefinition(def.id);
      toast.success("O'chirildi");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  const kindLabel = KINDS.find((k) => k.value === kind)?.label ?? kind;

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => setExpanded((x) => !x)} className="flex-[2_1_160px] min-w-0 text-left">
          <div className="truncate text-[14px] font-semibold text-foreground">{def.name}</div>
          <div className="text-[11.5px] text-muted-foreground">
            {kindLabel}{unit ? ` · ${unit}` : ""}{hasValues(kind) ? ` · ${values.length} ta qiymat` : ""}
          </div>
        </button>
        <Button
          variant={active ? "soft" : "ghost"}
          size="sm"
          onClick={() => setActive((a) => !a)}
          title={active ? "Faol" : "Nofaol"}
        >
          {active ? <Check /> : <X />} {active ? "Faol" : "Nofaol"}
        </Button>
        <Button variant="soft" size="sm" onClick={() => setExpanded((x) => !x)}>{expanded ? "Yopish" : "Tahrirlash"}</Button>
      </div>
      {expanded && (
        <div className="flex flex-col gap-3 bg-secondary/30 px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Nomi (asosiy)" className="flex-[2_1_200px]" hint="Mahsulotlar shu nom bilan bog'lanadi"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Turi" className="flex-[1_1_180px]">
              <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {kind === "number" && (
              <Field label="Birlik" className="flex-[1_1_120px]"><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="L, mm, kg..." /></Field>
            )}
          </div>
          <TranslationFields tr={tr} onChange={setTr} placeholder="Tarjima (ixtiyoriy)" />
          {hasValues(kind) && <ValueEditor kind={kind} values={values} onChange={setValues} />}
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={del} disabled={busy} className="text-destructive"><Trash2 /> O'chirish</Button>
            <Button size="sm" disabled={busy || !name.trim()} onClick={save}>{busy ? <Spinner /> : <><Check /> Saqlash</>}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
