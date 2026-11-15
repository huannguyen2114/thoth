# ADR-0007: Built-in manifest + a hand-written service worker

- Status: Accepted
- Date: 2026-11-15

## Context

Thoth must be installable (ADR-0002). Next.js 16 has built-in `app/manifest.ts` support and documents a plain service worker. PWA plugins such as Serwist add build integration that may lag Next 16 and Turbopack.

## Decision

- The manifest comes from `apps/web/src/app/manifest.ts`.
- Icons are generated at build time by `app/pwa-icon/[size]/route.tsx` using `ImageResponse`, until a logo exists.
- **A small hand-written `apps/web/public/sw.js`:**
  - cache-first for `/_next/static/*`;
  - network-only for pages, falling back to `/offline`.
- It is registered only in production builds, so dev is never stale.
- **Phase 6** (offline flashcard review) revisits this. If the caching rules grow complex, a new ADR may adopt Serwist or Workbox.

## Consequences

- There are zero extra dependencies, and the behaviour is easy to audit.
- Cache versioning is manual: bump `VERSION` in `sw.js` when its strategy changes.
