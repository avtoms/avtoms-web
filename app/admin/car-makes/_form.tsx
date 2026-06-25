"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, TextInput, Btn, Spinner } from "@/components/ui";
import { useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";

// Client island: creates a car make, then refreshes the SSR page to re-fetch the list.
export function CreateMakeForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.createCarMake(name.trim(), country.trim());
      setName(""); setCountry("");
      toast("Saqlandi", { icon: "check" });
      router.refresh(); // re-runs the server component → updated table
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Xatolik", { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-2)", marginBottom: 14, letterSpacing: "-0.01em" }}>Yangi marka qo'shish</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <Field label="Marka nomi" style={{ flex: "2 1 200px" }}><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Chevrolet" /></Field>
        <Field label="Davlat" style={{ flex: "1 1 140px" }}><TextInput value={country} onChange={(e) => setCountry(e.target.value)} placeholder="USA" /></Field>
        <Btn variant="primary" icon="plus" disabled={busy} onClick={save}>{busy ? <Spinner /> : "Marka qo'shish"}</Btn>
      </div>
    </Card>
  );
}
