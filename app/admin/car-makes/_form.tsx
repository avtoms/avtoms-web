"use client";
// Client island for the super-admin car-make catalog: create new makes and edit existing
// ones (name, country, brand logo). The logo is uploaded to object storage and shown across
// the app (CarImage) as the brand emblem, falling back to a monogram when none is set.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Check, ImagePlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui-kit/card";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Button } from "@/components/ui-kit/button";
import { Spinner } from "@/components/ui-kit/misc";
import { api, ApiError } from "@/lib/api";
import { invalidateCarMakeLogos } from "@/lib/car-makes";
import type { CarMake } from "@/lib/types";

export function CreateMakeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.createCarMake(name.trim(), country.trim());
      setName(""); setCountry("");
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
        <div className="text-[13.5px] font-bold tracking-[-0.01em] text-ink-2">Yangi marka qo'shish</div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Marka nomi" className="flex-[2_1_200px]">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chevrolet" onKeyDown={(e) => e.key === "Enter" && save()} />
          </Field>
          <Field label="Davlat" className="flex-[1_1_140px]">
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="USA" onKeyDown={(e) => e.key === "Enter" && save()} />
          </Field>
          <Button disabled={busy || !name.trim()} onClick={save}>
            {busy ? <Spinner /> : <><Plus /> Marka qo'shish</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// One editable row: shows the logo (or monogram fallback), lets the admin upload/replace the
// logo and edit name/country inline.
export function MakeRow({ make }: { make: CarMake }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(make.name);
  const [country, setCountry] = useState(make.country ?? "");
  const [logoUrl, setLogoUrl] = useState(make.logoUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = name.trim() !== make.name || country.trim() !== (make.country ?? "") || logoUrl !== (make.logoUrl ?? "");

  const pickLogo = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      setLogoUrl(await api.uploadImage(file));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Xatolik");
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
      toast.success("Saqlandi");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  const mono = name.trim().slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        title="Logotip yuklash"
        className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-[11px] border border-dashed border-input transition-colors hover:border-ring"
        style={{ background: logoUrl ? "var(--surface-2)" : "var(--accent-soft)" }}
      >
        {uploading ? <Spinner /> : logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-full object-contain p-1" />
        ) : (
          <span className="text-[15px] font-extrabold text-primary-emphasis">{mono || <ImagePlus className="size-4" />}</span>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
      <div className="flex-[2_1_160px] min-w-0">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marka" className="h-9" />
      </div>
      <div className="hidden flex-[1_1_120px] min-w-0 sm:block">
        <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Davlat" className="h-9" />
      </div>
      <Button variant={dirty ? "default" : "soft"} size="sm" disabled={!dirty || busy} onClick={save}>
        {busy ? <Spinner /> : <><Check /> Saqlash</>}
      </Button>
    </div>
  );
}
