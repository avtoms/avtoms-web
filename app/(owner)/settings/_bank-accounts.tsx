"use client";
// The shop's own bank accounts — the side of a payment order the system never knew.
//
// A list rather than a field, for the same reason the supplier's is: a company keeps a so'm
// account and a currency account, often at different banks, and a payment has to say which of
// them it moved through or the shop's own statement cannot be held against the bank's.
//
// Exactly one account is primary, which is the one every payment form offers first. That rule
// is kept by the server — promoting one stands the previous down, closing or deleting the
// primary promotes what is left — so this screen only has to show which it is.
import React, { useCallback, useEffect, useState } from "react";
import { Landmark, Plus, Trash2, Pencil, Star } from "lucide-react";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { Spinner, Switch } from "@/components/ui-kit/misc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/components/ui-kit/dialog";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BankAccount } from "@/lib/types";
import { SecTitle } from "../_shared";

export function BankAccountsCard() {
  const { t } = useLang();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BankAccount | "new" | null>(null);

  // Closed accounts are shown here and nowhere else: this is where a shop looks to reopen one
  // or to understand why a payment form stopped offering it.
  const load = useCallback(() => {
    api.listBankAccounts(undefined, true)
      .then(setAccounts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); toast(t("save"), { icon: "check" }); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
  };

  const remove = (a: BankAccount) => {
    if (!confirm(t("acct_delete_confirm"))) return;
    void act(() => api.deleteBankAccount(a.id));
  };

  const makePrimary = (a: BankAccount) => void act(() => api.updateBankAccount(a.id, {
    label: a.label, bankName: a.bankName, bankMfo: a.bankMfo,
    accountNumber: a.accountNumber, isPrimary: true, active: true,
  }));

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <SecTitle>{t("acct_title")}</SecTitle>
        <Button size="sm" onClick={() => setEditing("new")}><Plus /> {t("acct_add")}</Button>
      </div>
      <div className="mb-3 text-[12px] text-muted-foreground">{t("acct_hint")}</div>

      {loading ? (
        <div className="flex justify-center py-6 text-muted-foreground"><Spinner className="size-5" /></div>
      ) : accounts.length === 0 ? (
        <div className="rounded-[9px] border border-dashed border-border py-6 text-center text-[13px] text-muted-foreground">
          {t("acct_none")}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {accounts.map((a) => (
            <div key={a.id} className={cn("flex items-center gap-3 rounded-[9px] border bg-card px-3 py-2.5",
              a.active === false ? "border-dashed border-border opacity-60" : "border-border")}>
              <Landmark className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-[13px] font-semibold">{a.accountNumber}</span>
                  {a.isPrimary && <Badge tone="ok">{t("acct_primary")}</Badge>}
                  {a.active === false && <Badge tone="danger">{t("acct_closed")}</Badge>}
                </div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {[a.label, a.bankName, a.bankMfo && `MFO ${a.bankMfo}`].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              {/* Promoting is one tap: it is the only edit a shop makes often, and burying it
                  in the dialog would mean opening a form to tick one box. */}
              {!a.isPrimary && a.active !== false && (
                <button aria-label={t("acct_make_primary")} title={t("acct_make_primary")}
                  onClick={() => makePrimary(a)}
                  className="grid size-9 shrink-0 place-items-center rounded-[8px] text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <Star className="size-4" />
                </button>
              )}
              <button aria-label={t("edit")} onClick={() => setEditing(a)}
                className="grid size-9 shrink-0 place-items-center rounded-[8px] text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Pencil className="size-4" />
              </button>
              <button aria-label={t("delete")} onClick={() => remove(a)}
                className="grid size-9 shrink-0 place-items-center rounded-[8px] text-muted-foreground hover:bg-secondary hover:text-destructive">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <AccountModal
        open={editing !== null}
        account={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </Card>
  );
}

// Create/edit one account. contragentId is absent here — these are the shop's own; the same
// dialog serves a counterparty's list on the contragents screen.
export function AccountModal({ open, account, contragentId, onClose, onSaved }: {
  open: boolean;
  account: BankAccount | null;
  contragentId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [bank, setBank] = useState("");
  const [mfo, setMfo] = useState("");
  const [number, setNumber] = useState("");
  const [primary, setPrimary] = useState(false);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(account?.label ?? "");
    setBank(account?.bankName ?? "");
    setMfo(account?.bankMfo ?? "");
    setNumber(account?.accountNumber ?? "");
    setPrimary(account?.isPrimary ?? false);
    setActive(account?.active ?? true);
  }, [open, account]);

  // Twenty digits or it is not an account number, and a payment order built from nineteen
  // bounces a week later with nothing to connect it back to this moment.
  const ready = number.trim().length === 20 && (!mfo || mfo.length === 5);

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const body = { label, bankName: bank, bankMfo: mfo, accountNumber: number, isPrimary: primary };
      if (account) await api.updateBankAccount(account.id, { ...body, active });
      else await api.createBankAccount({ ...body, contragentId });
      toast(t("save"), { icon: "check" });
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader><DialogTitle>{account ? t("edit") : t("acct_add")}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-3 py-1">
          <Field label={t("co_bank_account")} hint={number ? `${number.trim().length}/20` : undefined}>
            <Input value={number} inputMode="numeric" className="font-mono" autoFocus
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 20))} />
          </Field>
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <Field label={t("co_bank_name")}>
              <Input value={bank} onChange={(e) => setBank(e.target.value)} />
            </Field>
            <Field label={t("co_bank_mfo")} hint={mfo ? `${mfo.length}/5` : undefined}>
              <Input value={mfo} inputMode="numeric" className="font-mono"
                onChange={(e) => setMfo(e.target.value.replace(/\D/g, "").slice(0, 5))} />
            </Field>
          </div>
          <Field label={t("acct_label")}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-[9px] border border-border bg-card px-3 py-2.5">
            <span className="text-[13.5px] font-semibold text-foreground">{t("acct_primary")}</span>
            <Switch checked={primary} onCheckedChange={setPrimary} />
          </div>
          {account && (
            <div className="flex items-center justify-between gap-3 rounded-[9px] border border-border bg-card px-3 py-2.5">
              <span className="text-[13.5px] font-semibold text-foreground">{t("active")}</span>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={!ready || busy} onClick={save}>{busy ? <Spinner /> : t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
