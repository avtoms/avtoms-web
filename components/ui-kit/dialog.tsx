"use client";
// "Dialog" is rendered as a WIDE side drawer (slides in from the left) rather than a small
// centered popup — so forms with big money values + material rows have room and never clip.
// The API (Dialog / DialogContent / DialogHeader / DialogTitle / DialogBody / DialogFooter)
// is unchanged, so every existing modal in the app becomes a drawer automatically.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "admin-portal fixed inset-0 z-[200] bg-[oklch(0.15_0.02_60/0.45)] backdrop-blur-[2px]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className, children, showClose = true, side = "left", ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showClose?: boolean; side?: "left" | "right" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-side={side}
        className={cn(
          "admin-portal fixed top-0 z-[201] flex h-svh flex-col bg-card text-foreground shadow-[var(--shadow-lg)] outline-none",
          side === "left" ? "left-0 rounded-r-[18px] border-r border-border" : "right-0 rounded-l-[18px] border-l border-border",
          // Wide drawer — overrides any max-w-* a caller passed (old centered-modal widths).
          className,
          "w-[min(720px,96vw)] max-w-none",
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute right-3 top-3 grid size-8 touch:size-11 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex shrink-0 flex-col gap-1 border-b border-border px-6 py-4", className)} {...props} />;
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-4", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dialog-footer" className={cn("flex shrink-0 justify-end gap-2.5 border-t border-border px-6 py-4", className)} {...props} />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-[18px] font-bold tracking-[-0.02em] pr-8", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-[13px] text-muted-foreground", className)} {...props} />
  );
}

export {
  Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
};
