"use client";
import { useRouter } from "next/navigation";
import { Globe, LogOut, Check, ChevronDown } from "lucide-react";
import { useAuth, useLang } from "@/components/providers";
import { LANGS } from "@/lib/i18n";
import { UserAvatar } from "@/components/ui-kit/avatar";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui-kit/dropdown-menu";
import { cn } from "@/lib/utils";

// Client island for the admin header: language switcher + signed-in admin menu with sign-out.
export function AdminTopbar() {
  const { session, logout } = useAuth();
  const { lang, setLang, t } = useLang();
  const router = useRouter();
  const name = session?.staff?.name || t("a_administrator");
  const phone = session?.staff?.phone || "";
  const cur = LANGS.find((l) => l.code === lang) || LANGS[0];

  return (
    <div className="flex items-center gap-2">
      {/* Language */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-border bg-card px-2.5 text-[13px] font-semibold text-foreground shadow-[var(--shadow)] outline-none transition-colors hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/25">
            <Globe className="size-4 text-muted-foreground" />
            <span className="hidden sm:inline">{cur.short}</span>
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

      {/* User */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-border bg-card pl-1 pr-2.5 shadow-[var(--shadow)] outline-none transition-colors hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/25">
            <UserAvatar name={name} className="size-7" />
            <span className="hidden max-w-[140px] truncate text-[13px] font-semibold text-foreground md:inline">{name}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          <DropdownMenuLabel className="normal-case">
            <div className="flex flex-col gap-0.5 py-0.5">
              <span className="text-[13.5px] font-bold tracking-normal text-foreground">{name}</span>
              {phone && <span className="font-mono text-[12px] font-medium tracking-normal text-muted-foreground">{phone}</span>}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => { logout(); router.replace("/login"); }}>
            <LogOut /> {t("a_logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
