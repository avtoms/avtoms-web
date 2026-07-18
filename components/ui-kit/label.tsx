"use client";
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-[13px] font-semibold text-ink-2 select-none group-data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

// Field composes a Label + control + optional hint into a vertical stack.
function Field({
  label, hint, htmlFor, className, children,
}: {
  label?: React.ReactNode; hint?: React.ReactNode; htmlFor?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 min-w-0", className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {hint && <span className="text-[12px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

export { Label, Field };
