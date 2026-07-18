// SSR: fetches makes + models on the server. Make names resolved for display.
import { serverGet } from "@/lib/server-api";
import type { CarMake, CarModel } from "@/lib/types";
import { CreateModelForm } from "./_form";
import { ModelsTable, type ModelRow } from "./_table";

export const dynamic = "force-dynamic";

export default async function CarModelsPage() {
  const [makesData, modelsData] = await Promise.all([
    serverGet<{ makes?: CarMake[] }>("/v1/car-makes"),
    serverGet<{ models?: CarModel[] }>("/v1/car-models"),
  ]);
  const makes = makesData?.makes ?? [];
  const models = modelsData?.models ?? [];
  const makeName = (id: string) => makes.find((m) => m.id === id)?.name ?? "—";

  const rows: ModelRow[] = models.map((m) => ({
    id: m.id,
    makeName: makeName(m.makeId),
    name: m.name,
    bodyType: m.bodyType || "",
  }));

  return (
    <div className="flex flex-col gap-4">
      <CreateModelForm makes={makes} />
      <ModelsTable rows={rows} />
    </div>
  );
}
