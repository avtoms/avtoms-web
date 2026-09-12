"use client";
// Picks a product's MXIK — the tax committee's 17-digit classifier code, which a fiscal receipt
// and an e-invoice line need for every item sold.
//
// One box takes all three ways a shop knows its goods: a name ("moy filtri"), a code copied off
// a supplier's invoice, or the barcode on the box — typed, read by a USB scanner (a keyboard
// that types digits and Enter), or read by the camera. The gateway works out which it was.
//
// Picking a hit fetches the code's record for its packages: the registry counts goods in the
// packages it declares for each code ("dona", "litr", "komplekt"), and a receipt line has to
// name one of those, not a unit of our own.
import React, { useEffect, useRef, useState } from "react";
import { ScanBarcode, Search, X } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Badge } from "@/components/ui-kit/badge";
import { Spinner } from "@/components/ui-kit/misc";
import { SearchSelect } from "@/components/ui-kit/search-select";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { useLang } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MxikDetails, MxikHit } from "@/lib/types";

export type MxikValue = { mxikCode: string; mxikName: string; packageCode: string; packageName: string };
export const emptyMxik: MxikValue = { mxikCode: "", mxikName: "", packageCode: "", packageName: "" };

const isMxikCode = (s: string) => /^\d{17}$/.test(s);

type Msg = { text: string; tone: "muted" | "warn" | "danger" };

export function MxikField({ value, onChange, focusSearch, hint }: {
  value: MxikValue;
  onChange: (v: MxikValue) => void;
  // Put the caret in the search box on mount — for a form opened from a scan the registry did
  // not recognise, where choosing the code by name is the next thing to do.
  focusSearch?: boolean;
  // A line under the search box saying why it wants attention, until a search says otherwise.
  hint?: string;
}) {
  const { t, lang } = useLang();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MxikHit[] | null>(null); // null: no result list open
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [scanning, setScanning] = useState(false);
  // The chosen code's registry record: its packages, and whether it is still active.
  const [details, setDetails] = useState<MxikDetails | null>(null);
  // "code|lang" of the record in `details`, so a re-render never refetches what is on screen.
  const loaded = useRef("");
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Only the latest request may land. A slow name search answering after a code was already
  // picked must not reopen a stale list over it.
  const seq = useRef(0);

  useEffect(() => {
    if (!focusSearch) return;
    // Deferred past the dialog's own autofocus, which runs in the same commit and would win.
    const id = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [focusSearch]);

  // A code saved on the product arrives without its record. Fetch it for the package list and
  // the "no longer active" warning. If the tax service is down the saved package stays the only
  // option and nothing else changes — the form must save without the registry.
  useEffect(() => {
    const code = value.mxikCode;
    if (!code) { loaded.current = ""; setDetails(null); return; }
    const key = `${code}|${lang}`;
    if (loaded.current === key) return;
    let alive = true;
    api.mxikDetails(code, lang)
      .then((d) => { if (alive) { loaded.current = key; setDetails(d); } })
      .catch(() => { /* see above */ });
    return () => { alive = false; };
  }, [value.mxikCode, lang]);

  useEffect(() => {
    if (!hits) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setHits(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [hits]);

  // Keep the keyboard's row in view as the arrows walk past the list's edge.
  useEffect(() => {
    (list.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = async (code: string) => {
    const my = ++seq.current;
    setBusy(true); setMsg(null); setHits(null);
    try {
      const d = await api.mxikDetails(code, lang);
      if (my !== seq.current) return;
      loaded.current = `${d.code}|${lang}`;
      setDetails(d);
      // The first package is the registry's primary one, and nearly always the only one.
      const pkg = d.packages[0];
      onChange({ mxikCode: d.code, mxikName: d.name, packageCode: pkg?.code ?? "", packageName: pkg?.name ?? "" });
      setQ("");
    } catch (e) {
      if (my !== seq.current) return;
      const text = e instanceof ApiError ? (e.status === 404 ? t("mxik_unknown_code") : e.message) : t("error");
      setMsg({ text, tone: "danger" });
    } finally {
      if (my === seq.current) setBusy(false);
    }
  };

  const run = async (raw: string) => {
    const term = raw.trim();
    if (!term) return;
    // A full code needs no list to choose from.
    if (isMxikCode(term)) { pick(term); return; }
    const my = ++seq.current;
    setBusy(true); setMsg(null); setHits(null);
    try {
      const r = await api.mxikLookup(term, lang);
      if (my !== seq.current) return;
      if (r.items.length) { setHits(r.items); setActive(0); }
      else if (r.kind === "gtin") setMsg({ text: t("mxik_gtin_miss"), tone: "warn" });
      else setMsg({ text: t("mxik_nothing"), tone: "muted" });
    } catch (e) {
      if (my !== seq.current) return;
      setMsg({ text: e instanceof ApiError ? e.message : t("error"), tone: "danger" });
    } finally {
      if (my === seq.current) setBusy(false);
    }
  };

  const clear = () => {
    seq.current++;
    loaded.current = "";
    setDetails(null); setMsg(null); setBusy(false);
    onChange(emptyMxik);
    setTimeout(() => input.current?.focus(), 0);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const rows = hits ?? [];
    if (e.key === "ArrowDown" && rows.length) { e.preventDefault(); setActive((i) => (i + 1) % rows.length); }
    else if (e.key === "ArrowUp" && rows.length) { e.preventDefault(); setActive((i) => (i <= 0 ? rows.length : i) - 1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      // An open list belongs to the text in the box — typing closes it — so Enter on an open
      // list means "this one", and Enter otherwise means "search". A USB scanner's trailing
      // Enter therefore always searches the code it has just typed.
      if (rows.length && active >= 0) pick(rows[active].code);
      else run(q);
    }
  };

  // Only trust the record when it is the chosen code's; a form reset to another product briefly
  // holds the previous one.
  const current = details && details.code === value.mxikCode ? details : null;

  if (value.mxikCode) {
    const pkgOptions = current?.packages.length
      ? current.packages.map((p) => ({ value: p.code, label: p.name }))
      : value.packageCode ? [{ value: value.packageCode, label: value.packageName || value.packageCode }] : [];
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2 rounded-[9px] border border-border bg-secondary/30 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[12.5px] font-semibold text-foreground">{value.mxikCode}</span>
              {current && !current.active && <Badge tone="warn" className="whitespace-normal">{t("mxik_inactive")}</Badge>}
            </div>
            <div className="text-[13px] text-foreground">{value.mxikName}</div>
            {current?.path && <div className="truncate text-[11.5px] text-muted-foreground">{current.path}</div>}
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("clear")} onClick={clear}><X /></Button>
        </div>
        {pkgOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-muted-foreground">{t("mxik_package")}</span>
            <SearchSelect
              value={value.packageCode}
              options={pkgOptions}
              allowClear={false}
              searchPlaceholder={t("search") + "…"}
              onChange={(code) => onChange({ ...value, packageCode: code, packageName: pkgOptions.find((o) => o.value === code)?.label ?? "" })}
            />
          </div>
        )}
      </div>
    );
  }

  const note = msg ?? (hint ? { text: hint, tone: "warn" as const } : null);

  return (
    <div ref={box} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Input
            ref={input}
            value={q}
            autoComplete="off"
            placeholder={t("mxik_ph")}
            className="pr-10"
            onChange={(e) => { setQ(e.target.value); setHits(null); setMsg(null); }}
            onKeyDown={onKey}
          />
          <button
            type="button"
            aria-label={t("search")}
            disabled={busy}
            onClick={() => run(q)}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 appearance-none place-items-center rounded-[7px] border-0 bg-transparent text-muted-foreground hover:bg-secondary touch:size-10"
          >
            {busy ? <Spinner /> : <Search className="size-4" />}
          </button>
          {hits && hits.length > 0 && (
            <div className="absolute left-0 top-[calc(100%+4px)] z-[60] w-full overflow-hidden rounded-[11px] border border-border bg-card p-1 shadow-[var(--shadow-lg)]">
              <div
                ref={list}
                className="max-h-[260px] overflow-y-auto overscroll-contain"
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                {hits.map((h, i) => (
                  <button
                    key={h.code + ":" + i}
                    type="button"
                    // mousedown, not click: the input blurs first on click, and the row must
                    // not be torn away before it can be pressed.
                    onMouseDown={(e) => { e.preventDefault(); pick(h.code); }}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      "flex w-full appearance-none flex-col items-start gap-0.5 rounded-[8px] border-0 bg-transparent px-2.5 py-2 text-left",
                      i === active && "bg-secondary",
                    )}
                  >
                    <span className="flex w-full min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-mono text-[12px] font-semibold text-primary-emphasis">{h.code}</span>
                      {h.brand && <span className="truncate text-[11.5px] text-muted-foreground">{h.brand}</span>}
                    </span>
                    <span className="w-full text-[13px] text-foreground">{h.name}</span>
                    {h.path && <span className="w-full truncate text-[11.5px] text-muted-foreground">{h.path}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button type="button" variant="soft" size="icon" className="size-10 touch:size-11" aria-label={t("scan_camera")} onClick={() => setScanning(true)}>
          <ScanBarcode />
        </Button>
      </div>
      {note && (
        <span className={cn("text-[12px]", note.tone === "danger" ? "text-destructive" : note.tone === "warn" ? "text-warning" : "text-muted-foreground")}>
          {note.text}
        </span>
      )}
      <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onDetected={(code) => { setQ(code); run(code); }} />
    </div>
  );
}
