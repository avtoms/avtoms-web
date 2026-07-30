import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, parseSession } from "@/lib/session";

// Role-based routing: owners live under the root console routes, mechanics under /m.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = parseSession(req.cookies.get(SESSION_COOKIE)?.value);
  const role = session?.role;

  const home = role === "mechanic" ? "/m" : role === "admin" ? "/admin" : "/dashboard";
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

  // Signed in but on /login or root → send to role home.
  if (pathname === "/login" || pathname === "/") return redirect(home);

  // Admins live only in the admin area.
  if (role === "admin") return inAdminArea ? NextResponse.next() : redirect("/admin");

  // Non-admins cannot enter the admin area.
  if (inAdminArea) return redirect(home);

  // Mechanics are confined to the mechanic area.
  if (role === "mechanic" && !inMechanicArea) return redirect("/m");

  // Owners must not enter the mechanic area.
  if (role === "owner" && inMechanicArea) return redirect("/dashboard");

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, the fonts, and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
