"use client";
// CarImage shows a car's visual with a graceful fallback chain:
//   uploaded photo → brand "emblem" (a make-derived monogram badge) → generic car icon.
// The emblem is a brand-coloured monogram (initials), NOT a trademarked logo, so it works
// offline for any make without bundling third-party logo assets.
import React from "react";
import { Icon } from "@/components/icons";
import { useCarMakeLogo } from "@/lib/car-makes";

// Deterministic hue from the make so each brand keeps a consistent colour.
function brandHue(make: string): number {
  let h = 0;
  const s = make.toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
function brandInitials(make: string): string {
  const words = make.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return make.trim().slice(0, 2).toUpperCase();
}

export function CarImage({ src, make, size = 46, radius = 12 }: { src?: string; make?: string; size?: number; radius?: number }) {
  // Brand logo uploaded by the super admin (looked up by make name), used when there is no
  // per-car photo. Falls through to the monogram emblem when the brand has no logo.
  const logo = useCarMakeLogo(make);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", flexShrink: 0, background: "var(--surface-2)" }} />
    );
  }
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt={make} title={make} style={{ width: size, height: size, borderRadius: radius, objectFit: "contain", flexShrink: 0, background: "var(--surface-2)", padding: size * 0.12 }} />
    );
  }
  if (make && make.trim()) {
    const hue = brandHue(make);
    return (
      <div title={make} style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `oklch(0.92 0.05 ${hue})`, color: `oklch(0.45 0.13 ${hue})`, fontWeight: 800, fontSize: size * 0.34, letterSpacing: "-0.02em", fontFamily: "var(--font-sans)" }}>
        {brandInitials(make)}
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--accent-soft)", color: "var(--accent-2)" }}>
      <Icon name="car" size={Math.round(size * 0.5)} />
    </div>
  );
}
