"use client";
// Client island for the super-admin brand/category term lists: create new terms
// and rename/delete existing ones. These drive the consistent dropdowns on the
// product form so users pick from a shared list instead of free-typing. Brands can
// also carry an optional logo (uploaded here) shown alongside the brand elsewhere.
import { useRef, useState } from "react";
import { useLang } from "@/components/providers";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Check, Trash2, ImagePlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui-kit/card";
import { Input } from "@/components/ui-kit/input";
import { Button } from "@/components/ui-kit/button";
import { Spinner } from "@/components/ui-kit/misc";
import { api, ApiError } from "@/lib/api";
import type { CatalogTerm } from "@/lib/types";

// LogoButton is a compact upload/preview square. It shows the current logo (or a
// monogram / placeholder), and on click opens a file picker that uploads the image
// and returns its URL through onChange.
function LogoButton({ value, monogram, onChange }: { value: string; monogram: string; onChange: (url: string) => void }) {
  const { t } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try { onChange(await api.uploadImage(file)); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : t("error")); }
    finally { setUploading(false); }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        title={t("a_upload_logo")}
        className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-dashed border-input transition-colors hover:border-ring"
        style={{ background: value ? "var(--surface-2)" : "var(--accent-soft)" }}
      >
        {uploading ? <Spinner /> : value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="size-full object-contain p-1" />
        ) : (
          <span className="text-[13px] font-extrabold text-primary-emphasis">{monogram || <ImagePlus className="size-4" />}</span>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </>
  );
}

// placeholder is literal (a list of brand names reads the same everywhere); placeholderKey
// is for an example that is words rather than names.
export function CreateTermForm({ type, labelKey, placeholder, placeholderKey }: { type: "brand" | "category"; labelKey: string; placeholder?: string; placeholderKey?: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const isBrand = type === "brand";

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.createCatalogTerm(type, name.trim(), logoUrl);
      setName("");
      setLogoUrl("");
      toast.success(t("saved"));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="text-[13.5px] font-bold tracking-[-0.01em] text-ink-2">{t(labelKey)}</div>
        <div className="flex items-end gap-3">
          {isBrand && <LogoButton value={logoUrl} monogram={name.trim().slice(0, 2).toUpperCase()} onChange={setLogoUrl} />}
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholderKey ? t(placeholderKey) : placeholder} onKeyDown={(e) => e.key === "Enter" && save()} />
          <Button disabled={busy || !name.trim()} onClick={save}>
            {busy ? <Spinner /> : <><Plus /> {t("add")}</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function TermRow({ term }: { term: CatalogTerm }) {
  const { t } = useLang();
  const router = useRouter();
  const [name, setName] = useState(term.name);
  const [logoUrl, setLogoUrl] = useState(term.logoUrl ?? "");
  const [busy, setBusy] = useState(false);
  const isBrand = term.type === "brand";
  const dirty = name.trim() !== term.name || logoUrl !== (term.logoUrl ?? "");

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.updateCatalogTerm(term.id, name.trim(), term.active, logoUrl);
      toast.success(t("saved"));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (busy || !confirm(`"${term.name}" ${t("a_delete_confirm")}`)) return;
    setBusy(true);
    try {
      await api.deleteCatalogTerm(term.id);
      toast.success(t("deleted"));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 last:border-0">
      {isBrand && <LogoButton value={logoUrl} monogram={name.trim().slice(0, 2).toUpperCase()} onChange={setLogoUrl} />}
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
      <Button variant={dirty ? "default" : "soft"} size="sm" disabled={!dirty || busy} onClick={save}>
        {busy ? <Spinner /> : <Check />}
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={del} className="text-destructive"><Trash2 /></Button>
    </div>
  );
}
