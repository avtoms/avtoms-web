"use client";
// Mechanic shell — a slim app bar over a brand hairline. The root carries `app-scope`, which
// activates the Tailwind + shadcn token bridge, so this surface inherits the runtime theme
// (Workshop / Steel / Carbon incl. dark mode) exactly like the owner console does.
import React from "react";
import { useRouter } from "next/navigation";
import { Wrench, Globe, LogOut, Check, ChevronDown } from "lucide-react";
import { useAuth, useLang } from "@/components/providers";
import { LANGS, type Lang } from "@/lib/i18n";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui-kit/dropdown-menu";
import { Spinner } from "@/components/ui-kit/misc";
import { cn } from "@/lib/utils";

function LangMenu({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const cur = LANGS.find((l) => l.code === lang) || LANGS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-2.5 text-[12.5px] font-bold text-foreground outline-none transition-colors hover:bg-secondary">
          <Globe className="size-4 text-muted-foreground" />
          {cur.short}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {LANGS.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => setLang(l.code)} className={cn(l.code === lang && "bg-primary-soft text-primary-emphasis")}>
            <span className="flex-1">{l.label}</span>
            {l.code === lang ? <Check className="size-4 !text-primary-emphasis" /> : <span className="text-[11px] font-bold text-muted-foreground">{l.short}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function MechanicLayout({ children }: { children: React.ReactNode }) {
  const { session, logout, ready } = useAuth();
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  // Hold the screen until the session is read from the cookie, the way the owner console
  // does. Screens below here read the signed-in worker's shop straight off the session, and
  // rendering them with nothing in hand only produces a flash of an empty board.
  if (!ready || !session) {
    return <div className="app-scope grid min-h-[100dvh] place-items-center bg-background"><Spinner className="size-7" /></div>;
  }

  const name = session.staff.name || "";
  const phone = session.staff.phone || "";

  const signOut = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="app-scope flex min-h-[100dvh] flex-col bg-background">
      {/* brand hairline — the only piece of pure decoration, and it anchors the header */}
      <div className="h-[5px] shrink-0 bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]" />

      <header className="sticky top-0 z-50 border-b border-border bg-[color-mix(in_oklch,var(--bg),transparent_6%)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1240px] items-center gap-3 px-4 py-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground">
            <Wrench className="size-[18px]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-bold tracking-[-0.02em] text-foreground">{name || t("role_mechanic")}</div>
            <div className="truncate font-mono text-[12px] text-muted-foreground">{phone}</div>
          </div>
          <LangMenu lang={lang} setLang={setLang} />
          <button
            onClick={signOut}
            aria-label={t("sign_out")}
            className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-border bg-card text-muted-foreground outline-none transition-colors hover:bg-destructive-soft hover:text-destructive"
          >
            <LogOut className="size-[17px]" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-10 pt-4">{children}</main>
    </div>
  );
}
