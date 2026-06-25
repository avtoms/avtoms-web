"use client";
// Client wrapper for the users page: a search box (client-side filter by name/phone) and
// staff grouped by shopId into cards. Each row renders the RowActions mutation island.
// Receives the SSR-fetched staff list as a prop; mutations refresh the page via RowActions.
import { useMemo, useState } from "react";
import { Avatar, Badge, TextInput, useMedia } from "@/components/ui";
import { Icon } from "@/components/icons";
import { roleFromProto, type Role } from "@/lib/enums";
import type { Staff } from "@/lib/types";
import { RowActions } from "./_row-actions";

const ROLE_BADGE: Record<Role, { label: string; tone: "accent" | "info" | "warn" }> = {
  owner: { label: "Egasi", tone: "accent" },
  mechanic: { label: "Usta", tone: "info" },
  admin: { label: "Admin", tone: "warn" },
};

type ShopGroup = { shopId: string; members: Staff[] };

function groupByShop(staff: Staff[]): ShopGroup[] {
  const map = new Map<string, Staff[]>();
  for (const s of staff) {
    const arr = map.get(s.shopId);
    if (arr) arr.push(s);
    else map.set(s.shopId, [s]);
  }
  return [...map.entries()]
    .map(([shopId, members]) => ({ shopId, members }))
    .sort((a, b) => b.members.length - a.members.length);
}

function shopLabel(shopId: string): string {
  if (!shopId) return "—";
  return shopId.length > 10 ? shopId.slice(0, 8) : shopId;
}

export function UsersList({ staff }: { staff: Staff[] }) {
  const [q, setQ] = useState("");
  const narrow = useMedia("(max-width: 560px)");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return staff;
    return staff.filter(
      (s) => (s.name || "").toLowerCase().includes(term) || (s.phone || "").toLowerCase().includes(term),
    );
  }, [q, staff]);

  const groups = useMemo(() => groupByShop(filtered), [filtered]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ position: "relative", maxWidth: 360 }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", display: "flex" }}>
          <Icon name="search" size={17} />
        </span>
        <TextInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ism yoki telefon bo'yicha qidirish"
          style={{ paddingLeft: 38 }}
        />
      </div>

      {groups.length === 0 ? (
        <div
          style={{
            background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)",
            boxShadow: "var(--shadow)", padding: 36, textAlign: "center", color: "var(--ink-3)", fontSize: 14,
          }}
        >
          {staff.length === 0 ? "Foydalanuvchilar yo'q" : "Hech narsa topilmadi"}
        </div>
      ) : (
        groups.map((g) => (
          <div
            key={g.shopId || "none"}
            style={{
              background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)",
              boxShadow: "var(--shadow)", overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "13px 18px",
                borderBottom: "1px solid var(--line)", background: "var(--surface-2)",
              }}
            >
              <div
                style={{
                  width: 30, height: 30, borderRadius: 9, background: "var(--surface)", border: "1px solid var(--line)",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-2)",
                }}
              >
                <Icon name="settings" size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.01em" }}>
                  Avtoservis
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                  {shopLabel(g.shopId)}
                </div>
              </div>
              <Badge tone="neutral">{g.members.length} ta xodim</Badge>
            </div>

            {g.members.map((s) => {
              const rb = ROLE_BADGE[roleFromProto(s.role)];
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex", alignItems: narrow ? "stretch" : "center",
                    flexDirection: narrow ? "column" : "row",
                    gap: narrow ? 11 : 13, padding: "12px 18px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0, flex: 1 }}>
                    <Avatar name={s.name || "?"} size={36} />
                    <div style={{ flex: "1 1 0", minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 650, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.name || "—"}
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.phone}</div>
                    </div>
                    <Badge tone={rb.tone}>{rb.label}</Badge>
                    <Badge tone={s.active ? "ok" : "neutral"} dot>{s.active ? "Faol" : "Faolsiz"}</Badge>
                  </div>
                  <RowActions staff={s} />
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
