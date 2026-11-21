# ADR-0036: Desktop app with Tauri 2 and a Node sidecar

- Status: Accepted
- Date: 2026-11-21
- Builds on: ADR-0002, ADR-0011, ADR-0027

## Context

The owner wants Thoth as a desktop app on macOS, Windows and Linux: opened from the dock, no terminal, data kept between launches. Thoth needs a Node server: Next.js, libSQL (native), the local embedding model (ONNX Runtime, native) and the Claude Agent SDK, which spawns the `claude` CLI. A native shell alone cannot run it.

The options were Electron (which embeds Node), Tauri with a bundled Node binary, or keeping the browser PWA. The owner chose Tauri for its smaller shell and lower memory use.

## Decision

1. **Shell.** A new `apps/desktop` package with a Tauri 2 shell. At start-up the Rust side:
   - takes a single-instance lock;
   - picks a free port on 127.0.0.1;
   - starts the bundled Node binary (a Tauri `externalBin` sidecar) on the Next **standalone** server (`THOTH_STANDALONE=1` turns on `output: "standalone"`);
   - waits for it to answer, then shows the window at `http://127.0.0.1:<port>`.

   Quitting the app stops the server.
2. **Loopback only.** The sidecar always binds to 127.0.0.1, as ADR-0027 requires. Serving the phone stays a separate, explicit action that runs the existing LAN server and refuses to start without a passcode.
3. **Data and migrations.** The shell sets `THOTH_DATA_DIR` to the OS app-data folder, and `THOTH_MIGRATIONS_DIR` to the migrations bundled as a resource. The web app reads both through `apps/web/src/server/env.ts`, and nothing else in the app knows it is running in a desktop shell.
4. **Native modules ship per target.** CI builds macOS arm64 and x64, Windows x64 and Linux x64 on their own runners, so libSQL, ONNX Runtime and the keychain module are installed for each target's platform. A smoke step launches each build and checks the server answers.
5. **Unsigned for now.** Builds are not code-signed or notarised. Signing, and the Tauri updater (which needs signed builds), are a later decision.
6. **The Claude subscription** needs the `claude` CLI installed and signed in. The app looks for it on PATH and in the usual install folders, and Settings explains how to sign in if it is missing.

## Consequences

- Two runtimes are packaged: the Rust shell (small) and Node plus the standalone server (about 100 MB per target).
- `pnpm dev` and the browser PWA are unchanged. The desktop app is one more way to run the same server.
- The Rust toolchain is needed only to build the desktop app, not to work on the web app.
- Unsigned builds show OS warnings on first launch (Gatekeeper, SmartScreen).
