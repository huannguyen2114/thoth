/**
 * Who is calling? Decides whether a request is "local" (the owner at the Mac) or remote.
 * Pure functions, no Next imports, so they are unit-tested (ADR in docs/decision/0027-passcode-gate-and-lan-server.md).
 *
 * Two modes:
 * - **trusted**: the request came through `apps/web/scripts/lan-server.mjs`, which overwrites
 *   `x-thoth-peer` and `x-thoth-proxied` from the real socket on every request. A client cannot forge them.
 * - **untrusted** (plain `next dev` / `next start`): the only signal is `x-forwarded-for`, which a
 *   remote client could forge. That is safe only because `dev` and `start` bind to 127.0.0.1
 *   (apps/web/package.json), so no other device can reach them at all. The integration test found a
 *   forged-loopback bypass when they bound to every interface. Never add `-H 0.0.0.0` to them:
 *   use `pnpm start:lan`, the only way to serve other devices.
 */

export interface HeaderReader {
  get(name: string): string | null;
}

/** Strips brackets and ports: "[::1]:3214" -> "::1", "localhost:80" -> "localhost". */
export function normalizeHost(value: string): string {
  const v = value.trim().toLowerCase();
  if (v.startsWith("[")) {
    const end = v.indexOf("]");
    return end === -1 ? v : v.slice(1, end);
  }
  // "host:port" has exactly one colon; a bare IPv6 address has several.
  const colons = v.split(":").length - 1;
  return colons === 1 ? v.slice(0, v.indexOf(":")) : v;
}

export function isLoopbackAddress(value: string | null | undefined): boolean {
  if (!value) return false;
  const host = normalizeHost(value);
  if (host === "localhost" || host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  const v4 = host.startsWith("::ffff:") ? host.slice("::ffff:".length) : host;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v4);
  if (!m) return false;
  const octets = m.slice(1).map(Number);
  return octets.every((n) => n <= 255) && octets[0] === 127;
}

export interface ClientInfo {
  /** True only for the owner at this machine: loopback peer, loopback Host, nobody forwarding. */
  local: boolean;
  /** Best-known peer address, used as the rate-limit key. */
  peer: string;
}

export function classifyRequest(h: HeaderReader, opts: { trustedPeer: boolean }): ClientInfo {
  const hostOk = isLoopbackAddress(h.get("host"));
  if (opts.trustedPeer) {
    const peer = h.get("x-thoth-peer") ?? "";
    const proxied = h.get("x-thoth-proxied") === "1";
    return { local: isLoopbackAddress(peer) && !proxied && hostOk, peer: peer || "unknown" };
  }
  const entries = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const local = entries.length > 0 && entries.every(isLoopbackAddress) && hostOk;
  return { local, peer: entries[entries.length - 1] ?? "unknown" };
}
