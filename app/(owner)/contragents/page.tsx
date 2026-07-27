"use client";
// Contragents (suppliers / "yetkazib beruvchi"): the per-shop counterparties the
// warehouse buys products from. This screen lists them, and hosts a create/edit
// dialog. The list drives the supplier dropdown on the product form.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, Phone, MapPin, Tag } from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner, Switch } from "@/components/ui-kit/misc";
import { SearchSelect } from "@/components/ui-kit/search-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import type { Contragent, CatalogTerm } from "@/lib/types";

export default function ContragentsPage() {
  const { t } = useLang();
  const { toast } = useToast();
  const [list, setList] = useState<Contragent[]>([]);
  const [brands, setBrands] = useState<CatalogTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ mode: "new" | "edit"; item: Contragent | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listContragents(true)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [t, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.listCatalogTerms("brand").then(setBrands).catch(() => {}); }, []);

  const del = useCallback(async (c: Contragent) => {
    if (!confirm(t("delete_contragent_confirm"))) return;
    try { await api.deleteContragent(c.id); toast(t("save"), { icon: "check" }); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
  }, [t, toast, load]);

  const columns = useMemo<ColumnDef<Contragent>[]>(() => [
    {
      id: "name",
      accessorFn: (c) => `${c.name} ${c.phone ?? ""} ${c.address ?? ""}`,
      header: ({ column }) => <SortHeader column={column}>{t("contragent_name")}</SortHeader>,
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-semibold text-foreground">{c.name}</span>
              {!c.active && <Badge tone="danger">{t("inactive")}</Badge>}
            </div>
            <div className="flex flex-wrap gap-x-3 text-[11.5px] text-muted-foreground">
              {c.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{c.phone}</span>}
              {c.address && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{c.address}</span>}
            </div>
          </div>
        );
      },
    },
    {
      id: "brand",
      accessorFn: (c) => c.brand ?? "",
      header: ({ column }) => <SortHeader column={column}>{t("brand")}</SortHeader>,
      cell: ({ row }) => row.original.brand
        ? <Badge tone="neutral"><Tag className="mr-1 size-3" />{row.original.brand}</Badge>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "actions",
      enableHiding: false,
      header: () => <span className="sr-only">{t("edit")}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditing({ mode: "edit", item: row.original }); }}><Pencil /> {t("edit")}</Button>
          <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={t("delete")} onClick={(e) => { e.stopPropagation(); del(row.original); }}><Trash2 /></Button>
        </div>
      ),
    },
  ], [t, del]);

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h1 className="text-[18px] font-bold tracking-[-0.01em] text-foreground">{t("contragents_title")}</h1>
        <p className="text-[12.5px] text-muted-foreground">{t("contragents_hint")}</p>
      </div>
      {loading && list.length === 0 ? (
        <Card className="gap-2.5 p-5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="an-skel h-11 w-full rounded-[8px]" />)}</Card>
      ) : (
        <DataTable
          columns={columns}
          data={list}
          onRowClick={(c) => setEditing({ mode: "edit", item: c })}
          searchPlaceholder={t("search") + "…"}
          emptyText={t("no_contragents")}
          toolbar={<Button onClick={() => setEditing({ mode: "new", item: null })}><Plus /> {t("add_contragent")}</Button>}
          columnLabels={{ name: t("contragent_name"), brand: t("brand") }}
          pageSize={12}
        />
      )}
      <ContragentModal
        state={editing}
        brands={brands}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </div>
  );
}

// Create/edit dialog for one contragent.
function ContragentModal({
  state, brands, onClose, onSaved,
}: {
  state: { mode: "new" | "edit"; item: Contragent | null } | null;
  brands: CatalogTerm[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const open = !!state;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [brand, setBrand] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const c = state?.item;
    setName(c?.name ?? "");
    setPhone(c?.phone ?? "");
    setAddress(c?.address ?? "");
    setNotes(c?.notes ?? "");
    setBrand(c?.brand ?? "");
    setActive(c?.active ?? true);
  }, [open, state]);

  // Brand options: the catalog brands, plus a legacy free-typed value kept selectable.
  const brandOptions = useMemo(() => {
    const names = brands.map((b) => b.name);
    const legacy = brand && !names.includes(brand) ? [{ value: brand, label: brand }] : [];
    return [...legacy, ...brands.map((b) => ({ value: b.name, label: b.name }))];
  }, [brands, brand]);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (state?.mode === "edit" && state.item) {
        await api.updateContragent(state.item.id, { name: name.trim(), phone: phone.trim(), address: address.trim(), notes: notes.trim(), brand: brand.trim(), active });
      } else {
        await api.createContragent({ name: name.trim(), phone: phone.trim(), address: address.trim(), notes: notes.trim(), brand: brand.trim() });
      }
      toast(t("save"), { icon: "check" });
      onClose();
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{state?.mode === "edit" ? t("edit_contragent") : t("add_contragent")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          <Field label={t("contragent_name")}><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label={t("phone")}><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
          <Field label={t("address")}><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          <Field label={t("brand")} hint={t("contragent_brand_hint")}>
            <SearchSelect value={brand} options={brandOptions} placeholder={t("brand")} onChange={setBrand} />
          </Field>
          <Field label={t("notes")}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {state?.mode === "edit" && (
            <div className="flex items-center justify-between gap-3 rounded-[9px] border border-border bg-card px-3 py-2.5">
              <span className="text-[14px] font-semibold text-foreground">{t("active")}</span>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={busy || !name.trim()} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
