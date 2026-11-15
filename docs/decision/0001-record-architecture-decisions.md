# ADR-0001: Record architecture decisions as append-only ADRs

- Status: Accepted
- Date: 2026-11-15

## Context

Thoth is built by one person working with AI agents across many sessions. Each new session starts with no memory. Without a written record, agents re-open settled questions or "fix" deliberate choices.

## Decision

We record every significant decision as an ADR in `docs/decision/`. ADRs are **append-only**: a changed decision gets a new ADR that supersedes the old one. Only the `Status:` line of an old ADR may change. `CLAUDE.md` tells agents to read `docs/decision/README.md` before searching the code. CI enforces append-only with `tools/check-adr-append-only.sh`.

## Consequences

- History is complete. "Why is it like this?" has one place to look.
- Writing an ADR takes a few minutes per decision.
- The index in `docs/decision/README.md` must be kept in sync by hand.

## Alternatives considered

- Decisions in PR descriptions only. These are hard for agents to find and are lost if the host changes.
- One mutable decisions doc. It loses history and invites silent rewrites.
