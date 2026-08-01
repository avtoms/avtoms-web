"use client";
// Translating the crash screen, without the provider tree.
//
// The error boundaries are the one place that cannot use `useLang`. global-error.tsx replaces
// the root layout outright, so no provider is mounted above it; and the thing that crashed
// might BE the provider. Reading the context there would fail inside the screen whose whole
// job is to still render when everything else did not.
//
// So the stored choice is read straight from where the provider keeps it. Anything unreadable
// — a browser with storage blocked, a server render — falls back to Latin Uzbek, which is
// what a visitor who has never chosen sees everywhere else.
import { translate, type Lang } from "@/lib/i18n";

const LANGS: Lang[] = ["uz", "uzc", "ru"];

export function crashLang(): Lang {
  try {
    const v = localStorage.getItem("an_lang") as Lang | null;
    return v && LANGS.includes(v) ? v : "uz";
  } catch {
    return "uz";
  }
}

/** crashText returns a translator bound to the stored language. */
export function crashText(): (key: string) => string {
  const lang = crashLang();
  return (key: string) => translate(lang, key);
}
