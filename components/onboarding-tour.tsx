"use client";
// OnboardingTour — the first-run walk-through.
//
// A new shop is shown the one loop the whole app is built around by doing it, on the real
// screens: stock a part in the warehouse, add a service that uses it to the price list, open an
// order for a car, fill it from the price list, and move it along the board.
//
// The tour never fills anything in behind the shop's back. Each step points at the real menu
// entry and the real "add" button; the real dialog then opens already filled with demo values
// (lib/tour-bridge), and the shop checks it and saves. lib/api announces what gets made, which
// is how the tour sees the save land and learns the ids. On the order screen it points at the
// real buttons and watches the order until the shop has pressed them.
//
// Everything it made is remembered per shop in local storage and, at the end, deleted outright
// (POST /v1/onboarding/purge-demo, then the car and the client) while the shop watches it go.
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Car, Check, ChevronDown, ChevronUp, ClipboardList, Package, PartyPopper, RotateCcw, Sparkles, Tag, Trash2, User, Wrench, X,
  type LucideIcon,
} from "lucide-react";
import { useAuth, useLang } from "@/components/providers";
import { useIsMobile } from "@/components/ui";
import { Button } from "@/components/ui-kit/button";
import { Spinner } from "@/components/ui-kit/misc";
import { api, ApiError } from "@/lib/api";
import { can } from "@/lib/perms";
import { num, orderLabel } from "@/lib/format";
import { woStateFromProto } from "@/lib/enums";
import { useShopFlow } from "@/lib/shop";
import { CREATED_EVENT, setTourPrefill, type CreatedKind } from "@/lib/tour-bridge";
import { cn } from "@/lib/utils";
import type { Customer, MenuItem, Product, Vehicle, WorkOrder } from "@/lib/types";

type Step = "welcome" | "part" | "part_look" | "service" | "service_look" | "order" | "lines" | "work" | "finish" | "clean";

// What the tour has made so far. The ids are what the clean-up deletes; the rest names the
// cards shown going. phone and plate are picked once per run, so a second run never trips over
// the first.
type Demo = {
  phone?: string; plateGuess?: string;
  productId?: string; variantId?: string; partName?: string; partQty?: number; partCost?: number; partPrice?: number;
  menuItemId?: string; serviceName?: string;
  customerId?: string; customerName?: string; vehicleId?: string; plate?: string; car?: string;
  workOrderId?: string; orderNo?: string;
};
type Tour = { step: Step; demo: Demo };

const START_EVENT = "an:tour-start";
/** startTour opens the walk-through, or brings a running one back into view. */
export function startTour() { window.dispatchEvent(new Event(START_EVENT)); }

const keyOf = (shop: string) => `an_tour:${shop}`;
const seenKeyOf = (shop: string) => `an_tour_seen:${shop}`;
function loadTour(shop: string): Tour | null {
  try { const s = localStorage.getItem(keyOf(shop)); return s ? (JSON.parse(s) as Tour) : null; } catch { return null; }
}
function saveTour(shop: string, t: Tour | null) {
  try { if (t) localStorage.setItem(keyOf(shop), JSON.stringify(t)); else localStorage.removeItem(keyOf(shop)); } catch { /* private mode */ }
}
function markSeen(shop: string) { try { localStorage.setItem(seenKeyOf(shop), "1"); } catch { /* private mode */ } }
function wasSeen(shop: string) { try { return localStorage.getItem(seenKeyOf(shop)) === "1"; } catch { return true; } }

const ITEMS: { key: string; steps: Step[]; icon: LucideIcon }[] = [
  { key: "tour_step_part", steps: ["part", "part_look"], icon: Package },
  { key: "tour_step_service", steps: ["service", "service_look"], icon: Tag },
  { key: "tour_step_order", steps: ["order"], icon: Car },
  { key: "tour_step_lines", steps: ["lines"], icon: ClipboardList },
  { key: "tour_step_work", steps: ["work"], icon: Wrench },
];
const DEMO_LITRES = 4;
const DEMO_CAR = { make: "Chevrolet", model: "Cobalt", year: 2021, km: 45000 };
const rnd = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");

export function OnboardingTour() {
  const { session } = useAuth();
  const { t } = useLang();
  const router = useRouter();
  const pathname = usePathname() || "";
  const shopId = session?.staff.shopId ?? "";
  const allowed = can(session, "settings.manage");

  const [tour, setTourState] = useState<Tour | null>(null);
  const [dockOpen, setDockOpen] = useState(true);
  const [exiting, setExiting] = useState(false);
  // Written to storage at once rather than when React next renders: a step is often followed
  // straight away by a page load, and a record made but not remembered would never be cleaned up.
  const tourRef = useRef<Tour | null>(null);
  const commit = useCallback((next: Tour | null) => {
    tourRef.current = next;
    if (shopId) saveTour(shopId, next);
    setTourState(next);
  }, [shopId]);
  const go = useCallback((step: Step, demo: Partial<Demo> = {}) => {
    commit({ step, demo: { ...(tourRef.current?.demo ?? {}), ...demo } });
  }, [commit]);
  // The welcome card is only an offer, so it is not remembered until the shop says yes.
  const offer = useCallback(() => {
    if (tourRef.current) return;
    const w: Tour = { step: "welcome", demo: {} };
    tourRef.current = w;
    setTourState(w);
  }, []);

  // Pick up where the shop left off; offer the tour once to a shop with nothing in it yet.
  useEffect(() => {
    if (!shopId || !allowed) return;
    const saved = loadTour(shopId);
    // A clean-up interrupted by a reload is offered again rather than silently re-run.
    if (saved) { commit(saved.step === "clean" ? { ...saved, step: "finish" } : saved); return; }
    if (wasSeen(shopId)) return;
    let alive = true;
    Promise.all([api.listWorkOrders(shopId), api.listMenuItems(shopId)])
      .then(([wos, menu]) => { if (alive && wos.length === 0 && menu.length === 0) offer(); })
      .catch(() => { /* no offer, then */ });
    return () => { alive = false; };
  }, [shopId, allowed, commit, offer]);

  useEffect(() => {
    const on = () => { if (allowed) { offer(); setDockOpen(true); } };
    window.addEventListener(START_EVENT, on);
    return () => window.removeEventListener(START_EVENT, on);
  }, [allowed, offer]);

  // What the real forms should start from while this step is asking for a record.
  const step = tour?.step;
  const demo = tour?.demo;
  useEffect(() => {
    if (step === "part") {
      setTourPrefill({ part: { name: t("tour_part_name"), unit: "L", qty: 8, cost: 60000, price: 90000 } });
    } else if (step === "service") {
      setTourPrefill({ service: {
        name: t("tour_service_name"), price: 150000, minutes: 30,
        // The part from the step before rides along: added to an order, the service brings its
        // four litres with it and they come off the shelf.
        material: demo?.variantId ? {
          name: demo.partName ?? "", qty: DEMO_LITRES, unit: "L",
          cost: demo.partCost ?? 0, price: demo.partPrice ?? 0, variantId: demo.variantId,
        } : undefined,
      } });
    } else if (step === "order") {
      setTourPrefill({ order: {
        name: t("tour_customer_name"), phone: demo?.phone ?? `90 ${rnd(3)} ${rnd(2)} ${rnd(2)}`,
        plate: demo?.plateGuess ?? `01 D ${100 + Math.floor(Math.random() * 900)} MO`,
        make: DEMO_CAR.make, model: DEMO_CAR.model, year: DEMO_CAR.year, km: DEMO_CAR.km,
      } });
    } else {
      setTourPrefill({});
    }
  }, [step, demo?.variantId, demo?.partName, demo?.partCost, demo?.partPrice, demo?.phone, demo?.plateGuess, t]);
  useEffect(() => () => setTourPrefill({}), []);

  // The records the shop makes on the real screens, caught as they land.
  useEffect(() => {
    const highlight = (id: string) => setTimeout(() => window.dispatchEvent(new CustomEvent("an:highlight", { detail: id })), 60);
    const on = (e: Event) => {
      const { kind, value } = (e as CustomEvent<{ kind: CreatedKind; value: unknown }>).detail;
      const cur = tourRef.current?.step;
      if (cur === "part" && kind === "product") {
        const p = value as Product;
        const take = (pp: Product) => {
          const v = pp.variants?.[0];
          go("part_look", {
            productId: pp.id, variantId: v?.id, partName: pp.name,
            partQty: num(v?.quantityOnHand), partCost: num(v?.unitCost), partPrice: num(v?.unitPrice),
          });
        };
        take(p);
        if (!p.variants?.[0]?.id) api.getProduct(p.id).then((pp) => { if (tourRef.current?.demo.productId === p.id) take(pp); }).catch(() => {});
        highlight(p.id);
      } else if (cur === "service" && kind === "menuItem") {
        const m = value as MenuItem;
        go("service_look", { menuItemId: m.id, serviceName: m.nameUzLatn || m.nameRu });
        highlight(m.id);
      } else if (cur === "order") {
        // A client and car are the tour's only when made here, from the new-client form. An
        // order opened for a car the shop already had leaves that car and client alone.
        if (kind === "customer") { const c = value as Customer; go("order", { customerId: c.id, customerName: c.name }); }
        if (kind === "vehicle") { const v = value as Vehicle; go("order", { vehicleId: v.id, plate: v.plate, car: [v.make, v.model].filter(Boolean).join(" ") }); }
        if (kind === "workOrder") { const w = value as WorkOrder; go("lines", { workOrderId: w.id, orderNo: orderLabel(w) }); }
      }
    };
    window.addEventListener(CREATED_EVENT, on);
    return () => window.removeEventListener(CREATED_EVENT, on);
  }, [go]);

  const end = () => { if (shopId) markSeen(shopId); commit(null); setExiting(false); };

  if (!tour || !allowed || !step || !demo) return null;
  const orderPath = demo.workOrderId ? `/work-orders/${demo.workOrderId}` : "";
  const onOrder = !!orderPath && pathname === orderPath;
  const cur = ITEMS.findIndex((i) => i.steps.includes(step));
  const doneCount = step === "finish" || step === "clean" ? ITEMS.length : Math.max(cur, 0);

  return (
    <>
      <style>{TOUR_CSS}</style>

      {step === "welcome" && (
        <Welcome
          onStart={() => {
            if (shopId) markSeen(shopId);
            commit({ step: "part", demo: { phone: `90 ${rnd(3)} ${rnd(2)} ${rnd(2)}`, plateGuess: `01 D ${100 + Math.floor(Math.random() * 900)} MO` } });
            setDockOpen(true);
          }}
          onLater={end}
        />
      )}

      {cur >= 0 && (
        <Dock
          open={dockOpen} setOpen={setDockOpen} cur={cur} doneCount={doneCount}
          exiting={exiting} setExiting={setExiting}
          onExit={() => { const any = demo.productId || demo.menuItemId || demo.workOrderId || demo.customerId; if (any) go("clean"); else end(); }}
        />
      )}

      {step === "part" && (
        pathname === "/inventory"
          ? <Spotlight n={1} selector={`[data-tour="inv-add"]`} title={t("add_part_cta")} body={t("tour_press_add_part")} />
          : <Spotlight n={1} selector={`[data-tour="nav-inventory"]`} title={t("nav_inventory")} body={`${t("tour_open_section")} ${t("tour_part_hint")}`} />
      )}
      {step === "part_look" && (
        <Spotlight selector={demo.productId ? `[data-row-id="${demo.productId}"]` : undefined} n={1}
          title={t("tour_part_look_title")} body={t("tour_part_look_body")}
          action={<Button size="sm" onClick={() => go("service")}>{t("tour_next")}</Button>} />
      )}
      {step === "service" && (
        pathname === "/menu"
          ? <Spotlight n={2} selector={`[data-tour="menu-add"]`} title={t("add_service")} body={t("tour_press_add_service")} />
          : <Spotlight n={2} selector={`[data-tour="nav-menu"]`} title={t("nav_services")} body={`${t("tour_open_section")} ${t("tour_service_hint")}`} />
      )}
      {step === "service_look" && (
        <Spotlight selector={demo.menuItemId ? `[data-row-id="${demo.menuItemId}"]` : undefined} n={2}
          title={t("tour_service_look_title")} body={t("tour_service_look_body")}
          action={<Button size="sm" onClick={() => go("order")}>{t("tour_next")}</Button>} />
      )}
      {step === "order" && (
        pathname === "/work-orders" || pathname === "/dashboard"
          ? <Spotlight n={3} selector={`[data-tour="new-wo"]`} title={t("new_wo")} body={t("tour_press_new_order")} />
          : <Spotlight n={3} selector={`[data-tour="nav-workorders"]`} title={t("nav_workorders")} body={`${t("tour_open_section")} ${t("tour_order_hint")}`} />
      )}
      {(step === "lines" || step === "work") && (
        <OrderSteps step={step} demo={demo} onOrder={onOrder} orderPath={orderPath} go={go} />
      )}

      {step === "finish" && <Finish demo={demo} onClean={() => go("clean")} />}

      {step === "clean" && (
        <Cleanup
          demo={demo}
          onClose={(target) => {
            end();
            const onDemo = (orderPath && pathname.startsWith(orderPath)) || (demo.customerId && pathname.includes(demo.customerId));
            // Straight round again: the welcome card comes back, and the new run makes its own
            // part, service, car and order from scratch.
            if (target === "replay") { if (onDemo) router.push("/dashboard"); offer(); setDockOpen(true); return; }
            if (target) router.push(target);
            else if (onDemo) router.push("/dashboard");
            else if (pathname === "/menu" || pathname === "/inventory") window.location.assign(pathname);
          }}
          onKeep={end}
        />
      )}
    </>
  );
}

// ── the order steps: point at the real buttons, and watch the order to see them pressed ──
function OrderSteps({ step, demo, onOrder, orderPath, go }: {
  step: "lines" | "work"; demo: Demo; onOrder: boolean; orderPath: string; go: (s: Step, d?: Partial<Demo>) => void;
}) {
  const { t } = useLang();
  const router = useRouter();
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const woId = demo.workOrderId;
  useEffect(() => {
    if (!woId) return;
    let alive = true;
    const tick = () => api.getWorkOrder(woId).then((w) => { if (alive) setWo(w); }).catch(() => {});
    void tick();
    const h = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(h); };
  }, [woId]);

  // A shop that has switched "ready" off finishes the job by starting it.
  const { transitions } = useShopFlow();
  const readyOn = (transitions.in_progress ?? []).includes("ready");
  const lines = wo?.lineItems ?? [];
  const hasService = !!demo.menuItemId && lines.some((li) => li.menuItemId === demo.menuItemId);
  const hasPart = !demo.variantId || lines.some((li) => li.variantId === demo.variantId);
  const state = wo ? woStateFromProto(wo.state) : null;
  useEffect(() => {
    if (!wo || wo.id !== woId) return;
    if (step === "lines" && hasService && hasPart) go("work");
    if (step === "work" && (state === "ready" || state === "invoiced" || state === "closed" || (!readyOn && state === "in_progress"))) go("finish");
  }, [wo, woId, step, hasService, hasPart, state, readyOn, go]);

  if (!onOrder) {
    return (
      <Spotlight n={step === "lines" ? 4 : 5}
        title={t(step === "lines" ? "tour_step_lines" : "tour_step_work")}
        body={t(step === "lines" ? "tour_lines_service" : "tour_work_start")}
        action={<Button size="sm" onClick={() => router.push(orderPath)}>{t("tour_back_to_order")}</Button>} />
    );
  }
  if (step === "lines") {
    return (
      <Spotlight n={4}
        selector={!hasService ? `[data-tour="wo-add-menu"]` : `[data-tour="wo-add-item"]`}
        title={!hasService ? t("wo_from_price") : t("add_item")}
        body={!hasService ? t("tour_lines_service") : t("tour_lines_part")}
        skip={() => go("work")} />
    );
  }
  return (
    <Spotlight n={5} selector={`[data-tour="wo-advance"]`}
      title={t("tour_step_work")}
      body={state === "in_progress" ? t("tour_work_ready") : t("tour_work_start")}
      note={t("tour_no_pay")}
      skip={() => go("finish")} />
  );
}

// ── the welcome card ──
function Welcome({ onStart, onLater }: { onStart: () => void; onLater: () => void }) {
  const { t } = useLang();
  const points: [LucideIcon, string][] = [[Package, "tour_step_part"], [Tag, "tour_step_service"], [ClipboardList, "tour_step_order"]];
  return (
    <div className="an-anim fixed inset-0 z-[150] grid place-items-center bg-black/45 p-4 backdrop-blur-[3px]" style={{ animation: "an-fade .25s ease-out" }}>
      <div role="dialog" aria-modal className="an-anim w-full max-w-[460px] overflow-hidden rounded-[22px] border border-border bg-card shadow-[var(--shadow-lg)]" style={{ animation: "an-pop .4s cubic-bezier(.2,.9,.3,1.15)" }}>
        <div className="relative grid h-[150px] place-items-center overflow-hidden" style={{ background: HERO }}>
          <div className="flex items-end gap-4">
            {points.map(([Icon], i) => (
              <div key={i} className="an-anim grid size-16 place-items-center rounded-[18px] bg-white/18 text-white shadow-[0_8px_24px_rgba(0,0,0,.18)] ring-1 ring-white/30 backdrop-blur-sm"
                style={{ animation: `an-float 3.2s ease-in-out ${i * 0.35}s infinite`, transform: i === 1 ? "translateY(-10px)" : undefined }}>
                <Icon className="size-7" strokeWidth={2} />
              </div>
            ))}
          </div>
          <Sparkles className="an-anim absolute left-8 top-6 size-5 text-white/70" style={{ animation: "an-twinkle 2.4s ease-in-out infinite" }} />
          <Sparkles className="an-anim absolute bottom-7 right-10 size-4 text-white/60" style={{ animation: "an-twinkle 2.4s ease-in-out .9s infinite" }} />
        </div>
        <div className="p-6">
          <h2 className="text-[21px] font-bold tracking-[-0.02em] text-foreground">{t("tour_welcome_title")}</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{t("tour_welcome_body")}</p>
          <ol className="mt-4 flex flex-col gap-2">
            {points.map(([Icon, key], i) => (
              <li key={key} className="flex items-center gap-3 text-[14px] font-semibold text-foreground">
                <span className="grid size-7 place-items-center rounded-full bg-primary-soft text-[12px] font-bold text-primary-emphasis">{i + 1}</span>
                <Icon className="size-4 text-muted-foreground" /> {t(key)}
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-start gap-2.5 rounded-[12px] bg-secondary/70 px-3.5 py-2.5 text-[13px] text-ink-2">
            <Trash2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {t("tour_welcome_clean")}
          </div>
          <div className="mt-5 flex gap-2.5">
            <Button size="lg" className="flex-1" onClick={onStart}><Sparkles /> {t("tour_go")}</Button>
            <Button size="lg" variant="ghost" onClick={onLater}>{t("tour_later")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── the dock: where the shop is, and the way out ──
function Dock({ open, setOpen, cur, doneCount, exiting, setExiting, onExit }: {
  open: boolean; setOpen: (o: boolean) => void; cur: number; doneCount: number;
  exiting: boolean; setExiting: (e: boolean) => void; onExit: () => void;
}) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const pct = Math.round((doneCount / ITEMS.length) * 100);
  return (
    <div
      className={cn("an-anim fixed z-[145]", isMobile ? "inset-x-3" : "left-[270px] w-[320px]")}
      style={{ bottom: isMobile ? "calc(env(safe-area-inset-bottom, 0px) + 80px)" : 20, animation: "an-pop .3s ease-out" }}
    >
      <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-2.5 bg-primary-soft px-4 py-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-primary text-primary-foreground"><Sparkles className="size-4" /></div>
          <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
            <div className="text-[13.5px] font-bold text-foreground">{t("tour_name")} · {Math.min(cur + 1, ITEMS.length)}/{ITEMS.length}</div>
            <div className="truncate text-[12px] font-medium text-primary-emphasis">{t(ITEMS[cur]?.key ?? "tour_name")}</div>
          </button>
          <button onClick={() => setOpen(!open)} aria-label={t("menu")} className="grid size-8 place-items-center rounded-[8px] text-muted-foreground hover:bg-card">
            {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </button>
          <button onClick={() => { setOpen(true); setExiting(true); }} aria-label={t("tour_close")} className="grid size-8 place-items-center rounded-[8px] text-muted-foreground hover:bg-card hover:text-destructive">
            <X className="size-4" />
          </button>
        </div>
        <div className="h-1 bg-secondary"><div className="h-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} /></div>
        {open && (
          <div className="p-4">
            {exiting && (
              <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4">
                <p className="text-[14px] font-medium text-foreground">{t("tour_exit_q")}</p>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" className="flex-1" onClick={onExit}>{t("tour_exit_yes")}</Button>
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => setExiting(false)}>{t("tour_exit_no")}</Button>
                </div>
              </div>
            )}
            <ol className="flex flex-col gap-1.5">
              {ITEMS.map((it, i) => {
                const done = i < doneCount;
                const now = i === cur && !done;
                return (
                  <li key={it.key} className={cn("flex items-center gap-2.5 text-[13px]",
                    done ? "text-muted-foreground" : now ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold transition-colors duration-300",
                      done ? "border-success bg-success text-white" : now ? "border-primary text-primary-emphasis" : "border-border")}>
                      {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                    </span>
                    <span className={cn(done && "line-through decoration-muted-foreground/50")}>{t(it.key)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

// ── the spotlight: dims the screen around one element and says what to do with it ──
function Spotlight({ selector, n, title, body, note, action, skip }: {
  selector?: string; n: number; title: string; body: string; note?: string; action?: React.ReactNode; skip?: () => void;
}) {
  const { t } = useLang();
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [view, setView] = useState({ w: 1280, h: 800 });
  const scrolledFor = useRef("");
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      let r: DOMRect | null = null;
      if (selector) {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
          const b = el.getBoundingClientRect();
          if (b.width > 0 && b.height > 0) {
            if (scrolledFor.current !== selector) { scrolledFor.current = selector; el.scrollIntoView({ block: "center", behavior: "smooth" }); }
            r = b;
            break;
          }
        }
      }
      setRect((prev) => {
        if (!r) return prev === null ? prev : null;
        if (prev && Math.abs(prev.x - r.x) < 0.5 && Math.abs(prev.y - r.y) < 0.5 && Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5) return prev;
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      setView((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selector]);

  const W = Math.min(340, view.w - 32);
  let pos: React.CSSProperties;
  if (rect) {
    const below = view.h - (rect.y + rect.h) > 230 || rect.y < 230;
    // Beside a tall, narrow target (a sidebar link) rather than over the next ones down.
    const side = rect.x + rect.w + W + 32 < view.w && rect.w < 280;
    const left = side ? rect.x + rect.w + 18 : Math.max(16, Math.min(rect.x + rect.w / 2 - W / 2, view.w - W - 16));
    pos = side
      ? { left, top: Math.max(16, Math.min(rect.y - 12, view.h - 240)), width: W }
      : below ? { left, top: rect.y + rect.h + 16, width: W } : { left, bottom: view.h - rect.y + 16, width: W };
  } else {
    pos = { left: (view.w - W) / 2, top: 84, width: W };
  }

  return (
    <>
      {rect && (
        <div aria-hidden className="pointer-events-none fixed z-[140] rounded-[14px] transition-all duration-300 ease-out"
          style={{ left: rect.x - 8, top: rect.y - 8, width: rect.w + 16, height: rect.h + 16, boxShadow: "0 0 0 9999px rgba(8,12,28,.5)" }}>
          <div className="an-anim absolute inset-0 rounded-[14px] ring-2 ring-primary" style={{ animation: "an-ring 1.8s ease-out infinite" }} />
        </div>
      )}
      <div key={`${selector}|${title}`} role="dialog" className="an-anim fixed z-[141] rounded-[16px] border border-border bg-card p-4 shadow-[var(--shadow-lg)] transition-[left,top,bottom] duration-300"
        style={{ ...pos, animation: "an-pop .3s ease-out" }}>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-primary-emphasis">
          <Sparkles className="size-3.5" /> {t("tour_name")} · {n}/{ITEMS.length}
        </div>
        <div className="text-[15.5px] font-bold tracking-[-0.01em] text-foreground">{title}</div>
        <p className="mt-1 text-[13.5px] leading-snug text-ink-2">{body}</p>
        {note && <p className="mt-2 text-[12.5px] font-semibold text-warning">{note}</p>}
        {(action || skip) && (
          <div className="mt-3 flex items-center justify-between gap-2">
            {skip ? <button onClick={skip} className="text-[12.5px] font-semibold text-muted-foreground underline-offset-2 hover:underline">{t("tour_skip_step")}</button> : <span />}
            {action}
          </div>
        )}
      </div>
    </>
  );
}

// ── the end of the loop ──
function Finish({ demo, onClean }: { demo: Demo; onClean: () => void }) {
  const { t } = useLang();
  const doomed = [demo.orderNo, demo.serviceName, demo.partName, demo.plate, demo.customerName].filter(Boolean);
  return (
    <div className="an-anim fixed inset-0 z-[150] grid place-items-center bg-black/45 p-4 backdrop-blur-[3px]" style={{ animation: "an-fade .25s ease-out" }}>
      <div role="dialog" aria-modal className="an-anim w-full max-w-[440px] overflow-hidden rounded-[22px] border border-border bg-card shadow-[var(--shadow-lg)]" style={{ animation: "an-pop .4s cubic-bezier(.2,.9,.3,1.15)" }}>
        <div className="grid h-[120px] place-items-center" style={{ background: HERO }}>
          <div className="an-anim grid size-16 place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/35" style={{ animation: "an-float 3s ease-in-out infinite" }}>
            <PartyPopper className="size-8" />
          </div>
        </div>
        <div className="p-6">
          <h2 className="text-[21px] font-bold tracking-[-0.02em] text-foreground">{t("tour_finish_title")}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {["tour_finish_1", "tour_finish_2", "tour_finish_3"].map((k, i) => (
              <li key={k} className="an-anim flex items-center gap-2.5 text-[14px] font-medium text-foreground" style={{ animation: `an-pop .35s ease-out ${0.15 + i * 0.12}s both` }}>
                <span className="grid size-5 place-items-center rounded-full bg-success text-white"><Check className="size-3" strokeWidth={3} /></span>{t(k)}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13.5px] leading-relaxed text-ink-2">{t("tour_finish_body")}</p>
          {doomed.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {doomed.map((d) => <span key={d} className="rounded-full bg-secondary px-2.5 py-1 text-[12px] font-semibold text-ink-2">{d}</span>)}
            </div>
          )}
          <Button size="lg" className="mt-5 w-full" onClick={onClean}><Trash2 /> {t("tour_clean_go")}</Button>
        </div>
      </div>
    </div>
  );
}

// ── the clean-up: each demo card turns to dust as the server confirms it is gone ──
type CardSpec = { key: string; icon: LucideIcon; color: string; title: string; sub: string };

function Cleanup({ demo, onClose, onKeep }: { demo: Demo; onClose: (target?: string) => void; onKeep: () => void }) {
  const { t } = useLang();
  const cards = useMemo<CardSpec[]>(() => [
    demo.workOrderId && { key: "order", icon: ClipboardList, color: "#2563eb", title: demo.orderNo || t("work_order"), sub: [demo.car, demo.plate].filter(Boolean).join(" · ") },
    demo.menuItemId && { key: "service", icon: Tag, color: "#7c3aed", title: demo.serviceName || t("services"), sub: t("nav_services") },
    demo.productId && { key: "part", icon: Package, color: "#d97706", title: demo.partName || t("nav_inventory"), sub: `${demo.partQty ?? ""} L · ${t("nav_inventory")}` },
    demo.vehicleId && { key: "car", icon: Car, color: "#0891b2", title: demo.plate || t("vehicle"), sub: demo.car || "" },
    demo.customerId && { key: "client", icon: User, color: "#16a34a", title: demo.customerName || t("customer"), sub: t("customer") },
  ].filter(Boolean) as CardSpec[], [demo, t]);

  const [gone, setGone] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<"run" | "done" | "error">("run");
  const [error, setError] = useState("");
  const fx = useRef<FxHandle>(null);
  const els = useRef<Record<string, HTMLDivElement | null>>({});
  const goneRef = useRef<Record<string, boolean>>({});
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setPhase("run"); setError("");
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const has = (k: string) => cards.some((c) => c.key === k) && !goneRef.current[k];
    const vanish = async (key: string) => {
      if (!has(key)) return;
      const el = els.current[key];
      const spec = cards.find((c) => c.key === key);
      if (el && spec) fx.current?.dust(el.getBoundingClientRect(), [spec.color, "#e2e8f0", "#cbd5e1", "#94a3b8", "#f8fafc"]);
      goneRef.current[key] = true;
      setGone((g) => ({ ...g, [key]: true }));
      await sleep(420);
    };
    // A second pass after a failure meets "not found" for whatever the first already removed.
    const gone404 = (e: unknown) => { if (!(e instanceof ApiError && e.status === 404)) throw e; };
    try {
      await sleep(1000); // let the cards arrive before anything leaves
      if (has("order") || has("service") || has("part")) {
        await api.purgeDemo({
          workOrderIds: has("order") ? [demo.workOrderId!] : [],
          menuItemIds: has("service") ? [demo.menuItemId!] : [],
          productIds: has("part") ? [demo.productId!] : [],
        }).catch(gone404);
        for (const k of ["order", "service", "part"]) await vanish(k);
      }
      if (has("car")) { await api.deleteVehicle(demo.vehicleId!).catch(gone404); await vanish("car"); }
      if (has("client")) { await api.deleteCustomer(demo.customerId!).catch(gone404); await vanish("client"); }
      await sleep(1100);
      setPhase("done");
      fx.current?.confetti();
    } catch (e) {
      setError(errText(e, t("error")));
      setPhase("error");
    } finally {
      running.current = false;
    }
  }, [cards, demo, t]);

  // Once, on arrival; the retry button runs it again by hand.
  const started = useRef(false);
  useEffect(() => { if (!started.current) { started.current = true; void run(); } }, [run]);

  const left = cards.filter((c) => !gone[c.key]).length;
  return (
    <div className="an-anim fixed inset-0 z-[300] grid place-items-center overflow-hidden p-4"
      style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(15,23,42,.78), rgba(2,6,23,.94))", backdropFilter: "blur(6px)", animation: "an-fade .35s ease-out" }}>
      <FxCanvas ref={fx} />
      <div className="relative z-[1] flex w-[min(420px,92vw)] flex-col items-center">
        {phase !== "done" ? (
          <>
            <div className="mb-5 flex items-center gap-2.5 text-[15px] font-semibold text-white/90">
              {phase === "run" ? <Spinner className="size-4 text-white/80" /> : <X className="size-4 text-red-300" />}
              {phase === "run" ? t("tour_cleaning") : t("tour_clean_failed")}
              {phase === "run" && <span className="font-mono text-[13px] text-white/50">{cards.length - left}/{cards.length}</span>}
            </div>
            <div className="flex w-full flex-col">
              {cards.map((c, i) => (
                <DustCard key={c.key} spec={c} index={i} gone={!!gone[c.key]} setEl={(el) => { els.current[c.key] = el; }} />
              ))}
            </div>
            {phase === "error" && (
              <div className="an-anim mt-4 flex w-full flex-col gap-3 rounded-[14px] bg-white/10 p-4 text-[13.5px] text-white/85" style={{ animation: "an-pop .3s ease-out" }}>
                <div>{error}</div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => void run()}>{t("tour_retry")}</Button>
                  <Button size="sm" variant="secondary" className="flex-1" onClick={onKeep}>{t("tour_close")}</Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="an-anim flex flex-col items-center text-center" style={{ animation: "an-pop .45s cubic-bezier(.2,.9,.3,1.2)" }}>
            <svg viewBox="0 0 88 88" className="size-[88px]">
              <circle cx="44" cy="44" r="40" fill="none" stroke="rgba(74,222,128,.25)" strokeWidth="6" />
              <circle cx="44" cy="44" r="40" fill="none" stroke="#4ade80" strokeWidth="6" strokeLinecap="round"
                strokeDasharray="252" strokeDashoffset="252" transform="rotate(-90 44 44)" className="an-anim" style={{ animation: "an-draw .7s ease-out forwards" }} />
              <path d="M27 45 l11 11 l23 -24" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="60" strokeDashoffset="60" className="an-anim" style={{ animation: "an-draw .45s ease-out .55s forwards" }} />
            </svg>
            <h2 className="mt-5 text-[26px] font-bold tracking-[-0.02em] text-white">{t("tour_clean_done")}</h2>
            <p className="mt-2 max-w-[340px] text-[14.5px] leading-relaxed text-white/70">{t("tour_clean_done_body")}</p>
            <div className="mt-6 flex w-full gap-2.5">
              <Button size="lg" className="flex-1" onClick={() => onClose("/work-orders")}><ClipboardList /> {t("tour_first_order")}</Button>
              <Button size="lg" variant="secondary" onClick={() => onClose()}>{t("tour_close")}</Button>
            </div>
            <button onClick={() => onClose("replay")} className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-white/65 transition-colors hover:text-white">
              <RotateCcw className="size-4" /> {t("tour_again")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DustCard({ spec, index, gone, setEl }: { spec: CardSpec; index: number; gone: boolean; setEl: (el: HTMLDivElement | null) => void }) {
  const { t } = useLang();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!gone) return;
    const h = setTimeout(() => setCollapsed(true), 950);
    return () => clearTimeout(h);
  }, [gone]);
  const Icon = spec.icon;
  return (
    // The row closes up once its card has blown away, so the list shortens rather than
    // leaving holes.
    <div className="grid transition-[grid-template-rows,opacity] duration-500 ease-out" style={{ gridTemplateRows: collapsed ? "0fr" : "1fr", opacity: collapsed ? 0 : 1 }}>
      <div className="min-h-0 overflow-visible">
        <div className="pb-2.5">
          <div ref={setEl}
            className="an-anim flex items-center gap-3 rounded-[14px] border border-white/10 bg-card px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,.28)]"
            style={{ animation: gone ? "an-dust-out 1s cubic-bezier(.4,0,.6,1) forwards" : `an-rise .5s cubic-bezier(.2,.9,.3,1.1) ${index * 0.09}s both` }}>
            <div className="grid size-10 shrink-0 place-items-center rounded-[10px]" style={{ background: `${spec.color}1f`, color: spec.color }}>
              <Icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-bold text-foreground">{spec.title}</div>
              {spec.sub && <div className="truncate text-[12.5px] text-muted-foreground">{spec.sub}</div>}
            </div>
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{t("tour_demo_badge")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── particles: dust for the cards, confetti for the end ──
type FxHandle = { dust: (r: DOMRect, colors: string[], ms?: number) => void; confetti: () => void };
type Particle = { kind: "dust" | "confetti"; x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; color: string; rot: number; vr: number };
type Emitter = { r: DOMRect; colors: string[]; start: number; ms: number };
const CONFETTI = ["#f43f5e", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#06b6d4", "#facc15", "#ffffff"];

const FxCanvas = React.forwardRef<FxHandle>(function FxCanvas(_props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const parts = useRef<Particle[]>([]);
  const emitters = useRef<Emitter[]>([]);
  const raf = useRef(0);
  const last = useRef(0);
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const loop = useCallback((now: number) => {
    const c = canvas.current;
    if (!c) { raf.current = 0; return; }
    const dt = Math.min(48, now - (last.current || now));
    last.current = now;
    const k = dt / 16.7; // speeds are written per 60 Hz frame
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext("2d");
    if (!g) { raf.current = 0; return; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    // Each dissolving card sheds grains along a line that sweeps across it, left to right —
    // the same sweep that clips the card away — so it reads as blown off rather than faded.
    emitters.current = emitters.current.filter((e) => {
      const p = Math.min(1, (now - e.start) / e.ms);
      const x = e.r.left + e.r.width * p;
      const n = Math.round(22 * k);
      for (let i = 0; i < n; i++) {
        parts.current.push({
          kind: "dust", x: x + (Math.random() - 0.5) * 8, y: e.r.top + Math.random() * e.r.height,
          vx: 0.9 + Math.random() * 3.2, vy: -0.4 - Math.random() * 1.6, age: 0, life: 700 + Math.random() * 900,
          size: 0.9 + Math.random() * 2.4, color: e.colors[(Math.random() * e.colors.length) | 0], rot: 0, vr: 0,
        });
      }
      return p < 1;
    });

    parts.current = parts.current.filter((q) => {
      q.age += dt;
      if (q.age >= q.life) return false;
      if (q.kind === "dust") {
        q.vx *= 0.985; q.vy -= 0.02 * k;
        q.x += (q.vx + Math.sin((q.y + q.age) * 0.018) * 0.5) * k; q.y += q.vy * k;
      } else {
        q.vy += 0.17 * k; q.vx *= 0.992;
        q.x += q.vx * k; q.y += q.vy * k; q.rot += q.vr * k;
      }
      const a = 1 - q.age / q.life;
      g.globalAlpha = q.kind === "dust" ? a * a : Math.min(1, a * 1.8);
      g.fillStyle = q.color;
      if (q.kind === "dust") {
        g.fillRect(q.x, q.y, q.size, q.size);
      } else {
        g.save(); g.translate(q.x, q.y); g.rotate(q.rot);
        g.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2);
        g.restore();
      }
      return true;
    });
    g.globalAlpha = 1;
    raf.current = parts.current.length || emitters.current.length ? requestAnimationFrame(loop) : 0;
  }, []);

  const kick = useCallback(() => { if (!raf.current) { last.current = 0; raf.current = requestAnimationFrame(loop); } }, [loop]);

  useImperativeHandle(ref, () => ({
    dust(r, colors, ms = 950) {
      if (reduced.current) return;
      emitters.current.push({ r, colors, start: performance.now(), ms });
      kick();
    },
    confetti() {
      if (reduced.current) return;
      const w = window.innerWidth, h = window.innerHeight;
      // Two cannons from the lower corners and a burst from behind the tick.
      const shots: [number, number, number, number][] = [[0, h * 0.95, -60, 90], [w, h * 0.95, -120, 90], [w / 2, h * 0.38, -90, 360]];
      for (const [x, y, dir, spread] of shots) {
        for (let i = 0; i < 90; i++) {
          const ang = ((dir + (Math.random() - 0.5) * spread) * Math.PI) / 180;
          const sp = (spread > 180 ? 5 : 13) + Math.random() * (spread > 180 ? 8 : 9);
          parts.current.push({
            kind: "confetti", x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (spread > 180 ? 3 : 0),
            age: 0, life: 2200 + Math.random() * 1400, size: 7 + Math.random() * 7,
            color: CONFETTI[(Math.random() * CONFETTI.length) | 0], rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
          });
        }
      }
      kick();
    },
  }), [kick]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-[2] h-full w-full" />;
});

const HERO = "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 45%, #7c3aed))";

const TOUR_CSS = `
@keyframes an-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes an-pop { from { opacity: 0; transform: translateY(10px) scale(.97) } to { opacity: 1; transform: none } }
@keyframes an-rise { from { opacity: 0; transform: translateY(18px) scale(.96) } to { opacity: 1; transform: none } }
@keyframes an-float { 0%, 100% { translate: 0 0 } 50% { translate: 0 -7px } }
@keyframes an-twinkle { 0%, 100% { opacity: .25; transform: scale(.8) rotate(0) } 50% { opacity: 1; transform: scale(1.15) rotate(20deg) } }
@keyframes an-ring { 0% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--primary) 55%, transparent) } 75%, 100% { box-shadow: 0 0 0 16px transparent } }
@keyframes an-draw { to { stroke-dashoffset: 0 } }
@keyframes an-dust-out {
  0% { clip-path: inset(-40% -20% -40% 0); opacity: 1; transform: none; filter: none }
  15% { transform: translateX(-3px) rotate(-.4deg) }
  100% { clip-path: inset(-40% -20% -40% 100%); opacity: .85; transform: translateX(26px) rotate(.6deg); filter: blur(.6px) }
}
@keyframes an-row-glow { 0%, 100% { background-color: transparent } 25%, 65% { background-color: color-mix(in oklch, var(--primary) 16%, transparent) } }
.an-row-hl { animation: an-row-glow 1.6s ease-in-out 3; box-shadow: inset 3px 0 0 var(--primary) }
@media (prefers-reduced-motion: reduce) { .an-anim, .an-row-hl { animation: none !important } }
`;
