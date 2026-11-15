# ADR-0002: Single-user, local-first, installable PWA

- Status: Accepted
- Date: 2026-11-15

## Context

Thoth is a personal alternative to YouLearn (see `docs/research/youlearn.md`). The owner wants to use either an Anthropic API key or their **Claude subscription** through headless Claude Code. The subscription path runs the logged-in `claude` CLI, so it only works on the owner's machine and may not be resold as a multi-user service.

## Decision

- Thoth runs **on the owner's Mac**, for **one user**. It has no accounts and no multi-tenancy.
- It is a **Progressive Web App**: installable on desktop, and reachable from the owner's phone over LAN or Tailscale.
- **An optional passcode** protects non-localhost access. This is planned for Phase 8.
- All data (SQLite and uploads) lives in `<repo>/data` by default (`THOTH_DATA_DIR`).

## Consequences

- There is no auth system, billing, or tenant isolation to build.
- The subscription-backed LLM provider is allowed.
- **If Thoth ever becomes multi-user,** a new ADR is needed. The ports and adapters design (ADR-0004) keeps that change local: swap the repositories, add an auth adapter, and drop the subscription provider.

## Alternatives considered

- Hosted SaaS. It conflicts with subscription use and adds auth and billing work.
- Native mobile app. Out of scope; a PWA covers the phone use case.
