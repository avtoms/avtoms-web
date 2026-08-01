// SSR: super-admin inbox of demo/sales leads submitted from the public landing page.
// Mutations (status changes) go through the client island.
import { serverGet } from "@/lib/server-api";
import { T } from "@/components/t";
import type { DemoRequest } from "@/lib/types";
import { Inbox } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui-kit/card";
import { DemoRow } from "./_rows";

export const dynamic = "force-dynamic"; // always fresh (depends on the session cookie)

export default async function DemoRequestsPage() {
  const data = await serverGet<{ requests?: DemoRequest[] }>("/v1/admin/demo-requests");
  const requests = data?.requests ?? [];
  const open = requests.filter((r) => r.status !== "closed").length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-secondary/40">
        <CardTitle><Inbox className="size-[18px] text-muted-foreground" /> <T k="a_demo" /></CardTitle>
        <span className="text-[12.5px] font-semibold text-muted-foreground">{open} <T k="a_open_low" /> · {requests.length} <T k="a_total_low" /></span>
      </CardHeader>
      {requests.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground"><T k="a_no_demo" /></div>
      ) : (
        requests.map((r, i) => <DemoRow key={r.id} req={r} last={i === requests.length - 1} />)
      )}
    </Card>
  );
}
