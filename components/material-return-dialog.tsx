"use client";

// Asks the one question a cancellation cannot answer for itself: is the oil in the engine,
// or is it still sealed on the bench?
//
// Nobody but the person standing at the car knows, and the two answers move the warehouse in
// opposite directions. Cancelling an order used to write every material off, and voiding a
// sale used to put the whole basket back — so a job called off after the filter was fitted
// lost stock the shop still had, and a buyer who kept half of what they returned gained stock
// the shop did not. Both drifts are invisible until somebody counts the shelf.
//
// The amounts are fractional and prefilled with everything that left the warehouse, because
// that is the common answer: most cancellations happen before anything is opened, so staff
// should be able to confirm with one tap and correct only the exception.
//
// Two shapes over one implementation. The order screen cancels from a sticky action bar with
// nothing else open, so it gets the dialog. The sale screen is already inside a dialog and
// confirms in place, so it takes the hook and the panel and keeps its own footer — nesting a
// second overlay there would dim the receipt the cashier is checking against.

import { useEffect, useRef, useState } from "react";
import { qtyUnit } from "@/components/catalog-fields";
import { qty as fmt } from "@/lib/format";
import { PackageOpen, Undo2 } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui-kit/dialog";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { useLang } from "@/components/providers";
import { cn } from "@/lib/utils";
import type { LineItem, MaterialReturn } from "@/lib/types";

// One stock line that could come back: what it is and how much of it left the warehouse.
export type ReturnableMaterial = {
  lineId: string;
  description: string;
  drawn: number;  // the exact amount taken out, in the variant's own unit
  unit?: string;
};



// The materials an order actually drew from the warehouse — the only things that can come
// back if it is called off. Shared, because an order can be cancelled from the detail screen
// and by dragging its card on the board, and the two must ask about the same lines.
// An empty result means there is nothing to ask about.
export function returnableMaterials(wo: { lineItems?: LineItem[] }): ReturnableMaterial[] {
  return (wo.lineItems ?? []).flatMap((it) =>
    it.id && it.variantId && (it.consumedQty ?? 0) > 0
      ? [{ lineId: it.id, description: it.description, drawn: it.consumedQty as number, unit: it.unit }]
      : []);
}

export type MaterialReturnState = ReturnType<typeof useMaterialReturn>;

// The answer being composed. Held by whoever owns the confirm button, so both shapes below
// read the same values from the same place.
export function useMaterialReturn(materials: ReturnableMaterial[], open: boolean) {
  const [returned, setReturned] = useState(true);
  const [qty, setQty] = useState<Record<string, string>>({});

  // Seeded when the question is asked and only then, through a ref — so a caller that rebuilds
  // its list on every render cannot wipe what the staff member has typed halfway through, and
  // asking again still starts from the full amounts, because the last answer belonged to the
  // last order rather than this one.
  const latest = useRef(materials);
  latest.current = materials;
  useEffect(() => {
    if (!open) return;
    setReturned(true);
    setQty(Object.fromEntries(latest.current.map((m) => [m.lineId, fmt(m.drawn)])));
  }, [open]);

  const amount = (m: ReturnableMaterial) => {
    if (!returned) return 0;
    const typed = parseFloat(qty[m.lineId] ?? "");
    // Clamped here as well as on the server, so the number on screen is the number the
    // warehouse gets rather than a promise the server quietly trims.
    return Math.max(0, Math.min(Number.isFinite(typed) ? typed : 0, m.drawn));
  };

  return {
    returned,
    setReturned,
    qty,
    setQty,
    // Always a full answer, all-zeros included: the server tells "nobody was asked" from
    // "nothing came back", and this is the asking.
    values: (): MaterialReturn[] => materials.map((m) => ({ lineId: m.lineId, quantity: amount(m) })),
  };
}

export function MaterialReturnPanel({ materials, state }: {
  materials: ReturnableMaterial[];
  state: MaterialReturnState;
}) {
  const { t } = useLang();
  const { returned, setReturned, qty, setQty } = state;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-semibold text-foreground">{t("mat_question")}</div>
        <div className="grid grid-cols-2 gap-2">
          <Choice active={returned} onClick={() => setReturned(true)} icon={<Undo2 className="size-4" />} label={t("mat_returned")} hint={t("mat_returned_hint")} />
          <Choice active={!returned} onClick={() => setReturned(false)} icon={<PackageOpen className="size-4" />} label={t("mat_spent")} hint={t("mat_spent_hint")} />
        </div>
      </div>

      {returned && (
        <div className="flex flex-col gap-2.5 rounded-[12px] border border-border bg-secondary/40 p-3">
          {materials.map((m) => (
            <div key={m.lineId} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold text-foreground">{m.description}</div>
                {/* What left the warehouse, so an amount typed over it can be judged. */}
                <div className="font-mono text-[11.5px] text-muted-foreground">
                  {t("mat_drawn")}: {qtyUnit(t, m.drawn, m.unit)}
                </div>
              </div>
              <Input
                value={qty[m.lineId] ?? ""}
                inputMode="decimal"
                aria-label={m.description}
                onChange={(e) => setQty((p) => ({ ...p, [m.lineId]: e.target.value.replace(/[^\d.]/g, "") }))}
                className="h-10 w-[86px] shrink-0 text-center font-mono"
              />
            </div>
          ))}
          {/* Zero the lot without emptying every box by hand, then type back the one line that
              did come home — the quicker way round when most of a big order was used. */}
          <div className="flex gap-3 pt-1">
            <button
              className="appearance-none border-0 bg-transparent p-0 text-[12.5px] font-semibold text-primary-emphasis hover:underline"
              onClick={() => setQty(Object.fromEntries(materials.map((m) => [m.lineId, fmt(m.drawn)])))}
            >{t("mat_all")}</button>
            <button
              className="appearance-none border-0 bg-transparent p-0 text-[12.5px] font-semibold text-muted-foreground hover:underline"
              onClick={() => setQty(Object.fromEntries(materials.map((m) => [m.lineId, "0"])))}
            >{t("mat_none")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MaterialReturnDialog({
  open, title, warning, confirmLabel, materials, busy, onClose, onConfirm,
}: {
  open: boolean;
  title: string;
  // The screen's own "are you sure" line — this dialog replaces the plain confirm, so it has
  // to keep saying what the action does before it asks about the stock.
  warning?: string;
  confirmLabel: string;
  materials: ReturnableMaterial[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (returns: MaterialReturn[]) => void;
}) {
  const { t } = useLang();
  const state = useMaterialReturn(materials, open);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-4 py-1">
          {warning && <div className="text-[14px] leading-relaxed text-ink-2">{warning}</div>}
          <MaterialReturnPanel materials={materials} state={state} />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>{t("cancel")}</Button>
          <Button variant="destructive" disabled={busy} onClick={() => onConfirm(state.values())}>
            {busy ? <Spinner /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Choice({ active, onClick, icon, label, hint }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; hint: string;
}) {
  return (
    <button
      onClick={onClick}
      // appearance/border/bg spelled out: this app has no preflight reset on bare buttons,
      // so without them the browser draws its own grey 3-D chrome over the card.
      className={cn(
        "flex appearance-none flex-col items-start gap-1 rounded-[11px] border bg-card px-3 py-2.5 text-left",
        active ? "border-primary bg-primary-soft" : "border-border hover:bg-secondary/60",
      )}
    >
      <span className={cn("flex items-center gap-1.5 text-[13.5px] font-bold", active ? "text-primary-emphasis" : "text-foreground")}>
        {icon}{label}
      </span>
      <span className="text-[11.5px] leading-snug text-muted-foreground">{hint}</span>
    </button>
  );
}
