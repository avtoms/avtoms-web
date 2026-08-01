// SSR: fetches brand + category term lists on the server and renders a create form
// and editable rows for each. Mutations happen in the client island.
import { serverGet } from "@/lib/server-api";
import type { CatalogTerm } from "@/lib/types";
import { Tag, FolderTree } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui-kit/card";
import { CreateTermForm, TermRow } from "./_form";
import { T } from "@/components/t";

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
        <CreateTermForm type="brand" labelKey="a_new_brand" placeholder="Bosch, Shell..." />
        <Card className="overflow-hidden">
          <CardHeader className="bg-secondary/40">
            <CardTitle><Tag className="size-[18px] text-muted-foreground" /> <T k="a_brands" /></CardTitle>
            <span className="text-[12.5px] font-semibold text-muted-foreground">{brands.length} <T k="a_count" /></span>
          </CardHeader>
          {brands.length === 0
            ? <div className="px-5 py-8 text-center text-sm text-muted-foreground"><T k="empty" /></div>
            : brands.map((t) => <TermRow key={t.id} term={t} />)}
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        <CreateTermForm type="category" labelKey="a_new_category" placeholderKey="a_ph_categories" />
        <Card className="overflow-hidden">
          <CardHeader className="bg-secondary/40">
            <CardTitle><FolderTree className="size-[18px] text-muted-foreground" /> <T k="a_categories" /></CardTitle>
            <span className="text-[12.5px] font-semibold text-muted-foreground">{categories.length} <T k="a_count" /></span>
          </CardHeader>
          {categories.length === 0
            ? <div className="px-5 py-8 text-center text-sm text-muted-foreground"><T k="empty" /></div>
            : categories.map((t) => <TermRow key={t.id} term={t} />)}
        </Card>
      </div>
    </div>
  );
}
