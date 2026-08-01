import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, parseSession } from "@/lib/session";
import { consoleWorker, homeFor } from "@/lib/perms";

// Routing by what a person may do. Owners live under the root console routes, mechanics under
// /m, and a worker given work beyond the board lives wherever their permissions reach.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = parseSession(req.cookies.get(SESSION_COOKIE)?.value);
  const role = session?.role;

  const home = homeFor(session);
  const redirect = (to: string) => NextResponse.redirect(new URL(to, req.url));

  // A customer's own check, opened by scanning the QR on their receipt. It belongs to
  // nobody signed in, so it is let through before any role routing below — otherwise
  // staff scanning a check would be bounced to their own home and never see it.
  if (pathname.startsWith("/c/")) return NextResponse.next();

  // Match areas by exact segment so "/menu" isn't caught by the "/m" prefix.
  const inMechanicArea = pathname === "/m" || pathname.startsWith("/m/");
  const inAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");

  // Not signed in → the public marketing site is the front door: the landing page ("/"),
  // the login screen, and the demo-request API are open; everything else bounces to /login.
  if (!role) {
    // /pending is reached only by someone whose code was accepted but whose account is not
    // active, so by definition they have no session and must be let through.
    const isPublic = pathname === "/" || pathname === "/login" || pathname === "/pending"
      || pathname.startsWith("/api/");
    return isPublic ? NextResponse.next() : redirect("/login");
  }

  // Signed in but on /login or root → send home.
  if (pathname === "/login" || pathname === "/") return redirect(home);

  // Admins live only in the admin area.
  if (role === "admin") return inAdminArea ? NextResponse.next() : redirect("/admin");

  // Non-admins cannot enter the admin area.
  if (inAdminArea) return redirect(home);

  // Owners must not enter the mechanic area.
  if (role === "owner") return inMechanicArea ? redirect("/dashboard") : NextResponse.next();

  // A worker with only board permissions stays on the board. One given more may use the
  // console — and may still open the mechanic app, because being trusted with the till does
  // not stop somebody also turning a spanner.
  if (!consoleWorker(session)) return inMechanicArea ? NextResponse.next() : redirect("/m");
  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, the fonts, and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
