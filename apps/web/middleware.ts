import { NextResponse, type NextRequest } from "next/server";

/**
 * Server-side gate for the POS. /pos itself is the sign-in entry (the shell
 * renders the login screen when unauthenticated), so we guard the *deeper*
 * /pos/* routes: without the auth marker, redirect to /pos to sign in. The real
 * security boundary is the HttpOnly session cookie + API-side enforcement on
 * every request; this just avoids serving inner POS routes to anonymous users.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/pos/") && !req.cookies.get("balm_authed")) {
    const url = req.nextUrl.clone();
    url.pathname = "/pos";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/pos/:path+"],
};
