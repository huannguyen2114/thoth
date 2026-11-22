# ADR-0044: A static landing site, one content source and a freshness gate

- Status: Accepted
- Date: 2026-11-21
- Builds on: ADR-0009, ADR-0028, ADR-0036

## Context

Thoth needs a public page that says what it is and lets people download it. Product pages go stale quickly: features ship, screens change, and the page keeps showing last year's app. The owner asked for a page in the spirit of tinycast.dev, getdroppy.app and youlearn.ai, and for a rule that keeps it current.

## Decision

1. **`apps/site` is a static Next.js 16 site** (`output: "export"`). It uses the Hearth tokens and components from `@thoth/ui`, so it looks like the app it describes. It has no server, analytics, cookies or trackers. Fonts are self-hosted by `next/font`, so the page makes no third-party requests.
2. **Cloudflare Pages hosts it** (`*.pages.dev` for now). `.github/workflows/site.yml` deploys from `main` with `wrangler pages deploy`. The deploy runs only when the repo has the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets; otherwise the built site is uploaded as an artifact.
3. **One content source.** `apps/site/content/site.ts` holds the features, FAQ and download targets, validated with zod. Two things are read at build time, never typed:
   - the version, from `apps/desktop/src-tauri/tauri.conf.json`;
   - "What's new", from the `DONE` phases in `docs/plan/roadmap.md`.
4. **Screenshots are generated.**
   - `apps/web/e2e/site-shots.ts` drives the app with the scripted LLM (ADR-0028) and saves every screenshot in light and dark.
   - CI regenerates them before each deploy, so the live page always shows the current UI.
   - The committed copies are only for local previews.
5. **A freshness gate: `pnpm site:check`**, run in CI. It fails when:
   - a technical-design doc is neither covered by a site feature nor listed as not user-facing;
   - a `DONE` roadmap phase is missing from "What's new";
   - a feature names a screenshot the shots script does not make;
   - the version or platforms disagree with the desktop app.
6. **The rule** (CLAUDE.md): a user-visible change updates `site.ts`, and the shots script if the screen changed, in the same change.

## Consequences

- A new feature area cannot merge without a line on the page, because its design doc trips the gate.
- Screenshots never drift, at the cost of a Playwright run in the site workflow.
- The page has no metrics. Interest is judged by GitHub stars and issues, not tracking.
