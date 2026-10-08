import { NextResponse, type NextRequest } from "next/server";
import { COMPANY } from "@/lib/company";

/**
 * Server-side gate for the POS. /pos itself is the sign-in entry (the shell
 * renders the login screen when unauthenticated), so we guard the *deeper*
 * /pos/* routes: without a session cookie, redirect to /pos to sign in.
 *
 * The cookie checked is the API's own HttpOnly session cookie (the API shares
 * the site's host in production), not a marker written by page JavaScript, so
 * a script cannot replace it and it ends with the session. The real security
 * boundary is still the API, which validates the session on every request;
 * this only avoids serving inner POS routes to anonymous visitors.
 */
const SESSION_COOKIES = ["balm_session", "__Host-balm_session"];

/**
 * /pos on the host the visitor actually used. Under `next start -H 127.0.0.1`,
 * req.nextUrl carries the server's own address (localhost:<port>), so a redirect
 * built from it would send staff to localhost; the Host header from the proxy
 * names the public site. req.nextUrl.protocol already follows X-Forwarded-Proto.
 * Host is client-controlled, so it is used only when it names this site or a
 * local address (dev, the offline counter-PC edition); any other value gets
 * the public site, and the redirect can never point somewhere else.
 */
function signInUrl(req: NextRequest): URL {
  const path = `/pos${req.nextUrl.search}`;
  const host = req.headers.get("host");
  if (host && isOwnHost(host)) {
    try {
      return new URL(path, `${req.nextUrl.protocol}//${host}`);
    } catch {
      // Malformed Host header: use the public site.
    }
  }
  return new URL(path, `https://${COMPANY.domain}`);
}

function isOwnHost(host: string): boolean {
  const name = host.toLowerCase().replace(/:\d+$/, "");
  return (
    name === COMPANY.domain ||
    name === "localhost" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(name) ||
    /^\[[0-9a-f:.]+\]$/.test(name)
  );
}

export function middleware(req: NextRequest) {
  const signedIn = SESSION_COOKIES.some((name) => Boolean(req.cookies.get(name)?.value));
  if (req.nextUrl.pathname.startsWith("/pos/") && !signedIn) {
    return NextResponse.redirect(signInUrl(req));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/pos/:path+"],
};
