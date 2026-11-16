import { hasTrustedPeer, readAccessConfig } from "@/features/access/config";
import { safeNext } from "@/features/access/gate";
import { classifyRequest } from "@/features/access/loopback";
import { getLimiters } from "@/features/access/rate-limit";
import { getSessionSecret } from "@/features/access/secret";
import {
  passcodeMatches,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  signSession,
} from "@/features/access/session";

/** POST /unlock/verify: checks the passcode and sets the session cookie. Plain form post, no JS needed. */
export async function POST(request: Request) {
  const to = (location: string, extra: Record<string, string> = {}) =>
    new Response(null, {
      status: 303,
      headers: { Location: location, "Cache-Control": "no-store", ...extra },
    });

  const config = readAccessConfig();
  if (config.state !== "ready") return to("/unlock/setup");

  // Refuse cross-site form posts.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return new Response("Cross-site request refused.", { status: 403 });
  }

  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? "/"));
  const back = (error: string, extra = "") =>
    to(`/unlock?error=${error}${extra}&next=${encodeURIComponent(next)}`);

  const { peer } = classifyRequest(request.headers, { trustedPeer: hasTrustedPeer() });
  const limiters = getLimiters();
  const wait = Math.max(limiters.peer.retryAfterSec(peer), limiters.all.retryAfterSec("*"));
  if (wait > 0) return back("locked", `&wait=${wait}`);

  const given = form.get("passcode");
  if (typeof given !== "string" || !passcodeMatches(given, config.passcode)) {
    limiters.peer.recordFailure(peer);
    limiters.all.recordFailure("*");
    return back("wrong");
  }

  limiters.peer.reset(peer);
  const secure = request.headers.get("x-forwarded-proto") === "https";
  const token = signSession({ secret: getSessionSecret(), passcode: config.passcode });
  const cookie = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  return to(next, { "Set-Cookie": cookie });
}
