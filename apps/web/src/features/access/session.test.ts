import { describe, expect, it } from "vitest";
import { passcodeMatches, signSession, verifySession } from "./session";

const key = { secret: "s3cret-key", passcode: "correct horse" };
const now = 1_000_000;

describe("session cookie", () => {
  it("verifies a freshly signed token", () => {
    expect(verifySession(signSession(key, now, 1000), key, now + 10)).toBe(true);
  });
  it("rejects an expired token", () => {
    expect(verifySession(signSession(key, now, 1000), key, now + 1000)).toBe(false);
  });
  it("rejects a tampered expiry", () => {
    const [v, , mac] = signSession(key, now, 1000).split(".");
    expect(verifySession(`${v}.${now + 9_999_999}.${mac}`, key, now)).toBe(false);
  });
  it("rejects a tampered mac", () => {
    const t = signSession(key, now, 1000);
    expect(verifySession(`${t.slice(0, -2)}xx`, key, now)).toBe(false);
  });
  it("rejects a token signed with another secret", () => {
    const t = signSession({ ...key, secret: "other" }, now, 1000);
    expect(verifySession(t, key, now)).toBe(false);
  });
  it("is invalidated when the passcode changes", () => {
    const t = signSession(key, now, 1000);
    expect(verifySession(t, { ...key, passcode: "new passcode" }, now)).toBe(false);
  });
  it.each([undefined, null, "", "garbage", "v1.1.", "v2.99999999.abc", "v1.NaN.abc", "a.b.c.d"])(
    "rejects malformed %s",
    (t) => expect(verifySession(t, key, now)).toBe(false),
  );
});

describe("passcodeMatches", () => {
  it("accepts the same passcode", () => expect(passcodeMatches("abc12345", "abc12345")).toBe(true));
  it("rejects a different or empty passcode", () => {
    expect(passcodeMatches("abc12346", "abc12345")).toBe(false);
    expect(passcodeMatches("", "abc12345")).toBe(false);
    expect(passcodeMatches("abc1234", "abc12345")).toBe(false);
  });
});
