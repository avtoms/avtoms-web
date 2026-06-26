"use client";
// PlatePreview renders a recognizable Uzbek number plate: white (standard), white with a
// green region box (electric), yellow (foreign), or a square two-line moped plate. The
// blue/white/green UZ flag strip sits on the right, as on real plates.
import React from "react";
import type { PlateType } from "@/lib/enums";
import { plateParts, plateColors, normalizePlate } from "@/lib/plate";

function UzStrip({ h }: { h: number }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", width: Math.round(h * 0.62), borderLeft: "1.5px solid #111" }}>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <span style={{ flex: 1, background: "#0099b5" }} />
        <span style={{ flex: 1, background: "#fff" }} />
        <span style={{ flex: 1, background: "#1eb53a" }} />
      </span>
      <span style={{ fontSize: 7, fontWeight: 800, textAlign: "center", color: "#111", lineHeight: "9px", background: "#fff" }}>UZ</span>
    </span>
  );
}

export function PlatePreview({ plate, type = "standard", size = "md" }: { plate: string; type?: PlateType; size?: "sm" | "md" }) {
  const c = plateColors(type);
  const h = size === "sm" ? 24 : 32;
  const fs = size === "sm" ? 12.5 : 16;
  const display = normalizePlate(plate);

  if (type === "moped") {
    const cmp = display.replace(/\s/g, "");
    const d = cmp.slice(0, 3), l = cmp.slice(3);
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1.5px solid #111", borderRadius: 4, background: c.bg, color: c.text, minHeight: h + 8, minWidth: h, padding: "2px 7px", fontFamily: "var(--font-mono)", fontWeight: 800, lineHeight: 1.05 }}>
        <span style={{ fontSize: fs - 1 }}>{d || "—"}</span>
        <span style={{ fontSize: fs - 2 }}>{l || "—"}</span>
      </span>
    );
  }

  const { region, rest } = plateParts(plate, type);
  return (
    <span style={{ display: "inline-flex", alignItems: "stretch", border: "1.5px solid #111", borderRadius: 4, overflow: "hidden", background: c.bg, color: c.text, height: h, fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: fs }}>
      {region && (
        <span style={{ display: "flex", alignItems: "center", padding: "0 6px", background: c.regionGreen ? "#1eb53a" : "transparent", color: c.regionGreen ? "#fff" : c.text, borderRight: "1.5px solid #111" }}>{region}</span>
      )}
      <span style={{ display: "flex", alignItems: "center", padding: "0 8px", letterSpacing: 1, whiteSpace: "nowrap" }}>{rest || display || "—"}</span>
      <UzStrip h={h} />
    </span>
  );
}
