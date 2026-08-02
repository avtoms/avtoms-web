import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[72px] w-full rounded-[9px] border border-input bg-card px-3 py-2 text-sm text-foreground shadow-[var(--shadow)] transition-[color,box-shadow,border-color] outline-none resize-y",
        "touch:text-base",
        "placeholder:text-muted-foreground/70",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-secondary",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
