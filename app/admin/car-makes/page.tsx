// SSR: fetches makes on the server and renders the table. Mutations via the client form island.
import { serverGet } from "@/lib/server-api";
import type { CarMake } from "@/lib/types";
import { Car } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui-kit/card";
import { CreateMakeForm, MakeRow } from "./_form";
import { T } from "@/components/t";

export const dynamic = "force-dynamic"; // always render fresh (depends on the session cookie)

export default async function CarMakesPage() {
  const data = await serverGet<{ makes?: CarMake[] }>("/v1/car-makes");
  const makes = data?.makes ?? [];

  return (
    <div className="flex flex-col gap-4">
      <CreateMakeForm />
      <Card className="overflow-hidden">
        <CardHeader className="bg-secondary/40">
          <CardTitle><Car className="size-[18px] text-muted-foreground" /> <T k="a_makes" /></CardTitle>
          <span className="text-[12.5px] font-semibold text-muted-foreground">{makes.length} <T k="a_count" /></span>
        </CardHeader>
        {makes.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground"><T k="empty" /></div>
        ) : (
          makes.map((m) => <MakeRow key={m.id} make={m} />)
        )}
      </Card>
    </div>
  );
}
