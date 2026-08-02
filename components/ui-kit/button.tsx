"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[9px] text-sm font-semibold tracking-[-0.01em] transition-[filter,background-color,border-color,transform] duration-100 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[var(--shadow)] hover:brightness-[0.96]",
        secondary: "bg-card text-foreground border border-input hover:bg-secondary",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        soft: "bg-primary-soft text-primary-emphasis hover:brightness-[0.97]",
        destructive: "bg-destructive-soft text-destructive hover:brightness-[0.97]",
        outline: "border border-border bg-transparent hover:bg-secondary",
        dark: "bg-foreground text-background hover:brightness-110",
        link: "text-primary-emphasis underline-offset-4 hover:underline",
      },
      // Every size grows to 44px on a phone. A "small" button is small because the screen is
      // dense, not because the person pressing it has a smaller finger.
      size: {
        sm: "h-8 px-3 text-[13px] touch:h-11 touch:px-4 touch:text-[14px] [&_svg:not([class*='size-'])]:size-3.5 touch:[&_svg:not([class*='size-'])]:size-4",
        default: "h-10 px-4 touch:h-11",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9 touch:size-11",
        "icon-sm": "size-8 touch:size-11 [&_svg:not([class*='size-'])]:size-3.5 touch:[&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className, variant, size, asChild = false, ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
