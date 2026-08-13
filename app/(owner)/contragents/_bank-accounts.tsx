"use client";
// One counterparty's bank accounts — where money sent to them lands.
//
// The same list the shop keeps for itself, on the other side of the payment order. It appears
// once the counterparty exists, because an account has to belong to somebody: while they are
// being created the requisites block asks for one account, and that becomes the first entry
// here.
import React, { useCallback, useEffect, useState } from "react";
import { Landmark, Plus, Pencil, Trash2, Star } from "lucide-react";
import { Badge } from "@/components/ui-kit/badge";
import { Spinner } from "@/components/ui-kit/misc";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BankAccount } from "@/lib/types";
import { AccountModal } from "../settings/_bank-accounts";

export function ContragentAccounts({ contragentId }: { contragentId: string }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [editing, setEditing] = useState<BankAccount | "new" | null>(null);

  const load = useCallback(() => {
    api.listBankAccounts({ contragentId }, true)
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [contragentId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); toast(t("save"), { icon: "check" }); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" }); }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-foreground">{t("acct_title")}</span>
        <button type="button" onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1 rounded-[7px] px-1.5 py-1 text-[12px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Plus className="size-3.5" /> {t("acct_add")}
        </button>
      </div>

      {accounts === null && <div className="flex justify-center py-3"><Spinner className="size-4" /></div>}
      {accounts?.length === 0 && (
        <div className="rounded-[9px] border border-dashed border-border py-3 text-center text-[12px] text-muted-foreground">
          {t("acct_none")}
        </div>
      )}
      {accounts?.map((a) => (
        <div key={a.id} className={cn("flex items-center gap-2 rounded-[9px] border bg-card px-2.5 py-2",
          a.active === false ? "border-dashed border-border opacity-60" : "border-border")}>
          <Landmark className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-mono text-[12.5px] font-semibold">{a.accountNumber}</span>
              {a.isPrimary && <Badge tone="ok">{t("acct_primary")}</Badge>}
              {a.active === false && <Badge tone="danger">{t("acct_closed")}</Badge>}
            </div>
            {(a.label || a.bankName) && (
              <div className="truncate text-[11.5px] text-muted-foreground">{[a.label, a.bankName].filter(Boolean).join(" · ")}</div>
            )}
          </div>
          {!a.isPrimary && a.active !== false && (
            <button type="button" aria-label={t("acct_make_primary")} title={t("acct_make_primary")}
              onClick={() => void act(() => api.updateBankAccount(a.id, {
                label: a.label, bankName: a.bankName, bankMfo: a.bankMfo,
                accountNumber: a.accountNumber, isPrimary: true, active: true,
              }))}
              className="grid size-8 shrink-0 place-items-center rounded-[7px] text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Star className="size-3.5" />
            </button>
          )}
          <button type="button" aria-label={t("edit")} onClick={() => setEditing(a)}
            className="grid size-8 shrink-0 place-items-center rounded-[7px] text-muted-foreground hover:bg-secondary hover:text-foreground">
            <Pencil className="size-3.5" />
          </button>
          <button type="button" aria-label={t("delete")}
            onClick={() => { if (confirm(t("acct_delete_confirm"))) void act(() => api.deleteBankAccount(a.id)); }}
            className="grid size-8 shrink-0 place-items-center rounded-[7px] text-muted-foreground hover:bg-secondary hover:text-destructive">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}

      <AccountModal
        open={editing !== null}
        account={editing === "new" ? null : editing}
        contragentId={contragentId}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </div>
  );
}
