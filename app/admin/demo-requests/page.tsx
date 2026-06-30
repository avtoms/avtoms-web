// SSR: super-admin inbox of demo/sales leads submitted from the public landing page.
// Mutations (status changes) go through the client island.
import { serverGet } from "@/lib/server-api";
import type { DemoRequest } from "@/lib/types";
import { Icon } from "@/components/icons";
import { DemoRow } from "./_rows";

export const dynamic = "force-dynamic"; // always fresh (depends on the session cookie)

export default async function DemoRequestsPage() {
  const data = await serverGet<{ requests?: DemoRequest[] }>("/v1/admin/demo-requests");
  const requests = data?.requests ?? [];
  const open = requests.filter((r) => r.status !== "closed").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)" }}>
          <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 9 }}>
            <Icon name="bell" size={18} style={{ color: "var(--ink-3)" }} /> Demo so'rovlari
          </h2>
          <span style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 600 }}>{open} ochiq · {requests.length} jami</span>
        </div>
        {requests.length === 0 ? (
          <div style={{ padding: 28, color: "var(--ink-3)", textAlign: "center", fontSize: 14 }}>Hozircha so'rovlar yo'q</div>
        ) : (
          requests.map((r, i) => <DemoRow key={r.id} req={r} last={i === requests.length - 1} />)
        )}
      </div>
    </div>
  );
}
