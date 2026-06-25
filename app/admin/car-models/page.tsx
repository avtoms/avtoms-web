// SSR: fetches makes + models on the server. Make names resolved for display.
import { serverGet } from "@/lib/server-api";
import type { CarMake, CarModel } from "@/lib/types";
import { Icon } from "@/components/icons";
import { CreateModelForm } from "./_form";

export const dynamic = "force-dynamic";

export default async function CarModelsPage() {
  const [makesData, modelsData] = await Promise.all([
    serverGet<{ makes?: CarMake[] }>("/v1/car-makes"),
    serverGet<{ models?: CarModel[] }>("/v1/car-models"),
  ]);
  const makes = makesData?.makes ?? [];
  const models = modelsData?.models ?? [];
  const makeName = (id: string) => makes.find((m) => m.id === id)?.name ?? "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CreateModelForm makes={makes} />
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)" }}>
          <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 9 }}>
            <Icon name="list" size={18} style={{ color: "var(--ink-3)" }} /> Modellar
          </h2>
          <span style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 600 }}>{models.length} ta</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 420 }}>
            <div style={{ display: "flex", padding: "10px 18px", borderBottom: "1px solid var(--line)", fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Marka</div>
              <div style={{ flex: 2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Model</div>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Kuzov</div>
            </div>
            {models.length === 0 ? (
              <div style={{ padding: 28, color: "var(--ink-3)", textAlign: "center", fontSize: 14 }}>Ma'lumot yo'q</div>
            ) : (
              models.map((m, i) => (
                <div key={m.id} className="an-row-btn" style={{ display: "flex", alignItems: "center", padding: "13px 18px", borderBottom: i === models.length - 1 ? "none" : "1px solid var(--line)", fontSize: 14.5 }}>
                  <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-2)" }}>{makeName(m.makeId)}</div>
                  <div style={{ flex: 2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: "var(--ink)" }}>{m.name}</div>
                  <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-2)" }}>{m.bodyType || "—"}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
