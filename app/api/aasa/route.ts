// The Apple App Site Association file, served at /.well-known/apple-app-site-association
// (see the rewrite in next.config.mjs).
//
// It is what makes a shared link open the app instead of Safari. Apple is strict about how
// it is served and quiet about why it failed, so three things matter here and each has cost
// somebody a day at some point:
//
//   * application/json, with no .json on the path;
//   * HTTPS and no redirect of any kind — which is why middleware is told to leave
//     /.well-known alone, and why this is a rewrite rather than a redirect;
//   * no authentication, obviously, since iOS fetches it with nobody signed in.
//
// Both environments serve it from the same code, so staging and production agree. The app's
// own entitlements decide which domains it claims; this side simply answers for whichever
// host asked.
import { NextResponse } from "next/server";

export const dynamic = "force-static";

const AASA = {
  applinks: {
    details: [
      {
        appIDs: ["F5282GLRLF.com.autogaraj.mobile"],
        components: [
          { "/": "/s/*", comment: "one shop" },
          { "/": "/p/*", comment: "one campaign" },
          { "/": "/r/*", comment: "a referral invite" },
          // Reserved: new kinds of link go under /l/ so this file, and the app release that
          // ships with it, never have to change again to add one.
          { "/": "/l/*", comment: "reserved: link kinds added later go here, so this file never has to change again" },
        ],
      },
    ],
  },
  webcredentials: {
    apps: ["F5282GLRLF.com.autogaraj.mobile"],
  },
};

export function GET() {
  return NextResponse.json(AASA, {
    headers: {
      "Content-Type": "application/json",
      // iOS caches it, but a CDN or a browser holding a stale copy during an app rollout is
      // a long afternoon; an hour is short enough to fix a mistake and long enough to matter.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
