import { NextRequest, NextResponse } from "next/server";

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://nginx:8080";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname === "/version-check" || pathname.startsWith("/lab")) {
    return NextResponse.next();
  }

  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/me`, {
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    });

    if (!res.ok) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Admin-only routes: keep the legacy /admin prefix in the guard so any
    // bookmark hitting old URLs gets blocked before the redirect (handled in
    // next.config) rewrites the path. The live admin section now lives under
    // /settings/global.
    if (pathname.startsWith("/admin") || pathname.startsWith("/settings/global")) {
      const data = await res.json();
      if (!data.roles || !data.roles.includes("ROLE_ADMIN")) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // `api` is excluded on purpose: those routes are rewrites proxied straight to
  // the backend, which already authenticates every request via the session
  // cookie. Running the `/api/me` guard in front of each one only added a
  // redundant, blocking round-trip per API call (562 call sites) and saturated
  // the backend workers. The middleware now only guards page navigations.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.svg).*)"],
};
