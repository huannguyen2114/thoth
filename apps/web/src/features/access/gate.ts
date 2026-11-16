import type { AccessConfig } from "./config";
import { classifyRequest, type HeaderReader } from "./loopback";
import { verifySession } from "./session";

export type Decision =
  | { kind: "allow" }
  /** Send a browser to the unlock page. */
  | { kind: "redirect-unlock"; next: string }
  /** No usable passcode is configured: show the "how to set one" page. */
  | { kind: "setup" }
  | { kind: "deny"; status: 401 | 403 };

export interface GateInput {
  pathname: string;
  search: string;
  method: string;
  headers: HeaderReader;
  cookie: string | undefined;
  config: AccessConfig;
  secret: () => string;
  trustedPeer: boolean;
  now?: number;
}

/** Static, non-personal files that must load before sign-in (PWA install, unlock page assets). */
const PUBLIC_PREFIXES = ["/_next/static/", "/pwa-icon/"];
const PUBLIC_EXACT = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/sw.js",
  "/offline",
  "/unlock/setup",
];

function isPublicAsset(pathname: string, method: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  return PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Only the sign-in form itself. Matched exactly, so `/unlock/../x` style tricks gain nothing. */
function isUnlockEndpoint(pathname: string, method: string): boolean {
  if (pathname === "/unlock") return method === "GET" || method === "HEAD";
  if (pathname === "/unlock/verify") return method === "POST";
  return false;
}

function isNavigation(input: GateInput): boolean {
  if (input.method !== "GET" && input.method !== "HEAD") return false;
  if (input.pathname.startsWith("/api/")) return false;
  if (input.headers.get("next-action")) return false;
  const dest = input.headers.get("sec-fetch-mode");
  if (dest) return dest === "navigate";
  return (input.headers.get("accept") ?? "").includes("text/html");
}

/** Only same-origin absolute paths, never `//evil.test` or `/\evil.test`. */
export function safeNext(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value === "/unlock" || value.startsWith("/unlock/") || value.startsWith("/unlock?"))
    return "/";
  return value;
}

export function decide(input: GateInput): Decision {
  // The owner at the Mac is never prompted.
  if (classifyRequest(input.headers, { trustedPeer: input.trustedPeer }).local)
    return { kind: "allow" };

  // A Server Action can be invoked on any path with a `next-action` header, so it never counts
  // as public, whatever the path.
  const isAction = Boolean(input.headers.get("next-action"));

  if (input.config.state !== "ready") {
    if (!isAction && isPublicAsset(input.pathname, input.method)) return { kind: "allow" };
    return isNavigation(input) ? { kind: "setup" } : { kind: "deny", status: 403 };
  }

  if (
    !isAction &&
    (isPublicAsset(input.pathname, input.method) || isUnlockEndpoint(input.pathname, input.method))
  ) {
    return { kind: "allow" };
  }

  const key = { secret: input.secret(), passcode: input.config.passcode };
  if (verifySession(input.cookie, key, input.now)) return { kind: "allow" };

  if (isNavigation(input)) {
    return { kind: "redirect-unlock", next: safeNext(input.pathname + input.search) };
  }
  return { kind: "deny", status: 401 };
}
