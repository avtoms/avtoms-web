"use client";
// Client island for the super-admin car-make catalog: create new makes and edit existing
// ones (name, country, brand logo). The logo is uploaded to object storage and shown across
// the app (CarImage) as the brand emblem, falling back to a monogram when none is set.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, TextInput, Btn, Spinner } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { invalidateCarMakeLogos } from "@/lib/car-makes";
import type { CarMake } from "@/lib/types";

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

// One editable row: shows the logo (or monogram fallback), lets the admin upload/replace the
// logo and edit name/country inline.
export function MakeRow({ make, last }: { make: CarMake; last: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(make.name);
  const [country, setCountry] = useState(make.country ?? "");
  const [logoUrl, setLogoUrl] = useState(make.logoUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = name.trim() !== make.name || (country.trim() !== (make.country ?? "")) || logoUrl !== (make.logoUrl ?? "");

  const pickLogo = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await api.uploadImage(file);
      setLogoUrl(url);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Xatolik", { icon: "alert", tone: "danger" });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.updateCarMake(make.id, name.trim(), country.trim(), logoUrl);
      invalidateCarMakeLogos();
      toast("Saqlandi", { icon: "check" });
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Xatolik", { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const mono = name.trim().slice(0, 2).toUpperCase();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <button type="button" onClick={() => fileRef.current?.click()} title="Logotip yuklash"
        style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, border: "1px dashed var(--line)", cursor: "pointer", padding: 0, overflow: "hidden", background: logoUrl ? "var(--surface-2)" : "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {uploading ? <Spinner size={16} />
          : logoUrl ? <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 5 }} />
          : <span style={{ fontWeight: 800, fontSize: 15, color: "var(--accent-2)" }}>{mono}</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => pickLogo(e.target.files?.[0])} />
      <div style={{ flex: "2 1 160px", minWidth: 0 }}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Marka" />
      </div>
      <div style={{ flex: "1 1 120px", minWidth: 0 }} className="an-hide-sm">
        <TextInput value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Davlat" />
      </div>
      <Btn variant={dirty ? "primary" : "soft"} size="sm" icon="check" disabled={!dirty || busy} onClick={save}>
        {busy ? <Spinner size={14} /> : "Saqlash"}
      </Btn>
    </div>
  );
}
