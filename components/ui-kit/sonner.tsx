"use client";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Toast host for the admin console. Colours are bridged to the runtime theme tokens so
// toasts follow Workshop / Steel / Carbon (incl. dark mode) automatically.
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="admin-portal"
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "admin-portal !rounded-[12px] !border !border-border !bg-card !text-foreground !shadow-[var(--shadow-lg)] !font-sans",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground !rounded-[8px]",
          cancelButton: "!bg-muted !text-muted-foreground !rounded-[8px]",
          success: "!text-success",
          error: "!text-destructive",
        },
      }}
      style={{ "--normal-bg": "var(--surface)", "--normal-text": "var(--ink)", "--normal-border": "var(--line)" } as React.CSSProperties}
      {...props}
    />
  );
}
