import { describe, expect, it } from "vitest";
import type { AccessConfig } from "./config";
import { decide, type GateInput, safeNext } from "./gate";
import { signSession } from "./session";

const passcode = "correct horse";
const secret = "k";
const ready: AccessConfig = { state: "ready", passcode };
const headers = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const remote = {
  "x-thoth-peer": "192.168.1.9",
  host: "192.168.1.2:3214",
  "sec-fetch-mode": "navigate",
};
const localH = { "x-thoth-peer": "127.0.0.1", host: "localhost:3214" };

function run(over: Partial<GateInput> & { h?: Record<string, string> }) {
  const { h, ...rest } = over;
  return decide({
    pathname: "/",
    search: "",
    method: "GET",
    headers: headers(h ?? remote),
    cookie: undefined,
    config: ready,
    secret: () => secret,
    trustedPeer: true,
    ...rest,
  });
}

describe("gate", () => {
  it("never prompts loopback, even for API routes", () => {
    expect(run({ h: localH })).toEqual({ kind: "allow" });
    expect(run({ h: localH, pathname: "/api/chat", method: "POST" })).toEqual({ kind: "allow" });
    expect(run({ h: localH, config: { state: "unset" } })).toEqual({ kind: "allow" });
  });
  it("redirects a remote page request to /unlock with a safe next", () => {
    expect(run({ pathname: "/review", search: "?a=1" })).toEqual({
      kind: "redirect-unlock",
      next: "/review?a=1",
    });
  });
  it("blocks remote API and Server Action requests without the cookie", () => {
    expect(run({ pathname: "/api/content", h: { ...remote, "sec-fetch-mode": "cors" } })).toEqual({
      kind: "deny",
      status: 401,
    });
    expect(run({ method: "POST", h: { ...remote, "next-action": "abc" } })).toEqual({
      kind: "deny",
      status: 401,
    });
  });
  it("does not let a Server Action ride on a public path", () => {
    expect(
      run({ method: "POST", pathname: "/unlock/verify", h: { ...remote, "next-action": "abc" } }),
    ).toEqual({ kind: "deny", status: 401 });
    expect(
      run({
        method: "GET",
        pathname: "/_next/static/x.js",
        h: { ...remote, "next-action": "abc" },
      }),
    ).toEqual({ kind: "deny", status: 401 });
  });
  it("allows only the sign-in endpoints and static assets without a cookie", () => {
    expect(run({ pathname: "/unlock" })).toEqual({ kind: "allow" });
    expect(run({ pathname: "/unlock/verify", method: "POST" })).toEqual({ kind: "allow" });
    expect(run({ pathname: "/manifest.webmanifest" })).toEqual({ kind: "allow" });
    expect(run({ pathname: "/_next/static/chunk.js" })).toEqual({ kind: "allow" });
    expect(run({ pathname: "/unlock/verify", method: "GET" }).kind).not.toBe("allow");
    expect(run({ pathname: "/unlock", method: "POST" })).toEqual({ kind: "deny", status: 401 });
  });
  it("lets a valid cookie through and rejects a bad one", () => {
    const good = signSession({ secret, passcode });
    expect(run({ cookie: good, pathname: "/api/chat", method: "POST" })).toEqual({ kind: "allow" });
    expect(run({ cookie: `${good}x` }).kind).toBe("redirect-unlock");
    expect(run({ cookie: signSession({ secret: "other", passcode }) }).kind).toBe(
      "redirect-unlock",
    );
  });
  it("fails closed when no passcode is set or it is too short", () => {
    expect(run({ config: { state: "unset" } })).toEqual({ kind: "setup" });
    expect(run({ config: { state: "too-short" } })).toEqual({ kind: "setup" });
    expect(
      run({
        config: { state: "unset" },
        pathname: "/api/content",
        h: { ...remote, "sec-fetch-mode": "cors" },
      }),
    ).toEqual({ kind: "deny", status: 403 });
    expect(run({ config: { state: "unset" }, pathname: "/unlock/verify", method: "POST" })).toEqual(
      { kind: "deny", status: 403 },
    );
    expect(run({ config: { state: "unset" }, pathname: "/unlock/setup" })).toEqual({
      kind: "allow",
    });
  });
  it("untrusted mode: a forged x-forwarded-for from the LAN is still seen as that address", () => {
    const d = run({
      trustedPeer: false,
      h: { "x-forwarded-for": "192.168.1.9", host: "192.168.1.2", "sec-fetch-mode": "navigate" },
    });
    expect(d.kind).toBe("redirect-unlock");
  });
});

describe("safeNext", () => {
  it("keeps local paths and rejects open redirects", () => {
    expect(safeNext("/spaces/1?x=2")).toBe("/spaces/1?x=2");
    for (const bad of [
      "//evil.test",
      "/\\evil.test",
      "https://evil.test",
      "evil",
      "",
      null,
      undefined,
      "/unlock",
      "/unlock/verify",
    ]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
