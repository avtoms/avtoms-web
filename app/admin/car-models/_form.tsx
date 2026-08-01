"use client";
import { useState } from "react";
import { useLang } from "@/components/providers";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui-kit/card";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Button } from "@/components/ui-kit/button";
import { Spinner } from "@/components/ui-kit/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import { api, ApiError } from "@/lib/api";
import { BODY_TYPES } from "@/lib/enums";
import type { CarMake } from "@/lib/types";

// Client island: creates a model under a make, then refreshes the SSR page.
export function CreateModelForm({ makes }: { makes: CarMake[] }) {
  const { t } = useLang();
  const router = useRouter();
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
        <div className="text-[13.5px] font-bold tracking-[-0.01em] text-ink-2">{t("a_new_model")}</div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Marka" className="flex-[1_1_160px]">
            <Select value={makeId} onValueChange={setMakeId}>
              <SelectTrigger><SelectValue placeholder={t("a_pick_make_first")} /></SelectTrigger>
              <SelectContent>
                {makes.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("a_model_name")} className="flex-[2_1_180px]">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cobalt" onKeyDown={(e) => e.key === "Enter" && save()} />
          </Field>
          <Field label={t("a_body_type")} className="flex-[1_1_140px]">
            <Select value={bodyType} onValueChange={setBodyType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BODY_TYPES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Button disabled={busy || !makeId || !name.trim()} onClick={save}>
            {busy ? <Spinner /> : <><Plus /> {t("a_add_model")}</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
