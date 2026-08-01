"use client";
// A translated string, usable from a server component.
//
// Several admin pages are server components — they fetch on the server and render the list in
// one pass. `useLang` is a client hook, so those pages could not translate a word without
// becoming client components and giving up their server fetch. This is the smallest thing
// that bridges the two: a client leaf that renders one translated string.
//
// Use it for the odd caption inside a server-rendered page. Anything with state or handlers
// belongs in a proper client island.
import { useLang } from "@/components/providers";

export function T({ k }: { k: string }) {
  const { t } = useLang();
  return <>{t(k)}</>;
}
