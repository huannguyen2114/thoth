import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "thoth_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const VERSION = "v1";

function mac(secret: string, passcode: string, exp: number): string {
  // Binding the passcode hash means changing THOTH_PASSCODE signs everyone out.
  const bound = createHash("sha256").update(passcode).digest("hex");
  return createHmac("sha256", secret).update(`${VERSION}.${exp}.${bound}`).digest("base64url");
}

export interface SessionKey {
  secret: string;
  passcode: string;
}

/** Cookie value: `v1.<expiry ms>.<hmac>`. Carries no user data, only proof of a past unlock. */
export function signSession(key: SessionKey, now = Date.now(), ttlMs = SESSION_TTL_MS): string {
  const exp = now + ttlMs;
  return `${VERSION}.${exp}.${mac(key.secret, key.passcode, exp)}`;
}

export function verifySession(
  token: string | undefined | null,
  key: SessionKey,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const exp = Number(parts[1]);
  if (!Number.isSafeInteger(exp) || exp <= now) return false;
  const expected = Buffer.from(mac(key.secret, key.passcode, exp));
  const given = Buffer.from(parts[2] ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Constant-time passcode compare: hash both sides so lengths match and nothing leaks. */
export function passcodeMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
