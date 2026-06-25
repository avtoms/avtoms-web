// SSR admin shell. Server component: reads the session on the server for the sidebar footer.
// Auth is enforced by middleware.ts (only ROLE_ADMIN reaches /admin/*).
// Responsive rendering (desktop grid vs. mobile drawer) lives in the _shell client island,
// keeping this layout a server component. Active nav + page title live in the _nav island.
import { getServerSession } from "@/lib/server-api";
import { AdminShell } from "./_shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  const name = session?.staff?.name || "Administrator";
  const phone = session?.staff?.phone || "";
  return (
    <AdminShell name={name} phone={phone}>
      {children}
    </AdminShell>
  );
}
