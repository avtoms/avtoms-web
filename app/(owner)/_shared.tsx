"use client";
// Shared owner-console building blocks ported from the Auto-Garaj prototype
// (flows.jsx SecTitle/Row, owner.jsx StatCard/WORow). Wired to live types.
import React from "react";
import Link from "next/link";
import { Card, Badge, useIsMobile } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useT } from "@/components/providers";
import { money, num, orderLabel } from "@/lib/format";
import { woStateFromProto } from "@/lib/enums";
import { StateBadge } from "@/components/ui";
import type { WorkOrder } from "@/lib/types";

export function SecTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
      {/* title ellipsizes; the action (link/badge) keeps its full width so it never clips */}
      <h3 style={{ margin: 0, minWidth: 0, fontSize: "calc(13px * var(--scale))", fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</h3>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

export function Row({ label, value, mono, strong }: { label: React.ReactNode; value: React.ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "3px 0" }}>
      <span style={{ color: "var(--ink-2)", fontSize: "calc(14px * var(--scale))", fontWeight: strong ? 700 : 500 }}>{label}</span>
      <span style={{ color: "var(--ink)", fontSize: "calc(" + (strong ? 17 : 14.5) + "px * var(--scale))", fontWeight: strong ? 800 : 600, fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)", letterSpacing: strong ? "-0.02em" : 0 }}>{value}</span>
    </div>
  );
}

type StatTone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";
export function StatCard({ label, value, sub, icon, tone = "neutral", big, onClick }: { label: string; value: React.ReactNode; sub?: string; icon?: string; tone?: StatTone; big?: boolean; onClick?: () => void }) {
  const tones: Record<StatTone, string> = { neutral: "var(--ink)", accent: "var(--accent-2)", ok: "var(--ok)", warn: "var(--warn)", danger: "var(--danger)", info: "var(--info)" };
  return (
    <Card pad={18} onClick={onClick} hover={!!onClick}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: "calc(13px * var(--scale))", fontWeight: 600, color: "var(--ink-3)" }}>{label}</span>
        {icon && <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", color: tones[tone] }}><Icon name={icon} size={17} /></div>}
      </div>
      {/* clamp + overflow:hidden so a long money value scales down and never widens the
          grid track (which caused horizontal page scroll on small phones). */}
      <div style={{ fontSize: big ? "clamp(20px, 7vw, calc(30px * var(--scale)))" : "clamp(18px, 6vw, calc(26px * var(--scale)))", fontWeight: 800, color: tones[tone], letterSpacing: "-0.03em", fontFamily: big ? "var(--font-mono)" : "var(--font-sans)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

// Work-order list row. The backend doesn't embed the vehicle/customer in the list
// response, so we show the WO id + total + state (degrade gracefully).
// TODO backend: include vehicle/plate summary in listWorkOrders for richer rows.
export function WORow({ wo }: { wo: WorkOrder }) {
  const t = useT();
  const isMobile = useIsMobile();
  const state = woStateFromProto(wo.state);
  const total = num(wo.total);
  const created = wo.createdAt ? new Date(wo.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";
  return (
    <Link href={`/work-orders/${wo.id}`} className="an-row-btn" style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 13, width: "100%", padding: isMobile ? "12px 14px" : "13px 18px", borderBottom: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left", textDecoration: "none" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 60, flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: 13.5 }}>{orderLabel(wo)}</span>
        <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{created}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(14px * var(--scale))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("work_order")}</div>
        {/* On phones drop the secondary vehicle id and surface the money under the title instead. */}
        {isMobile
          ? <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink-2)", fontSize: 12.5 }}>{money(total)}</div>
          : <div style={{ fontSize: 12, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>{wo.vehicleId.slice(0, 12)}</div>}
      </div>
      {!isMobile && <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink-2)", fontSize: 13 }}>{money(total)}</span>}
      <StateBadge state={state} style={{ flexShrink: 0 }} />
      {/* chevron is decorative — the whole row is a link — so drop it on phones to save width */}
      {!isMobile && <Icon name="chevR" size={16} style={{ color: "var(--ink-3)" }} />}
    </Link>
  );
}

export function PaidBadge({ paid }: { paid?: boolean }) {
  const t = useT();
  return <Badge tone={paid ? "ok" : "neutral"} dot>{paid ? t("paid") : t("unpaid")}</Badge>;
}
