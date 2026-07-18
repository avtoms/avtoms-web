"use client";
// Responsive client shell for the admin console. Keeps app/admin/layout.tsx a server
// component (it reads getServerSession); the session identity + children are passed in.
// Desktop (>=860px): sticky sidebar + content grid.
// Mobile (<860px): sidebar hidden; sticky top bar with a hamburger that opens a shadcn Sheet
// drawer containing the nav + admin identity. Content goes full width.
//
// The root wrapper carries `app-scope`, which activates the Tailwind + shadcn token bridge
// (see app/tailwind.css) — everything below inherits the runtime theme + dark mode.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Wrench } from "lucide-react";
import { useIsMobile } from "@/components/ui";
import { UserAvatar } from "@/components/ui-kit/avatar";
import { Sheet, SheetContent } from "@/components/ui-kit/sheet";
import { Button } from "@/components/ui-kit/button";
import { AdminTopbar } from "./_topbar";
import { AdminNav, AdminPageTitle } from "./_nav";
import { ChatWidget } from "@/components/ai-chat";

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 pb-4 pt-5">
      <div className="grid size-9 place-items-center rounded-[10px] bg-primary text-primary-foreground shadow-[var(--shadow)]">
        <Wrench className="size-[19px]" strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <div className="text-[15px] font-extrabold tracking-[-0.02em] text-foreground">Admin konsoli</div>
        <div className="text-[11.5px] font-medium text-muted-foreground">Auto-Garaj</div>
      </div>
    </div>
  );
}

function SidebarFooter({ name, phone }: { name: string; phone: string }) {
  return (
    <div className="m-3 flex items-center gap-3 rounded-[12px] bg-secondary/70 px-3 py-2.5">
      <UserAvatar name={name} className="size-9" />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-bold text-foreground">{name}</div>
        <div className="truncate font-mono text-[12px] text-muted-foreground">{phone || "—"}</div>
      </div>
    </div>
  );
}

export function AdminShell({ name, phone, children }: { name: string; phone: string; children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setDrawer(false); }, [pathname]);

  return (
    <div className="app-scope grid min-h-screen bg-background" style={{ gridTemplateColumns: isMobile ? "1fr" : "260px 1fr" }}>
      {!isMobile && (
        <aside className="sticky top-0 flex h-screen flex-col border-r border-border bg-card">
          <Brand />
          <AdminNav />
          <SidebarFooter name={name} phone={phone} />
        </aside>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3.5 border-b border-border bg-[color-mix(in_oklch,var(--bg),transparent_6%)] px-4 py-3 backdrop-blur-md md:px-7 md:py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            {isMobile && (
              <Button variant="secondary" size="icon" onClick={() => setDrawer(true)} aria-label="Menyu">
                <Menu />
              </Button>
            )}
            <AdminPageTitle />
          </div>
          <AdminTopbar />
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-5 md:px-7 md:py-6">{children}</main>
      </div>

      {isMobile && (
        <Sheet open={drawer} onOpenChange={setDrawer}>
          <SheetContent side="left" className="p-0">
            <Brand />
            <AdminNav />
            <SidebarFooter name={name} phone={phone} />
          </SheetContent>
        </Sheet>
      )}

      <ChatWidget />
    </div>
  );
}
