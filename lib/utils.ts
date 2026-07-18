import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// cn merges conditional class lists and resolves Tailwind class conflicts (last wins).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
