"use client";
// Client island for the super-admin brand/category term lists: create new terms
// and rename/delete existing ones. These drive the consistent dropdowns on the
// product form so users pick from a shared list instead of free-typing.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Check, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui-kit/card";
import { Input } from "@/components/ui-kit/input";
import { Button } from "@/components/ui-kit/button";
import { Spinner } from "@/components/ui-kit/misc";
import { api, ApiError } from "@/lib/api";
import type { CatalogTerm } from "@/lib/types";

export function CreateTermForm({ type, label, placeholder }: { type: "brand" | "category"; label: string; placeholder: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.createCatalogTerm(type, name.trim());
      setName("");
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
        <div className="text-[13.5px] font-bold tracking-[-0.01em] text-ink-2">{label}</div>
        <div className="flex items-end gap-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} onKeyDown={(e) => e.key === "Enter" && save()} />
          <Button disabled={busy || !name.trim()} onClick={save}>
            {busy ? <Spinner /> : <><Plus /> Qo'shish</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function TermRow({ term }: { term: CatalogTerm }) {
  const router = useRouter();
  const [name, setName] = useState(term.name);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== term.name;

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.updateCatalogTerm(term.id, name.trim(), term.active);
      toast.success("Saqlandi");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (busy || !confirm(`"${term.name}" o'chirilsinmi?`)) return;
    setBusy(true);
    try {
      await api.deleteCatalogTerm(term.id);
      toast.success("O'chirildi");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 last:border-0">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
      <Button variant={dirty ? "default" : "soft"} size="sm" disabled={!dirty || busy} onClick={save}>
        {busy ? <Spinner /> : <Check />}
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={del} className="text-destructive"><Trash2 /></Button>
    </div>
  );
}
