"use client";
// Contragents (suppliers / "yetkazib beruvchi"): the per-shop counterparties the warehouse
// buys products from. After the redesign the screen is a list on the left — each with what is
// owed either way — and the chosen one's account on the right: what was bought and paid, the
// last move, paying them, and the statement with the balance after every move. The table view
// the screen had before (turnover and debit/credit columns, sortable) is one tab away.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Phone, MapPin, Wallet, Landmark, ChevronDown, Search } from "lucide-react";
import { DataTable, SortHeader } from "@/components/admin/data-table";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner, Switch } from "@/components/ui-kit/misc";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui-kit/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
import { PageHeader } from "@/components/page-header";
import { useIsMobile } from "@/components/ui";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import type { Contragent, CatalogTerm, ContragentBalance, CompanyDetails } from "@/lib/types";
import { useAuth } from "@/components/providers";
import { money, num, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AccountPanel, ContragentAccount } from "./_account";
import { CompanyFields, isCompany } from "@/components/company-details";
import { ContragentAccounts } from "./_bank-accounts";

export default function ContragentsPage() {
  const { t } = useLang();
  const { toast } = useToast();
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const isMobile = useIsMobile();
  const [list, setList] = useState<Contragent[]>([]);
  // Balances are a separate, owner-only call; a shop whose gateway has not caught up yet
  // simply sees the list without the money rather than an error.
  const [balances, setBalances] = useState<Record<string, ContragentBalance>>({});
  const [totals, setTotals] = useState({ payable: 0, receivable: 0 });
  const [account, setAccount] = useState<Contragent | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"accounts" | "table">("accounts");
  const [q, setQ] = useState("");
  const [brands, setBrands] = useState<CatalogTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ mode: "new" | "edit"; item: Contragent | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.listContragents(true)); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
    finally { setLoading(false); }
  }, [t, toast]);

  const loadBalances = useCallback(async () => {
    try {
      const r = await api.contragentBalances(shopId);
      const m: Record<string, ContragentBalance> = {};
      for (const b of r.balances ?? []) m[b.contragentId] = b;
      setBalances(m);
      setTotals({ payable: num(r.totalPayable), receivable: num(r.totalReceivable) });
    } catch { /* the list is still useful without it */ }
  }, [shopId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadBalances(); }, [loadBalances]);

  // ?open=<id> opens one account straight away. The stock receipt form links here, so a debt
  // it just created can be settled without hunting for the supplier in the list. Read from
  // the URL directly rather than through useSearchParams, which would force this page behind
  // a Suspense boundary at build time for nothing.
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  useEffect(() => { setPendingOpen(new URLSearchParams(window.location.search).get("open")); }, []);
  useEffect(() => {
    if (!pendingOpen) return;
    const c = list.find((x) => x.id === pendingOpen);
    if (c) {
      if (isMobile) setAccount(c); else { setSelectedId(c.id); setView("accounts"); }
      setPendingOpen(null);
    }
  }, [pendingOpen, list, isMobile]);
  useEffect(() => { api.listCatalogTerms("brand").then(setBrands).catch(() => {}); }, []);

  // The list on the left: who is owed most first, then the rest by name.
  const ordered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return list
      .filter((c) => !n || `${c.name} ${c.phone ?? ""} ${c.brand ?? ""}`.toLowerCase().includes(n))
      .sort((a, b) => num(balances[b.id]?.balance) - num(balances[a.id]?.balance) || a.name.localeCompare(b.name));
  }, [list, balances, q]);
  const selected = list.find((c) => c.id === selectedId) ?? ordered[0] ?? null;

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
              {entityBadge(c) && <Badge tone="neutral">{t(entityBadge(c)!)}</Badge>}
              {!c.active && <Badge tone="danger">{t("inactive")}</Badge>}
            </div>
            <div className="flex flex-wrap gap-x-3 text-[11.5px] text-muted-foreground">
              {c.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{c.phone}</span>}
              {c.address && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{c.address}</span>}
              {/* The account, where there is one. It is the thing an owner looks up when they
                  are about to send money. */}
              {c.company?.bankAccount && (
                <span className="inline-flex items-center gap-1 font-mono"><Landmark className="size-3" />{c.company.bankAccount}</span>
              )}
            </div>
          </div>
        );
      },
    },
    // No brand column: a supplier sells many brands, and it showed whichever came first.
    // Turnover: what the shop has taken from them and handed over. Separate from the balance
    // because a supplier you buy 50m from and settle every week is a different relationship
    // from one you buy 2m from and owe 2m to, and a single balance column hides that.
    {
      id: "purchased",
      accessorFn: (c) => num(balances[c.id]?.purchased),
      header: ({ column }) => <SortHeader column={column}>{t("cg_purchased")}</SortHeader>,
      cell: ({ row }) => <Amount value={num(balances[row.original.id]?.purchased)} />,
    },
    {
      id: "paid",
      accessorFn: (c) => num(balances[c.id]?.paid),
      header: ({ column }) => <SortHeader column={column}>{t("cg_paid")}</SortHeader>,
      cell: ({ row }) => <Amount value={num(balances[row.original.id]?.paid)} />,
    },
    // Debit and credit are the one balance split into the two questions an owner actually
    // asks — who owes me, and who am I due to pay.
    {
      id: "debit",
      accessorFn: (c) => Math.max(0, -num(balances[c.id]?.balance)),
      header: ({ column }) => <SortHeader column={column}>{t("cg_they_owe")}</SortHeader>,
      cell: ({ row }) => <Amount value={Math.max(0, -num(balances[row.original.id]?.balance))} tone="success" />,
    },
    {
      id: "credit",
      accessorFn: (c) => Math.max(0, num(balances[c.id]?.balance)),
      header: ({ column }) => <SortHeader column={column}>{t("cg_we_owe")}</SortHeader>,
      cell: ({ row }) => <Amount value={Math.max(0, num(balances[row.original.id]?.balance))} tone="destructive" />,
    },
    {
      id: "lastMove",
      accessorFn: (c) => balances[c.id]?.lastAt ?? "",
      header: ({ column }) => <SortHeader column={column}>{t("cg_last_move")}</SortHeader>,
      cell: ({ row }) => {
        const at = balances[row.original.id]?.lastAt;
        return at
          ? <span className="font-mono text-[12px] text-muted-foreground">{shortDate(at)}</span>
          : <span className="text-[13px] text-muted-foreground">—</span>;
      },
    },
    {
      id: "actions",
      enableHiding: false,
      header: () => <span className="sr-only">{t("edit")}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setAccount(row.original); }}><Wallet /> {t("cg_account")}</Button>
          <Button variant="ghost" size="icon" aria-label={t("edit")} title={t("edit")} onClick={(e) => { e.stopPropagation(); setEditing({ mode: "edit", item: row.original }); }}><Pencil /></Button>
        </div>
      ),
    },
  ], [t, balances]);

  const listPane = (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search_name_phone")} className="pl-9" />
        </div>
      </div>
      {loading && list.length === 0 ? (
        <div className="flex flex-col gap-2 p-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="an-skel h-14 w-full rounded-[8px]" />)}</div>
      ) : ordered.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">{t("no_contragents")}</div>
      ) : ordered.map((c) => {
        const b = balances[c.id];
        const bal = num(b?.balance);
        const on = !isMobile && selected?.id === c.id;
        return (
          <button key={c.id} onClick={() => (isMobile ? setAccount(c) : setSelectedId(c.id))}
            className={cn("flex w-full items-start justify-between gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0",
              on ? "bg-primary-soft" : "hover:bg-secondary/60")}>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[14.5px] font-bold text-foreground">{c.name}</span>
                {!c.active && <Badge tone="danger">{t("inactive")}</Badge>}
              </div>
              <div className="line-clamp-2 text-[12.5px] text-muted-foreground">{[c.brand, c.phone].filter(Boolean).join(" · ") || "—"}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className={cn("font-mono text-[14px] font-bold", bal > 0 ? "text-destructive" : bal < 0 ? "text-success" : "text-success")}>
                {bal > 0 ? "−" : ""}{money(Math.abs(bal))}
              </span>
              <span className="text-[11.5px] text-muted-foreground">
                {bal > 0 ? t("cg_we_owe") : bal < 0 ? t("cg_they_owe") : b?.lastAt ? shortDate(b.lastAt) : t("cg_settled")}
              </span>
            </div>
          </button>
        );
      })}
    </Card>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        meta={<span>{list.length} {t("sup_count")} · {t("cg_we_owe")} {money(totals.payable)} · {t("cg_they_owe")} {money(totals.receivable)}</span>}
        actions={
          <>
            <Tabs value={view} onValueChange={(v) => setView(v as "accounts" | "table")}>
              <TabsList>
                <TabsTrigger value="accounts">{t("cg_account")}</TabsTrigger>
                <TabsTrigger value="table">{t("view_list")}</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button onClick={() => setEditing({ mode: "new", item: null })}><Plus /> {t("add_contragent")}</Button>
          </>
        }
      />
      <p className="-mt-1 px-1 text-[12.5px] text-muted-foreground">{t("contragents_hint")}</p>

      {view === "table" ? (
        loading && list.length === 0 ? (
          <Card className="gap-2.5 p-5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="an-skel h-11 w-full rounded-[8px]" />)}</Card>
        ) : (
          <DataTable
            columns={columns}
            data={list}
            onRowClick={(c) => setAccount(c)}
            searchPlaceholder={t("search") + "…"}
            emptyText={t("no_contragents")}
            columnLabels={{
              name: t("contragent_name"),
              purchased: t("cg_purchased"), paid: t("cg_paid"),
              debit: t("cg_they_owe"),
              credit: t("cg_we_owe"),
              lastMove: t("cg_last_move"),
            }}
            pageSize={12}
          />
        )
      ) : isMobile ? listPane : (
        <div className="grid items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          {listPane}
          <Card className="min-w-0 p-5">
            {selected
              ? <AccountPanel contragent={selected} onChanged={loadBalances} onEdit={() => setEditing({ mode: "edit", item: selected })} />
              : <div className="py-16 text-center text-[13.5px] text-muted-foreground">{t("sup_pick")}</div>}
          </Card>
        </div>
      )}

      <ContragentAccount
        contragent={account}
        onClose={() => setAccount(null)}
        onChanged={loadBalances}
        onEdit={account ? () => { const a = account; setAccount(null); setEditing({ mode: "edit", item: a }); } : undefined}
      />
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
  const [company, setCompany] = useState<CompanyDetails>({});
  const [busy, setBusy] = useState(false);
  // Open the requisites section for a counterparty that has any, so editing an MCHJ's bank
  // account does not begin by hunting for where it lives.
  const hasCompany = !!state?.item?.company && Object.values(state.item.company).some((v) =>
    typeof v === "string" && v.trim() !== "" && v !== "CONTRAGENT_ENTITY_TYPE_UNSPECIFIED");

  useEffect(() => {
    if (!open) return;
    const c = state?.item;
    setName(c?.name ?? "");
    setPhone(c?.phone ?? "");
    setAddress(c?.address ?? "");
    setNotes(c?.notes ?? "");
    setBrand(c?.brand ?? "");
    setActive(c?.active ?? true);
    setCompany(c?.company ?? {});
  }, [open, state]);

  // Brand options: the catalog brands, plus a legacy free-typed value kept selectable.
  const brandOptions = useMemo(() => {
    const names = brands.map((b) => b.name);
    const legacy = brand && !names.includes(brand) ? [{ value: brand, label: brand }] : [];
    return [...legacy, ...brands.map((b) => ({ value: b.name, label: b.name, icon: b.logoUrl || undefined }))];
  }, [brands, brand]);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (state?.mode === "edit" && state.item) {
        // The bank half is left out on an edit, because the list below owns it. The block was
        // filled from whichever account was primary when the dialog opened, so sending it back
        // would re-promote that one — quietly undoing a promotion made in the list a moment
        // ago, on the same screen, with no sign that anything had happened.
        await api.updateContragent(state.item.id, {
          name: name.trim(), phone: phone.trim(), address: address.trim(), notes: notes.trim(), brand: brand.trim(), active,
          company: { ...company, bankName: "", bankMfo: "", bankAccount: "" },
        });
      } else {
        await api.createContragent({ name: name.trim(), phone: phone.trim(), address: address.trim(), notes: notes.trim(), brand: brand.trim(), company });
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

          {/* Who they are in law, and the account a transfer to them goes to. Behind a
              disclosure rather than inline: most suppliers are a name and a phone number, and
              a shop adding one of those should not have to scroll past nine bank fields to
              reach Save. It opens by itself for a counterparty that already has requisites. */}
          <details className="group rounded-[11px] border border-border" open={hasCompany}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-semibold text-foreground">{t("cg_requisites")}</span>
                <span className="truncate text-[11.5px] text-muted-foreground">{t("cg_requisites_hint")}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="flex flex-col gap-3 border-t border-border p-3">
              {/* Bank details are asked for inline while the counterparty is being created —
                  one account, which is what a first form sensibly asks for. Once they exist,
                  the list below takes over: a supplier can hold several, and the one money is
                  sent to is chosen at payment time rather than assumed here. */}
              <CompanyFields value={company} onChange={setCompany} disabled={busy}
                hideBank={state?.mode === "edit"} />
              {state?.mode === "edit" && state.item && <ContragentAccounts contragentId={state.item.id} />}
            </div>
          </details>

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

// The legal form, as a chip beside the name. Only for registered entities: "MCHJ" says how
// this counterparty is paid and who signs for it, while "jismoniy shaxs" on a market trader
// is a label on the ordinary case and only adds noise to the row.
function entityBadge(c: Contragent): string | null {
  if (!isCompany(c.company)) return null;
  switch (c.company?.entityType) {
    case "CONTRAGENT_ENTITY_TYPE_SOLE_TRADER": return "entity_sole_trader";
    case "CONTRAGENT_ENTITY_TYPE_JSC": return "entity_jsc";
    default: return "entity_llc";
  }
}

// Amount renders a money cell where nothing is a dash rather than a zero. A column of "0"
// reads as data; a column of dashes reads as "nothing here", which is what it means.
function Amount({ value, tone }: { value: number; tone?: "success" | "destructive" }) {
  if (!value) return <span className="text-[13px] text-muted-foreground">—</span>;
  return (
    <span className={cn("font-mono text-[13.5px] font-bold",
      tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground")}>
      {money(value)}
    </span>
  );
}
