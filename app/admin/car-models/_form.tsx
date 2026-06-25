"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, TextInput, SelectInput, Btn, Spinner } from "@/components/ui";
import { useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { BODY_TYPES } from "@/lib/enums";
import type { CarMake } from "@/lib/types";

// Client island: creates a model under a make, then refreshes the SSR page.
export function CreateModelForm({ makes }: { makes: CarMake[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [makeId, setMakeId] = useState(makes[0]?.id ?? "");
  const [name, setName] = useState("");
  const [bodyType, setBodyType] = useState<string>(BODY_TYPES[0]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!makeId || !name.trim() || busy) return;
    setBusy(true);
    try {
      await api.createCarModel(makeId, name.trim(), bodyType);
      setName("");
      toast("Saqlandi", { icon: "check" });
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Xatolik", { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-2)", marginBottom: 14, letterSpacing: "-0.01em" }}>Yangi model qo'shish</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <Field label="Marka" style={{ flex: "1 1 160px" }}>
          <SelectInput value={makeId} onChange={(e) => setMakeId(e.target.value)}>
            {makes.length === 0 && <option value="">— avval marka qo'shing —</option>}
            {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Model nomi" style={{ flex: "2 1 180px" }}><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Cobalt" /></Field>
        <Field label="Kuzov turi" style={{ flex: "1 1 140px" }}>
          <SelectInput value={bodyType} onChange={(e) => setBodyType(e.target.value)}>
            {BODY_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
          </SelectInput>
        </Field>
        <Btn variant="primary" icon="plus" disabled={busy || !makeId} onClick={save}>{busy ? <Spinner /> : "Model qo'shish"}</Btn>
      </div>
    </Card>
  );
}
