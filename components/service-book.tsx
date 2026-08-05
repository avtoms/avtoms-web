"use client";
// The car's service book — "сервисная книжка". Every visit it made, newest first: how far it
// had gone, what was done to it, what that cost and who did it.
//
// This replaces a history list that showed a date, a count of line items and a total. That
// answered "when did they come and what did they pay"; it could not answer the question a
// service book exists for, which is "when was the oil last done, and how far has it gone
// since". The odometer is what makes the difference, so it is the loudest thing on the row.
//
// A visit with no reading shows a gap rather than a number. The shop can add the reading
// afterwards — right here, inline — because the honest moment to take one is when the car is
// in front of you, which is rarely when someone is filling in a form.
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Gauge, Wrench, Calendar, Check, Pencil, User } from "lucide-react";
import { Card } from "@/components/ui-kit/card";
import { Badge } from "@/components/ui-kit/badge";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { money, num, shortDate } from "@/lib/format";
import { STATE_LABEL, woStateFromProto } from "@/lib/enums";
import { cn } from "@/lib/utils";
import type { ServiceBook, ServiceBookEntry } from "@/lib/types";
import { qtyUnit } from "@/components/catalog-fields";

// Kilometres read better grouped: 82 000, not 82000. The narrow no-break space keeps the
// number from wrapping mid-figure on a phone.
const km = (v: string | number | undefined) => num(v).toLocaleString("ru-RU");

export function ServiceBookPanel({ vehicleId, onChanged }: { vehicleId: string; onChanged?: () => void }) {
  const { t } = useLang();
  const [book, setBook] = useState<ServiceBook | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try { setBook(await api.serviceBook(vehicleId)); }
    catch { setFailed(true); setBook(null); }
  }, [vehicleId]);

  useEffect(() => { setBook(null); void load(); }, [load]);

  if (failed) return <div className="py-8 text-center text-[13px] text-muted-foreground">{t("error")}</div>;
  if (!book) return <div className="flex justify-center py-8"><Spinner className="size-6" /></div>;

  const entries = book.entries ?? [];
  if (entries.length === 0) {
    return <div className="py-8 text-center text-[13px] text-muted-foreground">{t("sb_empty")}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The three facts an owner reads first: how far it has gone, how often it comes back,
          and what it has been worth. */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("sb_last_reading")} value={num(book.lastOdometer) > 0 ? `${km(book.lastOdometer)} km` : "—"} />
        <Stat label={t("sb_visits")} value={String(book.visits ?? entries.length)}
          hint={book.avgDaysBetween ? `~${book.avgDaysBetween} ${t("sb_days")}` : undefined} />
        <Stat label={t("sb_total_spent")} value={money(book.totalSpent ?? 0)}
          hint={num(book.avgKmBetween) > 0 ? `~${km(book.avgKmBetween)} km` : undefined} />
      </div>

      <div className="flex flex-col gap-2">
        {entries.map((e) => <Visit key={e.workOrderId} entry={e} onSaved={() => { void load(); onChanged?.(); }} />)}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] bg-secondary/50 px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{label}</span>
      <span className="font-mono text-[15px] font-extrabold text-foreground">{value}</span>
      {hint && <span className="font-mono text-[10.5px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function Visit({ entry, onSaved }: { entry: ServiceBookEntry; onSaved: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const odo = num(entry.odometer);
  const delta = num(entry.odometerDelta);
  const state = woStateFromProto(entry.state);
  const items = entry.items ?? [];

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.setOdometer(entry.workOrderId, parseInt(value, 10) || 0);
      setEditing(false);
      toast(t("save"), { icon: "check" });
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <Card className="gap-2.5 p-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-mono text-[13px] font-bold text-foreground">
          {entry.occurredAt ? shortDate(entry.occurredAt) : "—"}
        </span>
        {/* The visit's order opens from here. A service book that names the job without a way
            to reach it makes the reader search the board for it by date. */}
        <Link href={`/work-orders/${entry.workOrderId}`}
          className="font-mono text-[12px] font-semibold text-primary-emphasis hover:underline">
          Z-{String(num(entry.orderNo) || 0).padStart(4, "0")}
        </Link>
        {state !== "closed" && (
          <Badge tone={state === "canceled" ? "neutral" : "accent"}>{t(STATE_LABEL[state])}</Badge>
        )}
        <span className="ml-auto font-mono text-[14px] font-extrabold text-foreground">{money(entry.total ?? 0)}</span>
      </div>

      {/* The odometer line. This is the part that makes it a service book rather than a
          list of receipts, so it gets its own row and a way to fill in a missing reading. */}
      {editing ? (
        <div className="flex items-center gap-2">
          <Gauge className="size-4 shrink-0 text-muted-foreground" />
          <Input value={value} inputMode="numeric" autoFocus className="h-8 flex-1 font-mono text-[13px]"
            placeholder={t("sb_reading")}
            onChange={(ev) => setValue(ev.target.value.replace(/\D/g, ""))}
            onKeyDown={(ev) => { if (ev.key === "Enter") void save(); }} />
          <Button size="sm" disabled={busy} onClick={() => void save()}>{busy ? <Spinner /> : <Check />}</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("cancel")}</Button>
        </div>
      ) : (
        <button
          onClick={() => { setValue(odo > 0 ? String(odo) : ""); setEditing(true); }}
          className="group flex items-center gap-2 rounded-[8px] px-1 py-0.5 text-left hover:bg-secondary"
        >
          <Gauge className="size-4 shrink-0 text-muted-foreground" />
          {odo > 0 ? (
            <>
              <span className="font-mono text-[14px] font-bold text-foreground">{km(odo)} km</span>
              {delta > 0 && (
                <span className="font-mono text-[12px] font-semibold text-success">+{km(delta)} km</span>
              )}
              {!!entry.daysSincePrevious && (
                <span className="text-[11.5px] text-muted-foreground">
                  · {entry.daysSincePrevious} {t("sb_days")}
                </span>
              )}
            </>
          ) : (
            // Said plainly rather than shown as 0 km, which would read as a fact.
            <span className="text-[12.5px] text-muted-foreground">{t("sb_no_reading")}</span>
          )}
          <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}

      {/* What was actually done — the other half of the question. */}
      {items.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-baseline gap-2 text-[12.5px]">
              <Wrench className="size-3 shrink-0 translate-y-0.5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-foreground">{it.description}</span>
              {it.quantity !== 1 && (
                <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">×{qtyUnit(t, it.quantity, it.unit)}</span>
              )}
              <span className="shrink-0 font-mono text-muted-foreground">{money(it.total)}</span>
            </div>
          ))}
        </div>
      )}

      {(entry.mechanicName || entry.notes) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[11.5px] text-muted-foreground">
          {entry.mechanicName && (
            <span className="inline-flex items-center gap-1"><User className="size-3" />{entry.mechanicName}</span>
          )}
          {entry.notes && <span className="min-w-0 flex-1 truncate italic">{entry.notes}</span>}
        </div>
      )}
    </Card>
  );
}

// ServiceBookSummary is the one-line version for a vehicle row: the last reading and how many
// visits, so the book is worth opening before you open it.
export function ServiceBookSummary({ book }: { book: ServiceBook | null }) {
  const { t } = useLang();
  if (!book || !(book.visits ?? 0)) return null;
  const odo = num(book.lastOdometer);
  return (
    <span className={cn("inline-flex items-center gap-2 text-[11.5px] text-muted-foreground")}>
      {odo > 0 && <span className="inline-flex items-center gap-1 font-mono"><Gauge className="size-3" />{km(odo)} km</span>}
      <span className="inline-flex items-center gap-1"><Calendar className="size-3" />{book.visits} {t("sb_visits_n")}</span>
    </span>
  );
}
