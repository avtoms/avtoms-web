// SSR: the registry of services. Until shops became real records this page could not exist —
// a shop_id was a bare UUID with no name behind it, and a service came into being only as a
// side effect of somebody's first sign-in.
import { serverGet } from "@/lib/server-api";
import type { Shop } from "@/lib/types";
import { ShopsList } from "./_list";

export const dynamic = "force-dynamic"; // depends on the session cookie

export default async function AdminShopsPage() {
  const data = await serverGet<{ shops?: Shop[] }>("/v1/admin/shops");
  return <ShopsList initial={data?.shops ?? []} />;
}
