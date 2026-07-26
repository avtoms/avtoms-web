// SSR: fetches brand + category term lists on the server and renders a create form
// and editable rows for each. Mutations happen in the client island.
import { serverGet } from "@/lib/server-api";
import type { CatalogTerm } from "@/lib/types";
import { Tag, FolderTree } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui-kit/card";
import { CreateTermForm, TermRow } from "./_form";

export const dynamic = "force-dynamic"; // always render fresh (depends on the session cookie)

export default async function CatalogPage() {
  const [brandData, catData] = await Promise.all([
    serverGet<{ terms?: CatalogTerm[] }>("/v1/admin/catalog-terms?type=brand"),
    serverGet<{ terms?: CatalogTerm[] }>("/v1/admin/catalog-terms?type=category"),
  ]);
  const brands = brandData?.terms ?? [];
  const categories = catData?.terms ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <CreateTermForm type="brand" label="Yangi brend qo'shish" placeholder="Bosch, Shell..." />
        <Card className="overflow-hidden">
          <CardHeader className="bg-secondary/40">
            <CardTitle><Tag className="size-[18px] text-muted-foreground" /> Brendlar</CardTitle>
            <span className="text-[12.5px] font-semibold text-muted-foreground">{brands.length} ta</span>
          </CardHeader>
          {brands.length === 0
            ? <div className="px-5 py-8 text-center text-sm text-muted-foreground">Ma'lumot yo'q</div>
            : brands.map((t) => <TermRow key={t.id} term={t} />)}
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        <CreateTermForm type="category" label="Yangi turkum qo'shish" placeholder="Moylar, Filtrlar..." />
        <Card className="overflow-hidden">
          <CardHeader className="bg-secondary/40">
            <CardTitle><FolderTree className="size-[18px] text-muted-foreground" /> Turkumlar</CardTitle>
            <span className="text-[12.5px] font-semibold text-muted-foreground">{categories.length} ta</span>
          </CardHeader>
          {categories.length === 0
            ? <div className="px-5 py-8 text-center text-sm text-muted-foreground">Ma'lumot yo'q</div>
            : categories.map((t) => <TermRow key={t.id} term={t} />)}
        </Card>
      </div>
    </div>
  );
}
