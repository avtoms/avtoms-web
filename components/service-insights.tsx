"use client";
// Service analytics: turns the "service performance" report rows (per-shop for the owner,
// cross-shop for the super-admin) into a top-sellers bar chart plus a short list of concrete,
// derived suggestions ("your best seller", "discounts are eroding margin", ...). Pure
// presentation: it computes everything from the rows it is given, no fetching of its own.
import React, { useMemo } from "react";
import { Card, Badge, Empty } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useLang } from "@/components/providers";
import { money, num } from "@/lib/format";
import type { ReportRow } from "@/lib/types";

type Svc = { service: string; sold: number; revenue: number; discount: number; cost: number; margin: number; shops: number };
type Tone = "accent" | "ok" | "warn" | "danger" | "info";
type Suggestion = { key: string; tone: Tone; icon: string; text: string };

const TONE_VARS: Record<Tone, { soft: string; fg: string }> = {
  accent: { soft: "var(--accent-soft)", fg: "var(--accent-2)" },
  ok: { soft: "var(--ok-soft)", fg: "var(--ok)" },
  warn: { soft: "var(--warn-soft)", fg: "var(--warn)" },
  danger: { soft: "var(--danger-soft)", fg: "var(--danger)" },
  info: { soft: "var(--info-soft)", fg: "var(--info)" },
};

// Fill {s}/{n}/{v}/{p} placeholders in a translated suggestion template.
function fill(tpl: string, v: { s?: string; n?: string | number; val?: string | number; p?: string | number }): string {
  return tpl
    .replace(/\{s\}/g, String(v.s ?? ""))
    .replace(/\{n\}/g, String(v.n ?? ""))
    .replace(/\{v\}/g, String(v.val ?? ""))
    .replace(/\{p\}/g, String(v.p ?? ""));
}

function parse(rows: ReportRow[]): Svc[] {
  return rows
    .map((r) => ({
      service: r.cells.service || "—",
      sold: num(r.cells.sold),
      revenue: num(r.cells.revenue),
      discount: num(r.cells.discount),
      cost: num(r.cells.cost),
      margin: num(r.cells.margin),
      shops: num(r.cells.shops),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// Build up to four prioritised, de-duplicated suggestions from the parsed services.
function suggest(list: Svc[], scope: "shop" | "platform", t: (k: string) => string): Suggestion[] {
  const out: Suggestion[] = [];
  const used = new Set<string>();
  const push = (s: Svc, tone: Tone, icon: string, text: string, key: string) => {
    if (used.has(s.service) || out.length >= 4) return;
    used.add(s.service);
    out.push({ key: key + s.service, tone, icon, text });
  };
  const withRevenue = list.filter((s) => s.revenue > 0);
  if (withRevenue.length === 0) return out;

  // Best seller by revenue.
  const best = withRevenue[0];
  push(best, "accent", "money", fill(t("sug_bestseller"), { s: best.service, n: best.sold, val: money(best.revenue) }), "best");

  // Heaviest discounting relative to gross — a margin leak worth capping.
  const disc = [...withRevenue]
    .filter((s) => s.discount > 0 && s.discount / (s.revenue + s.discount) >= 0.15)
    .sort((a, b) => b.discount - a.discount)[0];
  if (disc) {
    const p = Math.round((100 * disc.discount) / (disc.revenue + disc.discount));
    push(disc, "warn", "alert", fill(t("sug_discount"), { s: disc.service, p, val: money(disc.discount) }), "disc");
  }

  // Sells well but barely profits (only where cost is actually tracked).
  const low = withRevenue
    .filter((s) => s.cost > 0 && s.margin / s.revenue < 0.15)
    .sort((a, b) => a.margin / a.revenue - b.margin / b.revenue)[0];
  if (low) {
    push(low, "danger", "alert", fill(t("sug_lowmargin"), { s: low.service, p: Math.round((100 * low.margin) / low.revenue) }), "low");
  }

  // Most profitable service overall — worth promoting.
  const star = [...withRevenue].sort((a, b) => b.margin - a.margin)[0];
  if (star && star.margin > 0) {
    push(star, "ok", "check", fill(t("sug_star"), { s: star.service, val: money(star.margin) }), "star");
  }

  // Platform-only: profitable but sold in only a handful of shops — a network upsell.
  if (scope === "platform") {
    const reach = withRevenue.filter((s) => s.margin > 0 && s.shops > 0 && s.shops <= 2).sort((a, b) => b.margin - a.margin)[0];
    if (reach) push(reach, "info", "chart", fill(t("sug_reach"), { s: reach.service, n: reach.shops }), "reach");
  }

  // High-margin but low-volume — an upsell opportunity.
  const median = withRevenue.length ? [...withRevenue].map((s) => s.sold).sort((a, b) => a - b)[Math.floor(withRevenue.length / 2)] : 0;
  const gem = withRevenue.filter((s) => s.revenue > 0 && s.margin / s.revenue >= 0.4 && s.sold <= median).sort((a, b) => b.margin / b.revenue - a.margin / a.revenue)[0];
  if (gem) push(gem, "info", "chart", fill(t("sug_upsell"), { s: gem.service, p: Math.round((100 * gem.margin) / gem.revenue), n: gem.sold }), "gem");

  return out.slice(0, 4);
}

export function ServiceInsights({ rows, scope = "shop" }: { rows: ReportRow[]; scope?: "shop" | "platform" }) {
  const { t } = useLang();
  const list = useMemo(() => parse(rows), [rows]);
  const suggestions = useMemo(() => suggest(list, scope, t), [list, scope, t]);

  if (list.length === 0 || list.every((s) => s.revenue === 0)) {
    return <Card pad={24}><Empty icon="chart" text={t("no_sales_yet")} /></Card>;
  }

  const top = list.slice(0, 8);
  const max = Math.max(...top.map((s) => s.revenue), 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
      {/* Top services — ranked revenue bars. */}
      <Card pad={0}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="chart" size={17} style={{ color: "var(--accent-2)" }} />
          <h3 style={{ margin: 0, fontSize: "calc(15px * var(--scale))", fontWeight: 700, color: "var(--ink)" }}>{t("top_services")}</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 18px" }}>
          {top.map((s, i) => {
            const pct = Math.max(3, Math.round((100 * s.revenue) / max));
            return (
              <div key={s.service + i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ink-3)", width: 16, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: "calc(13.5px * var(--scale))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.service}</span>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)", fontSize: 13, flexShrink: 0 }}>{money(s.revenue)}</span>
                </div>
                <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: pct + "%", height: "100%", background: "linear-gradient(90deg, var(--accent-2), var(--accent))", borderRadius: 99 }} />
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: "var(--ink-3)" }}>
                  <span>{t("m_sold")}: <b style={{ color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>{num(s.sold).toLocaleString("ru-RU")}</b></span>
                  <span>{t("m_margin")}: <b style={{ color: s.margin >= 0 ? "var(--ok)" : "var(--danger)", fontFamily: "var(--font-mono)" }}>{money(s.margin)}</b></span>
                  {scope === "platform" && s.shops > 0 && <span>{t("m_shops")}: <b style={{ color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>{s.shops}</b></span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Suggestions — derived, actionable. */}
      <Card pad={0}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="check" size={17} style={{ color: "var(--ok)" }} />
          <h3 style={{ margin: 0, fontSize: "calc(15px * var(--scale))", fontWeight: 700, color: "var(--ink)" }}>{t("suggestions")}</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: 8 }}>
          {suggestions.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13, color: "var(--ink-3)" }}>{t("no_suggestions")}</div>
          ) : suggestions.map((s) => {
            const c = TONE_VARS[s.tone];
            return (
              <div key={s.key} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "11px 12px", borderRadius: "var(--radius-sm)" }}>
                <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, background: c.soft, color: c.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={s.icon} size={17} />
                </div>
                <div style={{ fontSize: "calc(13px * var(--scale))", color: "var(--ink-2)", lineHeight: 1.45, paddingTop: 2 }}>{s.text}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
