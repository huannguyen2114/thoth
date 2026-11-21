# 19. Desktop app

Status: Stub (Phase 10 Step 0). Lane 1 fills it in. Decision: ADR-0036.

Thoth as a desktop app on macOS, Windows and Linux: a Tauri 2 shell (`apps/desktop`) that starts the Next standalone server on a bundled Node binary, on 127.0.0.1 only, and shows it in a native window.

## Seams already in place (Step 0)

| Env var                | Set by the shell to             | Read in                      |
| ---------------------- | ------------------------------- | ---------------------------- |
| `THOTH_DATA_DIR`       | the OS app-data folder          | `apps/web/src/server/env.ts` |
| `THOTH_MIGRATIONS_DIR` | the bundled `drizzle/` resource | `apps/web/src/server/env.ts` |
| `THOTH_STANDALONE=1`   | (build time) standalone output  | `apps/web/next.config.ts`    |
