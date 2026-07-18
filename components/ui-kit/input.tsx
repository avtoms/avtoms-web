import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-[9px] border border-input bg-card px-3 py-2 text-sm text-foreground shadow-[var(--shadow)] transition-[color,box-shadow,border-color] outline-none",
        "placeholder:text-muted-foreground/70 selection:bg-primary-soft",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-secondary",
        "file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
