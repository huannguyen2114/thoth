# ADR-NNNN (draft, Phase 10 Lane 1): Desktop server entry, flat bundle and CLI shim

- Status: Proposed (draft; the orchestrator numbers it at merge)
- Date: 2026-11-21
- Builds on: ADR-0027, ADR-0036

## Context

ADR-0036 says the shell runs the Next standalone server on a bundled Node binary, and that "Serve on LAN" runs the existing LAN server with a passcode. Building it showed four things the ADR did not settle:

1. Next's standalone `server.js` defaults to `0.0.0.0`, and `apps/web/scripts/lan-server.mjs` expects a full checkout (`next.config.ts`, `pnpm build`). Running the LAN server as a second process would also start a second job runner on the same database.
2. The standalone output is pnpm symlinks. Symlinks do not survive Tauri's resource copy or the Windows installers. Next's trace also misses files loaded by path at run time: pdfjs's worker, fonts and cmaps; ONNX Runtime (loaded by Transformers.js); and the CommonJS half of `onnxruntime-common`. Without them every PDF import and all local embeddings fail.
3. The Agent SDK (0.3.x) looks for `claude` only in its per-platform package (`@anthropic-ai/claude-agent-sdk-<platform>-<arch>`, about 330 MB). It does not look on PATH. `pathToClaudeCodeExecutable` is the only override, and it is set in `packages/llm`.
4. A fresh random port at every launch changes the origin, so the web app's `localStorage` (theme, sidebar, dock layout) would reset each time.

## Decision

1. **A desktop server entry, `apps/desktop/server/thoth-server.mjs`,** replaces `server.js` in the bundle. It:
   - refuses any `HOSTNAME` other than 127.0.0.1;
   - boots Next from `required-server-files.json`, as `server.js` does;
   - stamps `x-thoth-peer` and `x-thoth-proxied` from the socket on every request, with `THOTH_TRUSTED_PEER=1`, exactly like `lan-server.mjs`.

   "Serve on LAN" is a second listener on `0.0.0.0:3214` **in the same process**. The shell turns it on with a stdin command that carries the passcode (at least 8 characters, checked in Rust and again in Node), and `THOTH_PASSCODE` is set only while it runs. The passcode never goes in argv, a file or an HTTP request. The server exits when stdin closes, or when the shell's PID disappears.
2. **A flat bundle.** `apps/desktop/scripts/prepare-sidecar.mjs`:
   - hoists every traced package into one `node_modules`, and nests a second version under its user;
   - turns Turbopack's hashed external aliases into real folders;
   - ships `pdfjs-dist` (legacy build, fonts, cmaps, wasm) and `onnxruntime-common` in full;
   - ships only this target's ONNX Runtime binaries.

   The target must match the host, so CI builds each target natively.
3. **The CLI shim.** At start-up the server finds `claude` on an extended PATH (`~/.local/bin`, `~/.claude/local`, `/opt/homebrew/bin`, `/usr/local/bin`, `%APPDATA%\npm`). It links `claude` into `<data>/runtime/node_modules/@anthropic-ai/claude-agent-sdk-<platform>-<arch>/claude`, which is on `NODE_PATH`. That is a symlink, or a hard link on Windows. Node searches `NODE_PATH` last, so a bundled platform package would still win.
4. **A stable port.** The shell reuses the last port, then tries 47213, and takes any free loopback port only if both are busy. It saves the choice in `<data>/desktop.json`.
5. **No IPC for the web app.** The main window shows `http://127.0.0.1:<port>`, a remote origin that has no capability. The app's three commands (`lan_start`, `lan_stop`, `lan_status`) need a permission that only the bundled `lan` window is given.

## Consequences

- One process, one job runner, and one gate implementation. `lan-server.mjs` and the desktop entry share the stamping rule, and a change to one must be mirrored in the other.
- The bundle is about 225 MB of server plus 110 MB of Node on macOS arm64, and about 320 MB for the `.app` in all.
- The Claude subscription works with an installed CLI and no extra download. On Windows the shim needs `claude.exe` (the native installer). An npm-only `claude.cmd` is not enough.
- **Follow-up for `packages/llm` (Lane 2):** read an optional `THOTH_CLAUDE_PATH` into `pathToClaudeCodeExecutable`. The shim could then go, and `claude.cmd` on Windows would work.
- Intel Macs: `onnxruntime-node` 1.30 ships no `darwin-x64` binary. Search there is keyword-only until it does, or until the embeddings package chooses another runtime.
