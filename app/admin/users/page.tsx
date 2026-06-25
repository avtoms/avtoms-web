// SSR Users management: fetches all staff across shops, then hands off to the client
// UsersList island for search + grouping + per-row mutations.
import { serverGet } from "@/lib/server-api";
import type { Staff } from "@/lib/types";
import { UsersList } from "./_list";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const data = await serverGet<{ staff?: Staff[] }>("/v1/admin/staff");
  const staff = data?.staff ?? [];
  return <UsersList staff={staff} />;
}
