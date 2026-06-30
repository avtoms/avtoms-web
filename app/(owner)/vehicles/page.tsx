"use client";
// Cars (owner): a shop-wide directory of every vehicle with its owner's name & phone.
// Cars are only otherwise visible inside a customer's detail; this surfaces them as their
// own searchable tab. Loads api.listShopVehicles + api.listCustomers and joins owner names
// by customerId. A row deep-links to the owner (customers?focus=<id>).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Btn, Spinner, Empty, TextInput } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import type { Customer, Vehicle } from "@/lib/types";
import { PlatePreview } from "@/components/plate";
import { CarImage } from "@/components/car-image";
import { VehicleHistoryModal } from "@/components/vehicle-history";

export default function VehiclesPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();
  const router = useRouter();

  const [q, setQ] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [owners, setOwners] = useState<Record<string, Customer>>({});
  const [hist, setHist] = useState<Vehicle | null>(null);

  const load = useCallback(async () => {
    setVehicles(null);
    try {
      const [vs, cs] = await Promise.all([api.listShopVehicles(shopId), api.listCustomers(shopId)]);
      const map: Record<string, Customer> = {};
      for (const c of cs) map[c.id] = c;
      setOwners(map);
      setVehicles(vs);
    } catch (e) {
      setVehicles([]);
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    }
  }, [shopId, t, toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return vehicles ?? [];
    const squash = (s: string) => s.toLowerCase().replace(/\s+/g, ""); // space-insensitive plate match
    const needleSquashed = squash(needle);
    return (vehicles ?? []).filter((v) => {
      const o = owners[v.customerId];
      const text = [v.make, v.model, o?.name, o?.phone].filter(Boolean).join(" ").toLowerCase();
      return text.includes(needle) || squash(v.plate || "").includes(needleSquashed);
    });
  }, [vehicles, owners, q]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ position: "relative" }}>
        <Icon name="search" size={17} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }} />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search") + "…"} style={{ paddingLeft: 38 }} />
      </div>
      <Card pad={0}>
        {vehicles === null ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={24} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24 }}><Empty icon="car" /></div>
        ) : filtered.map((v) => {
          const o = owners[v.customerId];
          const car = [v.make, v.model].filter(Boolean).join(" ") || t("vehicle");
          return (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px 10px 18px", borderBottom: "1px solid var(--line)" }}>
              {/* main area → open this car's full history (service + warranties) */}
              <button
                onClick={() => setHist(v)}
                className="an-row-btn"
                style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 13, border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left", padding: "3px 0" }}
              >
                <CarImage src={v.imageUrl} make={v.make} size={44} radius={11} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{car}{v.year ? ` (${v.year})` : ""}</span>
                    {v.plate && <PlatePreview plate={v.plate} size="sm" />}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 3, display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <Icon name="users" size={13} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {o ? (o.walkIn ? t("walk_in") : o.name) : "—"}{o?.phone ? " · " + o.phone : ""}
                    </span>
                  </div>
                </div>
              </button>
              {/* jump to the owner's card */}
              {o && <Btn variant="ghost" size="sm" icon="users" aria-label={t("nav_customers")} onClick={() => router.push(`/customers?focus=${o.id}`)} />}
            </div>
          );
        })}
      </Card>
      <VehicleHistoryModal vehicle={hist} shopId={shopId} onClose={() => setHist(null)} />
    </div>
  );
}
