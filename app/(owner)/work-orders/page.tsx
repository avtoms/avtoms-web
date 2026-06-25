"use client";
// Work orders list (owner.jsx WorkOrdersPage): Segmented state filter + live list.
// The Create-WO flow lives in the shared layout header button (_create-wo.tsx).
import React, { useCallback, useEffect, useState } from "react";
import { Card, Segmented, Spinner, Empty } from "@/components/ui";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { WO_STATES, STATE_LABEL, type WoState } from "@/lib/enums";
import type { WorkOrder } from "@/lib/types";
import { WORow } from "../_shared";

export default function WorkOrdersPage() {
  const { session } = useAuth();
  const shopId = session!.staff.shopId;
  const { t } = useLang();
  const { toast } = useToast();

  const [filter, setFilter] = useState<"all" | WoState>("all");
  const [list, setList] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const filters = [{ value: "all", label: t("all") }, ...WO_STATES.map((s) => ({ value: s, label: t(STATE_LABEL[s]) }))];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await api.listWorkOrders(shopId, filter === "all" ? undefined : filter));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("error"), { icon: "alert", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [shopId, filter, t, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ overflowX: "auto", paddingBottom: 2 }}>
        <Segmented options={filters} value={filter} onChange={(v) => setFilter(v as "all" | WoState)} size="sm" style={{ flexWrap: "nowrap" }} />
      </div>
      <Card pad={0}>
        {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={24} /></div>
          : list.length === 0 ? <div style={{ padding: 24 }}><Empty icon="clipboard" /></div>
          : list.map((w) => <WORow key={w.id} wo={w} />)}
      </Card>
    </div>
  );
}
