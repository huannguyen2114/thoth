import { describe, expect, it } from "vitest";
import { classifyRequest, isLoopbackAddress } from "./loopback";

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });

describe("isLoopbackAddress", () => {
  it.each([
    "127.0.0.1",
    "127.9.9.9",
    "::1",
    "[::1]:3214",
    "localhost",
    "localhost:3214",
    "::ffff:127.0.0.1",
    "127.0.0.1:80",
  ])("accepts %s", (v) => expect(isLoopbackAddress(v)).toBe(true));
  it.each([
    "192.168.1.5",
    "100.64.0.9",
    "10.0.0.1",
    "128.0.0.1",
    "127.0.0.1.evil.test",
    "evil.test",
    "",
    "::ffff:10.0.0.1",
    "999.0.0.1",
  ])("rejects %s", (v) => expect(isLoopbackAddress(v)).toBe(false));
  it("rejects null and undefined", () => {
    expect(isLoopbackAddress(null)).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });
});

describe("classifyRequest (trusted peer)", () => {
  const trusted = { trustedPeer: true };
  it("local for a loopback socket and host", () => {
    expect(
      classifyRequest(
        h({ "x-thoth-peer": "127.0.0.1", "x-thoth-proxied": "0", host: "localhost:3214" }),
        trusted,
      ).local,
    ).toBe(true);
  });
  it("remote for a LAN socket even if the client forged Host", () => {
    expect(
      classifyRequest(h({ "x-thoth-peer": "192.168.1.9", host: "localhost:3214" }), trusted).local,
    ).toBe(false);
  });
  it("remote when a local reverse proxy (tailscale serve) forwarded the request", () => {
    expect(
      classifyRequest(
        h({ "x-thoth-peer": "127.0.0.1", "x-thoth-proxied": "1", host: "mac.tail1234.ts.net" }),
        trusted,
      ).local,
    ).toBe(false);
  });
  it("remote when the peer header is missing", () => {
    expect(classifyRequest(h({ host: "localhost" }), trusted)).toEqual({
      local: false,
      peer: "unknown",
    });
  });
  it("ignores a forged x-forwarded-for", () => {
    expect(
      classifyRequest(
        h({ "x-thoth-peer": "192.168.1.9", "x-forwarded-for": "127.0.0.1", host: "localhost" }),
        trusted,
      ).local,
    ).toBe(false);
  });
});

describe("classifyRequest (untrusted)", () => {
  const untrusted = { trustedPeer: false };
  it("local for loopback x-forwarded-for and host", () => {
    expect(
      classifyRequest(h({ "x-forwarded-for": "::1", host: "localhost:3214" }), untrusted).local,
    ).toBe(true);
  });
  it("remote for a LAN address", () => {
    expect(
      classifyRequest(h({ "x-forwarded-for": "192.168.1.9", host: "192.168.1.2:3214" }), untrusted)
        .local,
    ).toBe(false);
  });
  it("remote when any hop is not loopback", () => {
    expect(
      classifyRequest(
        h({ "x-forwarded-for": "127.0.0.1, 192.168.1.9", host: "localhost" }),
        untrusted,
      ).local,
    ).toBe(false);
  });
  it("remote when the header is missing", () => {
    expect(classifyRequest(h({ host: "localhost" }), untrusted).local).toBe(false);
  });
});
