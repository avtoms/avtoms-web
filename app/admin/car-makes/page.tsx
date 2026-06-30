// SSR: fetches makes on the server and renders the table. Mutations via the client form island.
import { serverGet } from "@/lib/server-api";
import type { CarMake } from "@/lib/types";
import { Icon } from "@/components/icons";
import { CreateMakeForm, MakeRow } from "./_form";

export const dynamic = "force-dynamic"; // always render fresh (depends on the session cookie)

export default async function CarMakesPage() {
  const data = await serverGet<{ makes?: CarMake[] }>("/v1/car-makes");
  const makes = data?.makes ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CreateMakeForm />
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)" }}>
          <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 9 }}>
            <Icon name="car" size={18} style={{ color: "var(--ink-3)" }} /> Markalar
          </h2>
          <span style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 600 }}>{makes.length} ta</span>
        </div>
        {makes.length === 0 ? (
          <div style={{ padding: 28, color: "var(--ink-3)", textAlign: "center", fontSize: 14 }}>Ma'lumot yo'q</div>
        ) : (
          makes.map((m, i) => <MakeRow key={m.id} make={m} last={i === makes.length - 1} />)
        )}
      </div>
    </div>
  );
}
