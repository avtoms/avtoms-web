// SSR: fetches the predefined property catalog on the server (incl. inactive) and
// renders the create form + editable rows. Mutations happen in the client island.
import { serverGet } from "@/lib/server-api";
import type { PropertyDefinition } from "@/lib/types";
import { Tags } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui-kit/card";
import { CreatePropertyForm, PropertyRow } from "./_form";

export const dynamic = "force-dynamic"; // always render fresh (depends on the session cookie)

export default async function PropertiesPage() {
  const data = await serverGet<{ definitions?: PropertyDefinition[] }>("/v1/admin/property-definitions");
  const defs = data?.definitions ?? [];

  return (
    <div className="flex flex-col gap-4">
      <CreatePropertyForm />
      <Card className="overflow-hidden">
        <CardHeader className="bg-secondary/40">
          <CardTitle><Tags className="size-[18px] text-muted-foreground" /> Xususiyatlar katalogi</CardTitle>
          <span className="text-[12.5px] font-semibold text-muted-foreground">{defs.length} ta</span>
        </CardHeader>
        {defs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Ma'lumot yo'q</div>
        ) : (
          defs.map((d) => <PropertyRow key={d.id} def={d} />)
        )}
      </Card>
    </div>
  );
}
