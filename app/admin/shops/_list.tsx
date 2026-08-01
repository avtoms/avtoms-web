"use client";
// The service registry, and the one form that brings a service into existence.
//
// Registration is a single modal on purpose. A company and its owner are useless apart — a
// shop nobody can sign in to is a row in a table, and an owner with no shop has nowhere to
// work — so asking for them in two steps only creates a state where one exists without the
// other. The server writes both in one transaction; this asks for both on one screen.

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Store, MapPin, Phone, Users, Wrench, Pencil, KeyRound } from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Field } from "@/components/ui-kit/label";
import { Spinner, Switch } from "@/components/ui-kit/misc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { SuggestInput } from "@/components/suggest-input";
import { useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import type { Shop } from "@/lib/types";

// What shops around here actually call themselves. Offered, never enforced: service_type is
// free text because the trade names its own specialities and they differ by region.
const SERVICE_TYPES = [
  "To'liq servis", "Moy almashtirish", "Kuzov ta'miri", "Avtoelektrik", "Shinamontaj",
  "Dvigatel ta'miri", "Konditsioner", "Avtoyuvish", "Diagnostika", "Tormoz tizimi",
];

const err = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Xatolik");

export function ShopsList({ initial }: { initial: Shop[] }) {
  const { toast } = useToast();
  const [list, setList] = useState<Shop[]>(initial);
  const [registering, setRegistering] = useState(false);
  const [editing, setEditing] = useState<Shop | null>(null);

  const load = useCallback(async () => {
    try { setList(await api.listShops()); }
    catch (e) { toast(err(e), { icon: "alert", tone: "danger" }); }
  }, [toast]);

  // The service types this operator has already used, ahead of the built-in list, so a
  // taxonomy the business actually settles on beats the one shipped here.
  const typeOptions = useMemo(
    () => [...list.flatMap((s) => (s.serviceType ? [s.serviceType] : [])), ...SERVICE_TYPES],
    [list],
  );

  const columns = useMemo<ColumnDef<Shop>[]>(() => [
    {
      id: "name",
      accessorFn: (s) => `${s.name} ${s.serviceType ?? ""} ${s.location ?? ""}`,
      header: ({ column }) => <SortHeader column={column}>Servis</SortHeader>,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-secondary text-muted-foreground"><Store className="size-4" /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[14px] font-semibold text-foreground">{s.name}</span>
                {!s.active && <Badge tone="danger">Nofaol</Badge>}
              </div>
              <div className="flex flex-wrap gap-x-3 text-[11.5px] text-muted-foreground">
                {s.serviceType && <span className="inline-flex items-center gap-1"><Wrench className="size-3" />{s.serviceType}</span>}
                {s.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{s.location}</span>}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: "phone",
      accessorFn: (s) => s.phone ?? "",
      header: ({ column }) => <SortHeader column={column}>Telefon</SortHeader>,
      cell: ({ row }) => row.original.phone
        ? <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px] text-muted-foreground"><Phone className="size-3.5" />{row.original.phone}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "staff",
      accessorFn: (s) => s.staffCount ?? 0,
      header: ({ column }) => <SortHeader column={column}>Ishchilar</SortHeader>,
      // Two numbers that answer different questions: what the shop said about itself, and how
      // many accounts actually exist. A shop of six that has registered one is still a shop
      // of six — it just has not onboarded anybody yet, which is worth seeing.
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Users className="size-3.5" />
          <span className="font-mono font-semibold text-foreground">{row.original.staffCount ?? 0}</span>
          <span className="font-mono">· {row.original.members ?? 0} akkaunt</span>
        </div>
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      header: () => <span className="sr-only">Tahrirlash</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setEditing(row.original)}><Pencil /> Tahrirlash</Button>
        </div>
      ),
    },
  ], []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-[-0.02em] text-foreground">Servislar</h1>
          <p className="text-[13px] text-muted-foreground">{list.length} ta ro&apos;yxatdan o&apos;tgan servis</p>
        </div>
        <Button onClick={() => setRegistering(true)}><Plus /> Servis ro&apos;yxatdan o&apos;tkazish</Button>
      </div>

      <DataTable
        columns={columns}
        data={list}
        searchPlaceholder="Qidirish"
        emptyText="Hali birorta servis ro'yxatdan o'tmagan"
        pageSize={12}
      />

      <RegisterDialog
        open={registering}
        typeOptions={typeOptions}
        onClose={() => setRegistering(false)}
        onDone={() => { setRegistering(false); void load(); }}
      />
      <EditDialog
        shop={editing}
        typeOptions={typeOptions}
        onClose={() => setEditing(null)}
        onDone={() => { setEditing(null); void load(); }}
      />
    </div>
  );
}

/* ── one modal, both halves ─────────────────────────────────────────────────────────── */

function RegisterDialog({ open, typeOptions, onClose, onDone }: {
  open: boolean; typeOptions: string[]; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: "", serviceType: "", staffCount: "", location: "", phone: "",
    ownerName: "", ownerPhone: "", ownerLogin: "", ownerPassword: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  useEffect(() => {
    if (open) setF({ name: "", serviceType: "", staffCount: "", location: "", phone: "", ownerName: "", ownerPhone: "", ownerLogin: "", ownerPassword: "" });
  }, [open]);

  // The server refuses each of these too. Checking here as well is not duplication for its
  // own sake: it is the difference between the operator being told which box is wrong and
  // being handed one sentence after the whole form round-trips.
  const loginOk = /^[a-z0-9._-]{3,40}$/.test(f.ownerLogin.trim().toLowerCase());
  const ready = f.name.trim() && f.ownerName.trim() && loginOk && f.ownerPassword.length >= 6;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const out = await api.registerShop({
        name: f.name.trim(),
        serviceType: f.serviceType.trim(),
        staffCount: parseInt(f.staffCount, 10) || 0,
        location: f.location.trim(),
        phone: f.phone.trim(),
        ownerName: f.ownerName.trim(),
        ownerPhone: f.ownerPhone.trim(),
        ownerLogin: f.ownerLogin.trim().toLowerCase(),
        ownerPassword: f.ownerPassword,
      });
      // The credential is shown back once. It cannot be read out of the system again, so if
      // the operator did not write it down this is the last chance to see it.
      toast(`${out.shop.name} ro'yxatdan o'tdi · login: ${out.owner.login}`, { icon: "check" });
      onDone();
    } catch (e) {
      toast(err(e), { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader><DialogTitle>Servis ro&apos;yxatdan o&apos;tkazish</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-5 py-1">
          <Section icon={<Store className="size-4" />} title="Kompaniya">
            <Field label="Servis nomi *"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Avto-Garaj" autoFocus /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Servis turi">
                <SuggestInput value={f.serviceType} options={typeOptions} onChange={(v) => set("serviceType", v)} placeholder="To'liq servis" />
              </Field>
              <Field label="Ishchilar soni">
                <Input value={f.staffCount} inputMode="numeric" onChange={(e) => set("staffCount", e.target.value.replace(/\D/g, ""))} placeholder="6" className="font-mono" />
              </Field>
            </div>
            <Field label="Lokatsiya" hint="Mijozning chekida shu manzil chiqadi">
              <Input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Toshkent, Chilonzor 12" />
            </Field>
            <Field label="Servis telefoni" hint="Egasining shaxsiy raqami emas — bu raqam chekda chiqadi">
              <Input value={f.phone} inputMode="tel" onChange={(e) => set("phone", e.target.value)} placeholder="+998 71 200 00 00" className="font-mono" />
            </Field>
          </Section>

          <Section icon={<KeyRound className="size-4" />} title="Egasi">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ism *"><Input value={f.ownerName} onChange={(e) => set("ownerName", e.target.value)} placeholder="Sardor" /></Field>
              <Field label="Telefon"><Input value={f.ownerPhone} inputMode="tel" onChange={(e) => set("ownerPhone", e.target.value)} placeholder="+998 90 123 45 67" className="font-mono" /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Login *" hint={f.ownerLogin && !loginOk ? "3-40 ta harf, raqam, nuqta, chiziqcha" : "Shu login bilan tizimga kiradi"}>
                {/* Lower-cased as it is typed, because that is how the server stores and
                    matches it — showing one thing and saving another is how somebody ends up
                    unable to sign in with the login they were handed. */}
                <Input value={f.ownerLogin} autoCapitalize="none" autoCorrect="off"
                  onChange={(e) => set("ownerLogin", e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                  placeholder="sardor" className="font-mono" />
              </Field>
              <Field label="Parol *" hint={f.ownerPassword && f.ownerPassword.length < 6 ? "Kamida 6 ta belgi" : "Kamida 6 ta belgi"}>
                {/* Deliberately not a password field. The operator is typing a credential FOR
                    somebody else and has to read it back to them; masking it here protects
                    nothing and guarantees typos. */}
                <Input value={f.ownerPassword} onChange={(e) => set("ownerPassword", e.target.value)} placeholder="parol123" className="font-mono" />
              </Field>
            </div>
          </Section>

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Parol saqlangandan keyin uni qayta ko&apos;rish mumkin emas — faqat yangisiga almashtiriladi.
            Shuning uchun egasiga hozir yetkazing.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>Bekor qilish</Button>
          <Button disabled={!ready || busy} onClick={submit}>{busy ? <Spinner /> : "Ro'yxatdan o'tkazish"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ shop, typeOptions, onClose, onDone }: {
  shop: Shop | null; typeOptions: string[]; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", serviceType: "", staffCount: "", location: "", phone: "", active: true });
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  useEffect(() => {
    if (!shop) return;
    setF({
      name: shop.name, serviceType: shop.serviceType ?? "", staffCount: String(shop.staffCount ?? ""),
      location: shop.location ?? "", phone: shop.phone ?? "", active: shop.active ?? true,
    });
  }, [shop]);
  if (!shop) return null;

  const save = async () => {
    if (!f.name.trim() || busy) return;
    setBusy(true);
    try {
      await api.updateShop(shop.id, {
        name: f.name.trim(), serviceType: f.serviceType.trim(),
        staffCount: parseInt(f.staffCount, 10) || 0,
        location: f.location.trim(), phone: f.phone.trim(), active: f.active,
      });
      toast("Saqlandi", { icon: "check" });
      onDone();
    } catch (e) {
      toast(err(e), { icon: "alert", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!shop} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader><DialogTitle>{shop.name}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 py-1">
          <Field label="Servis nomi *"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Servis turi">
              <SuggestInput value={f.serviceType} options={typeOptions} onChange={(v) => set("serviceType", v)} />
            </Field>
            <Field label="Ishchilar soni">
              <Input value={f.staffCount} inputMode="numeric" onChange={(e) => set("staffCount", e.target.value.replace(/\D/g, ""))} className="font-mono" />
            </Field>
          </div>
          <Field label="Lokatsiya"><Input value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
          <Field label="Servis telefoni"><Input value={f.phone} inputMode="tel" onChange={(e) => set("phone", e.target.value)} className="font-mono" /></Field>
          {/* Switching a service off stops it being usable without destroying anything it
              has recorded — the same reason contragents are retired rather than deleted. */}
          <div className="flex items-center justify-between rounded-[11px] border border-border px-3.5 py-2.5">
            <span className="text-[14px] font-semibold text-foreground">Faol</span>
            <Switch checked={f.active} onCheckedChange={(v: boolean) => set("active", v)} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>Bekor qilish</Button>
          <Button disabled={!f.name.trim() || busy} onClick={save}>{busy ? <Spinner /> : "Saqlash"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
        {icon}{title}
      </div>
      {children}
    </div>
  );
}
