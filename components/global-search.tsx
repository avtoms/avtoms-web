"use client";
// The header search: one box that finds an order by its number, a car by its plate, or a
// client by name or phone, and opens it. ⌘K / Ctrl+K puts the cursor in it from anywhere on
// the page, because the person at the counter reaching for it has a phone in the other hand.
//
// It lives in the owner layout's header, so it works on every page. The shop's orders are
// fetched each time the box is opened — they are what somebody is most often looking for, and
// once loaded they answer instantly as each letter is typed. Clients come from the server once
// two characters are typed, since a shop's client book is not something to download up front.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ClipboardList, User } from "lucide-react";
import { useLang } from "@/components/providers";
import { api } from "@/lib/api";
import { orderLabel, makeModel, money, num } from "@/lib/format";
import { woStateFromProto, STATE_LABEL } from "@/lib/enums";
import type { Customer, WorkOrder } from "@/lib/types";
import { cn } from "@/lib/utils";

const norm = (s: string) => s.toLowerCase().replace(/[\s\-·]+/g, "");

export function GlobalSearch({ shopId, canOrders, canCustomers, className }: {
  shopId: string; canOrders: boolean; canCustomers: boolean; className?: string;
}) {
  const { t } = useLang();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [clients, setClients] = useState<Customer[]>([]);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => { setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || !canOrders) return;
    let alive = true;
    api.listWorkOrders(shopId)
      .then((r) => { if (alive) setOrders(r); })
      .catch(() => { /* keep the last list; the search still finds clients */ });
    return () => { alive = false; };
  }, [open, shopId, canOrders]);

  useEffect(() => {
    const term = q.trim();
    if (!canCustomers || term.length < 2) { setClients([]); return; }
    let alive = true;
    const id = setTimeout(() => {
      api.listCustomers(shopId, term)
        .then((r) => { if (alive) setClients(r.slice(0, 5)); })
        .catch(() => { if (alive) setClients([]); });
    }, 250);
    return () => { alive = false; clearTimeout(id); };
  }, [q, shopId, canCustomers]);

  const hits = useMemo(() => {
    const n = norm(q);
    if (!n) return [];
    return orders
      .filter((w) => norm(`${orderLabel(w)} ${w.plate ?? ""} ${w.customerName ?? ""} ${w.make ?? ""} ${w.model ?? ""} ${w.customerPhone ?? ""}`).includes(n))
      .slice(0, 6);
  }, [q, orders]);

  const items = useMemo(() => [
    ...hits.map((w) => ({ key: "o" + w.id, href: `/work-orders/${w.id}` })),
    ...clients.map((c) => ({ key: "c" + c.id, href: `/customers/${c.id}` })),
  ], [hits, clients]);

  useEffect(() => { setCursor(0); }, [q]);

  const go = (href: string) => { setOpen(false); setQ(""); input.current?.blur(); router.push(href); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setOpen(false); input.current?.blur(); return; }
    if (!items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => (c + 1) % items.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => (c - 1 + items.length) % items.length); }
    if (e.key === "Enter") { e.preventDefault(); go(items[cursor]?.href ?? items[0].href); }
  };

  const showPanel = open && q.trim().length > 0;
  let idx = -1;

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={input}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        placeholder={t("search_ph")}
        aria-label={t("search")}
        className="h-10 w-full rounded-[10px] border border-input bg-card pl-9 pr-14 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-[3px] focus:ring-ring/20"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[6px] border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
      {showPanel && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-[12px] border border-border bg-card shadow-[var(--shadow-lg)]">
          {items.length === 0 && <div className="px-4 py-5 text-center text-[13px] text-muted-foreground">{t("search_none")}</div>}
          {hits.length > 0 && (
            <div className="p-1.5">
              <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("orders")}</div>
              {hits.map((w) => {
                idx += 1;
                const i = idx;
                return (
                  <button key={w.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(`/work-orders/${w.id}`)}
                    onMouseEnter={() => setCursor(i)}
                    className={cn("flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left", cursor === i && "bg-secondary")}>
                    <ClipboardList className="size-4 shrink-0 text-muted-foreground" />
                    <span className="w-14 shrink-0 font-mono text-[13px] font-bold text-foreground">{orderLabel(w)}</span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">
                      {[w.plate, makeModel(w)].filter(Boolean).join(" · ")}
                      {w.customerName && <span className="text-muted-foreground"> · {w.customerName}</span>}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">{t(STATE_LABEL[woStateFromProto(w.state)])}</span>
                    <span className="shrink-0 font-mono text-[12.5px] font-semibold text-ink-2">{money(num(w.total))}</span>
                  </button>
                );
              })}
            </div>
          )}
          {clients.length > 0 && (
            <div className="border-t border-border p-1.5">
              <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{t("nav_customers")}</div>
              {clients.map((c) => {
                idx += 1;
                const i = idx;
                return (
                  <button key={c.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(`/customers/${c.id}`)}
                    onMouseEnter={() => setCursor(i)}
                    className={cn("flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left", cursor === i && "bg-secondary")}>
                    <User className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">{c.name}</span>
                    <span className="shrink-0 font-mono text-[12.5px] text-muted-foreground">{c.phone}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
