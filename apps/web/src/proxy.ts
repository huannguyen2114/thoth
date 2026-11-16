import { type NextRequest, NextResponse } from "next/server";
import { hasTrustedPeer, readAccessConfig } from "@/features/access/config";
import { decide } from "@/features/access/gate";
import { getSessionSecret } from "@/features/access/secret";
import { SESSION_COOKIE } from "@/features/access/session";

/**
 * The passcode gate (docs/technical_design/14-phone-and-lan.md). Loopback passes; everyone else
 * needs the signed session cookie. Covers pages, API routes and Server Actions: all of them are
 * HTTP requests that reach this file first.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const decision = decide({
    pathname,
    search,
    method: request.method,
    headers: request.headers,
    cookie: request.cookies.get(SESSION_COOKIE)?.value,
    config: readAccessConfig(),
    secret: getSessionSecret,
    trustedPeer: hasTrustedPeer(),
  });

  switch (decision.kind) {
    case "allow":
      return NextResponse.next();
    case "redirect-unlock":
      return redirect(new URL(`/unlock?next=${encodeURIComponent(decision.next)}`, request.url));
    case "setup":
      return NextResponse.rewrite(new URL("/unlock/setup", request.url), {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    case "deny":
      return NextResponse.json(
        { error: decision.status === 401 ? "Unlock Thoth first." : "Remote access is not set up." },
        { status: decision.status, headers: { "Cache-Control": "no-store" } },
      );
  }
}

/** Next requires an absolute URL here; it is built from the host the phone used. */
function redirect(to: URL): NextResponse {
  return NextResponse.redirect(to, { status: 307, headers: { "Cache-Control": "no-store" } });
}

export const config = {
  // Hashed build assets are the only thing skipped; the gate itself allow-lists the rest.
  matcher: ["/((?!_next/static).*)"],
};
