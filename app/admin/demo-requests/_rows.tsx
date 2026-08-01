"use client";
// One demo-lead row with a status switcher (new → contacted → closed). Calls the admin API
// and refreshes the server component on change.
import { useState } from "react";
import { useLang } from "@/components/providers";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Phone, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api";
import type { DemoRequest } from "@/lib/types";

const STATUSES: { key: string; label: string; cls: string }[] = [
  { key: "new", label: "a_demo_new", cls: "bg-primary-soft text-primary-emphasis" },
  { key: "contacted", label: "a_demo_contacted", cls: "bg-warning-soft text-warning" },
  { key: "closed", label: "a_demo_closed", cls: "bg-secondary text-muted-foreground" },
];

const LANGS: Record<string, string> = { uz: "UZ", ru: "RU", en: "EN" };

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export function DemoRow({ req, last }: { req: DemoRequest; last: boolean }) {
  const { t } = useLang();
  const router = useRouter();
  const [status, setStatus] = useState(req.status || "new");
  const [busy, setBusy] = useState(false);

  const setTo = async (s: string) => {
    if (busy || s === status) return;
    setBusy(true);
    const prev = status;
    setStatus(s); // optimistic
    try {
      await api.setDemoRequestStatus(req.id, s);
      router.refresh();
    } catch (e) {
      setStatus(prev);
      toast.error(e instanceof ApiError ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const cur = STATUSES.find((s) => s.key === status) ?? STATUSES[0];

  return (
    <div className={cn("flex items-start gap-3.5 px-4 py-3.5 sm:px-5", !last && "border-b border-border", status === "closed" && "opacity-60")}>
      <div className={cn("grid size-10 shrink-0 place-items-center rounded-[11px] text-[16px] font-extrabold", cur.cls)}>
        {(req.name || "?").trim().slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold text-foreground">{req.name}</span>
          {req.shop && <span className="text-[13px] text-ink-2">· {req.shop}</span>}
          <span className="rounded-[6px] border border-border px-1.5 py-px font-mono text-[11px] font-bold text-muted-foreground">
            {LANGS[req.lang ?? "uz"] ?? (req.lang ?? "").toUpperCase()}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <a href={`tel:${req.phone}`} className="inline-flex items-center gap-1 font-mono font-semibold text-primary-emphasis hover:underline">
            <Phone className="size-3.5" /> {req.phone}
          </a>
          {req.city && <span className="text-ink-2">{req.city}</span>}
          <span className="inline-flex items-center gap-1 font-mono text-[12px] text-muted-foreground">
            <Clock className="size-3.5" /> {fmtDate(req.createdAt)}
          </span>
        </div>
        {req.message && (
          <div className="mt-2 rounded-[8px] bg-secondary px-3 py-2 text-[13px] leading-relaxed text-ink-2">{req.message}</div>
        )}
      </div>
      <div className="flex max-w-[230px] flex-shrink-0 flex-wrap justify-end gap-1.5">
        {STATUSES.map((s) => {
          const on = s.key === status;
          return (
            <button
              key={s.key}
              disabled={busy}
              onClick={() => setTo(s.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[12px] font-bold transition-colors disabled:cursor-wait",
                on ? s.cls : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {t(s.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
