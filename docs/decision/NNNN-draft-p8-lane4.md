# ADR-NNNN (draft): Passcode gate for non-local access, with a peer-stamping LAN server

- Status: Proposed (draft from Phase 8 Lane 4; the orchestrator assigns the number)
- Date: 2026-11-16

## Context

Phase 8 lets the owner open Thoth from a phone over the LAN or Tailscale. Thoth has no accounts (ADR-0002), and its API can run the LLM with the owner's key, so an open port is a security hole. Next.js 16's `proxy.ts` cannot see the TCP socket, and it fills `x-forwarded-for` only when the client sent none, so "is this request from localhost?" cannot be answered safely from headers alone.

## Decision

1. **One gate in `src/proxy.ts`** covers pages, API routes and Server Actions. Local requests pass. Others need a signed session cookie or are redirected to `/unlock` (pages) or refused with 401 (everything else). A `next-action` header disqualifies any public path.
2. **Fail closed.** Without `THOTH_PASSCODE` (8+ characters), non-local requests get an explainer page and no data.
3. **Session**: stateless HMAC-SHA256 cookie (`httpOnly`, `SameSite=Lax`, 30 days) bound to a hash of the passcode. Secret from `THOTH_SECRET` or a random file under the data dir. No session table.
4. **Rate limit**: in memory, 5 failures per peer and 30 total per 15 minutes.
5. **Trusted peer**: `pnpm start:lan` runs `apps/web/scripts/lan-server.mjs`, a small custom Next server that overwrites `x-thoth-peer` and `x-thoth-proxied` from the real socket and sets `THOTH_TRUSTED_PEER=1`. Plain `next dev` and `next start` fall back to forgeable headers and must not be exposed to a network.
6. **Local** means loopback peer, loopback Host and no forwarding headers, so local reverse proxies such as `tailscale serve` do not turn remote traffic into "local".

## Consequences

- One extra file outside the Next build (`lan-server.mjs`), and the LAN path needs `pnpm start:lan` rather than `pnpm dev`.
- Changing the passcode signs out every device. There is no per-device revocation (single user).
- Plain http on Wi-Fi exposes the passcode to people on that network; Tailscale avoids that.
- A custom server stops Next from adding its own socket-based forwarding header, which is why the gate stamps its own.
