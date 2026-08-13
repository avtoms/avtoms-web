"use client";
// Who a party is on paper, and where money reaches them — the requisites block a shop copies
// off a contract.
//
// One component for both sides of a transfer. A payment order names two parties of exactly the
// same kind: the shop paying and the MCHJ being paid hold the same nine facts about each
// other, and a shop that learns the block on a supplier's card already knows it in Settings.
//
// Everything here is optional, and the form says so by not marking anything required. A shop
// that buys cash-in-hand from the bazaar fills in none of it and loses nothing. What the form
// does insist on is that a field which IS filled in is filled in correctly: a bank account
// with nineteen digits is not a partial answer, it is a payment that will bounce — so the
// digit counts are shown as you type rather than discovered by the server saying no.
import React from "react";
import { Landmark } from "lucide-react";
import { Field } from "@/components/ui-kit/label";
import { Input } from "@/components/ui-kit/input";
import { useLang } from "@/components/providers";
import { cn } from "@/lib/utils";
import type { CompanyDetails, EntityType } from "@/lib/types";

// The legal forms a counterparty takes here. Order runs from the simplest to the most
// formal, which is also roughly how often a car shop meets them.
const ENTITY_TYPES: { value: EntityType; labelKey: string }[] = [
  { value: "CONTRAGENT_ENTITY_TYPE_INDIVIDUAL", labelKey: "entity_individual" },
  { value: "CONTRAGENT_ENTITY_TYPE_SOLE_TRADER", labelKey: "entity_sole_trader" },
  { value: "CONTRAGENT_ENTITY_TYPE_LLC", labelKey: "entity_llc" },
  { value: "CONTRAGENT_ENTITY_TYPE_JSC", labelKey: "entity_jsc" },
];

// A registered entity — one that has a STIR and a bank account worth asking for. A private
// person may still be paid by transfer, so this decides emphasis, never what is allowed.
export function isCompany(c?: CompanyDetails): boolean {
  return c?.entityType === "CONTRAGENT_ENTITY_TYPE_SOLE_TRADER"
    || c?.entityType === "CONTRAGENT_ENTITY_TYPE_LLC"
    || c?.entityType === "CONTRAGENT_ENTITY_TYPE_JSC";
}

// The exact widths the state registry issues. Checked here so a typo is caught where it is
// typed; the server enforces the same rule, because a browser is not a validator.
const WIDTH = { tin: 9, vatCode: 12, bankMfo: 5, bankAccount: 20 } as const;

export function CompanyFields({ value, onChange, disabled, hideTin, tinNote }: {
  value: CompanyDetails;
  onChange: (c: CompanyDetails) => void;
  disabled?: boolean;
  // The shop's own STIR is edited on the profile card above, and both write the same column.
  // Two inputs over one value means whichever was typed second wins and the other person's
  // edit vanishes, so this block borrows it as a line of text instead of offering it again.
  hideTin?: boolean;
  tinNote?: string;
}) {
  const { t } = useLang();
  const set = (patch: Partial<CompanyDetails>) => onChange({ ...value, ...patch });
  // Digits only, and never longer than the field can be: a 21st digit typed into an account
  // number is always a mistake, and dropping it beats accepting it and refusing the save.
  const digits = (key: keyof typeof WIDTH) => (raw: string) =>
    set({ [key]: raw.replace(/\D/g, "").slice(0, WIDTH[key]) });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-[12.5px] font-semibold text-foreground">{t("entity_type")}</span>
        <div className="grid grid-cols-2 gap-1 min-[420px]:grid-cols-4">
          {ENTITY_TYPES.map((e) => {
            const on = value.entityType === e.value;
            return (
              <button key={e.value} type="button" disabled={disabled}
                // Tapping the chosen one again clears it: a supplier entered as an MCHJ by
                // mistake has to be able to stop being one, and there is no "none" chip to
                // press without making the row of four into a row of five.
                onClick={() => set({ entityType: on ? "CONTRAGENT_ENTITY_TYPE_UNSPECIFIED" : e.value })}
                className={cn(
                  "inline-flex min-h-10 items-center justify-center rounded-[9px] border px-2 text-[12.5px] font-semibold transition-colors sm:min-h-9",
                  on ? "border-primary bg-primary-soft text-primary-emphasis"
                     : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}>
                {t(e.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {hideTin ? (
        <div className="flex items-baseline justify-between gap-3 rounded-[9px] bg-secondary/50 px-3 py-2">
          <span className="text-[12.5px] font-semibold text-muted-foreground">{t("co_tin")}</span>
          <span className="truncate font-mono text-[13px] font-semibold text-foreground">{tinNote?.trim() || "—"}</span>
        </div>
      ) : null}
      <div className={cn("grid gap-2", hideTin ? "grid-cols-1" : "grid-cols-2")}>
        {!hideTin && (
          <Field label={t("co_tin")} hint={counter(value.tin, WIDTH.tin)}>
            <Input value={value.tin ?? ""} inputMode="numeric" className="font-mono" disabled={disabled}
              onChange={(e) => digits("tin")(e.target.value)} />
          </Field>
        )}
        <Field label={t("co_vat_code")} hint={counter(value.vatCode, WIDTH.vatCode)}>
          <Input value={value.vatCode ?? ""} inputMode="numeric" className="font-mono" disabled={disabled}
            onChange={(e) => digits("vatCode")(e.target.value)} />
        </Field>
      </div>

      <Field label={t("co_director")}>
        <Input value={value.director ?? ""} disabled={disabled} onChange={(e) => set({ director: e.target.value })} />
      </Field>
      <Field label={t("co_legal_address")}>
        <Input value={value.legalAddress ?? ""} disabled={disabled} onChange={(e) => set({ legalAddress: e.target.value })} />
      </Field>

      <Field label={t("co_bank_name")}>
        <Input value={value.bankName ?? ""} disabled={disabled} onChange={(e) => set({ bankName: e.target.value })} />
      </Field>
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <Field label={t("co_bank_mfo")} hint={counter(value.bankMfo, WIDTH.bankMfo)}>
          <Input value={value.bankMfo ?? ""} inputMode="numeric" className="font-mono" disabled={disabled}
            onChange={(e) => digits("bankMfo")(e.target.value)} />
        </Field>
        <Field label={t("co_bank_account")} hint={counter(value.bankAccount, WIDTH.bankAccount)}>
          <Input value={value.bankAccount ?? ""} inputMode="numeric" className="font-mono" disabled={disabled}
            onChange={(e) => digits("bankAccount")(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label={t("co_contract_no")}>
          <Input value={value.contractNo ?? ""} disabled={disabled} onChange={(e) => set({ contractNo: e.target.value })} />
        </Field>
        <Field label={t("co_contract_date")}>
          <Input type="date" value={value.contractDate ?? ""} className="font-mono" disabled={disabled}
            onChange={(e) => set({ contractDate: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

// How many digits are in, out of how many there should be — shown only once something has
// been typed, so an untouched form is not covered in "0/9".
function counter(value: string | undefined, width: number): string | undefined {
  const v = (value ?? "").trim();
  if (!v) return undefined;
  return `${v.length}/${width}`;
}

// CompanySummary is the block read back: the account a transfer to this party lands in, in
// the order it is copied into a payment order. Renders nothing at all when there is nothing
// to show, so a cash supplier's card stays as short as it always was.
export function CompanySummary({ company, className }: { company?: CompanyDetails; className?: string }) {
  const { t } = useLang();
  const rows: [string, string | undefined][] = [
    [t("co_tin"), company?.tin],
    [t("co_bank_account"), company?.bankAccount],
    [t("co_bank_name"), company?.bankName],
    [t("co_bank_mfo"), company?.bankMfo],
    [t("co_director"), company?.director],
    [t("co_contract_no"), contractLine(company)],
  ];
  const filled = rows.filter(([, v]) => (v ?? "").trim() !== "");
  if (filled.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-[12px] border border-border p-3.5", className)}>
      <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-foreground">
        <Landmark className="size-3.5 text-muted-foreground" />
        {t("co_pay_to")}
      </div>
      {filled.map(([label, v]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 text-[12.5px]">
          <span className="shrink-0 text-muted-foreground">{label}</span>
          <span className="truncate font-mono font-semibold text-foreground">{v}</span>
        </div>
      ))}
    </div>
  );
}

// "№12 · 03.02.2026", or whichever half was recorded.
function contractLine(c?: CompanyDetails): string | undefined {
  const no = (c?.contractNo ?? "").trim();
  const date = (c?.contractDate ?? "").trim();
  if (!no && !date) return undefined;
  const pretty = date ? date.split("-").reverse().join(".") : "";
  return [no && `№${no}`, pretty].filter(Boolean).join(" · ");
}
