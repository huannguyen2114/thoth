# 19. Desktop app

Status: Current (Phase 10). Decisions: ADR-0036, ADR-0043.

Thoth as a desktop app on macOS, Windows and Linux. A Tauri 2 shell (`apps/desktop`) starts the Next standalone server on a bundled Node 22 binary, on 127.0.0.1 only, and shows it in a native window. Nothing in `apps/web` knows it is running in a shell: it only gets different env vars.

## Build and run

```bash
pnpm desktop:build    # standalone web build + Node sidecar + `tauri build` (installers for this OS)
pnpm desktop:dev      # same server, Rust shell in debug (prepares the sidecar once if missing)
pnpm --filter @thoth/desktop smoke   # start the bundled server headless and check it
```

- **Needs:** Rust (`rustup`) and the OS build tools.
  - Linux also needs the WebKitGTK packages, listed in `.github/workflows/desktop.yml`.
  - On macOS, `scripts/tauri.mjs` falls back to the Command Line Tools (`DEVELOPER_DIR`) when Xcode is installed but its licence is not accepted.
- **Output:** `apps/desktop/src-tauri/target/release/bundle/` holds the `.app` and `.dmg`, `.msi` and NSIS `.exe`, or `.AppImage` and `.deb`. Builds are unsigned (ADR-0036), so the OS warns on first launch.
- **`pnpm dev`, `pnpm build`, `pnpm start:lan` are unchanged.** The desktop package has no `build` script, so Turbo never runs Cargo.

## Layout

| Path                                       | What                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `apps/desktop/src-tauri/src/lib.rs`        | Shell: plugins, menu, windows, server lifecycle, LAN commands                             |
| `apps/desktop/src-tauri/src/links.rs`      | `thoth:` link → app path; OS arguments → link or PDF (unit-tested)                        |
| `apps/desktop/src-tauri/src/http.rs`       | Health poll and PDF upload to the local server                                            |
| `apps/desktop/server/thoth-server.mjs`     | Server entry in the bundle: loopback listener, LAN listener, CLI shim, stdin control      |
| `apps/desktop/scripts/prepare-sidecar.mjs` | Downloads and verifies Node, builds and flattens the standalone server                    |
| `apps/desktop/scripts/smoke.mjs`           | Headless check of the bundle (CI runs it on every target)                                 |
| `apps/desktop/scripts/tauri.mjs`           | Tauri CLI with cargo on PATH and the macOS toolchain fallback                             |
| `apps/desktop/ui/`                         | The shell's own pages: splash (`index.html`) and Serve on LAN (`lan.html`), Hearth tokens |
| `apps/web/src/app/api/health/route.ts`     | `GET /api/health`: 200 once the container (DB and migrations) is up                       |

## Start-up

```mermaid
sequenceDiagram
  actor U as Owner
  participant S as Tauri shell (Rust)
  participant N as Node sidecar<br/>thoth-server.mjs
  participant W as Next server<br/>(in N)
  participant V as Main window
  U->>S: open Thoth (dock, Start menu, PDF, thoth:// link)
  S->>S: single-instance lock<br/>(a second launch forwards its args and exits)
  S->>S: splash window
  S->>S: port: last used, else 47213, else any free on 127.0.0.1
  S->>N: spawn bundled node<br/>HOSTNAME=127.0.0.1 PORT THOTH_DATA_DIR THOTH_MIGRATIONS_DIR<br/>NODE_PATH PATH THOTH_PARENT_PID
  N->>N: refuse a non-loopback HOSTNAME<br/>link claude CLI into the SDK shim
  N->>W: next({ conf from required-server-files.json })
  N-->>S: @@thoth {"event":"listening"}
  loop every 250 ms, up to 180 s
    S->>W: GET /api/health
    W->>W: getContainer(): open DB, run migrations
    W-->>S: 200 {"ok":true}
  end
  S->>V: open http://127.0.0.1:port (size and position restored)
  S->>S: close splash, run queued PDFs and links
  U->>S: Quit (⌘Q, close window)
  S->>N: kill; stdin closes
  N->>N: exit (also on stdin EOF or parent PID gone)
```

If the server exits or never becomes healthy, the shell shows an error dialog that points to the log, then quits.

## Environment the shell sets

| Env var                | Value                                                                                                                                     | Read in                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `HOSTNAME`             | `127.0.0.1` (anything else is refused)                                                                                                    | `thoth-server.mjs`                                        |
| `PORT`                 | the chosen port                                                                                                                           | `thoth-server.mjs`                                        |
| `THOTH_DATA_DIR`       | the OS app-data folder (below)                                                                                                            | `apps/web/src/server/env.ts`, `features/access/secret.ts` |
| `THOTH_MIGRATIONS_DIR` | `<resources>/server/packages/db/drizzle`                                                                                                  | `apps/web/src/server/env.ts`                              |
| `NODE_PATH`            | `<data>/runtime/node_modules` (the CLI shim)                                                                                              | Node's resolver                                           |
| `PATH`                 | bundled Node's folder, `~/.local/bin`, `~/.claude/local`, `/opt/homebrew/bin`, `/usr/local/bin`, `%APPDATA%\npm`, then the inherited PATH | `thoth-server.mjs`, the `claude` CLI                      |
| `THOTH_PARENT_PID`     | the shell's PID                                                                                                                           | `thoth-server.mjs` (exit if it disappears)                |
| `THOTH_STANDALONE=1`   | (build time) standalone output                                                                                                            | `apps/web/next.config.ts`                                 |

`THOTH_PASSCODE` from the environment is always cleared at start-up. LAN serving is off until the owner turns it on.

## Where data lives

| OS      | Data (`THOTH_DATA_DIR`)                            | Log (`server.log`, rewritten each launch) |
| ------- | -------------------------------------------------- | ----------------------------------------- |
| macOS   | `~/Library/Application Support/app.thoth.desktop/` | `~/Library/Logs/app.thoth.desktop/`       |
| Windows | `%APPDATA%\app.thoth.desktop\`                     | `%LOCALAPPDATA%\app.thoth.desktop\logs\`  |
| Linux   | `~/.local/share/app.thoth.desktop/`                | `~/.local/share/app.thoth.desktop/logs/`  |

The data folder holds `thoth.db`, `uploads/`, `models/` (the embedding model, downloaded once), `runtime/` (the CLI shim), `.session-secret` and `desktop.json` (the last port). Window size and position are kept by the window-state plugin. Uninstalling the app does not delete the data folder.

The data is separate from a checkout's `data/`, so `pnpm dev` and the desktop app do not share a library.

## Native features

| Feature          | How                                                                                                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menu             | App menu (macOS) or File menu with **Settings…** (⌘, / Ctrl+,) and **Serve on LAN…**. Also **Open PDF…** (⌘O), Edit (undo, cut, copy, paste), View (Reload ⌘R, Full screen) and Window                                                                          |
| Open a PDF       | Dock drop, "Open with", Finder double-click (`fileAssociations`, `RunEvent::Opened` on macOS, argv on Windows and Linux), or **Open PDF…**. The shell POSTs it to `/api/upload`, like the library's button, then opens `/content/<id>`. Errors show in a dialog |
| `thoth://` links | `thoth:c/<id>?at=p.3` or `thoth://c/<id>?at=p.3` → `/content/<id>?at=p.3`, and `thoth:space/<id>` → `/spaces/<id>`. Only `at` and `q` are kept, re-encoded; ids must match `[A-Za-z0-9_-]{1,64}`. `a/` and `s/` links open nothing (no page of their own)       |
| Single instance  | A second launch hands its files and links to the running one and exits                                                                                                                                                                                          |
| Before ready     | Files and links that arrive before `/api/health` answers are queued and run once the window opens                                                                                                                                                               |

## Serve on LAN

The menu item opens a small local window (`ui/lan.html`). It asks for a passcode (at least 8 characters) and calls `lan_start`. The flow:

1. The shell checks the length, then writes `{"cmd":"lan-start","passcode":…,"port":3214}` to the server's stdin.
2. The server checks the length again.
3. It sets `THOTH_PASSCODE` and opens a second listener on `0.0.0.0:3214` in the same process.
4. It answers with the addresses to open on the phone. Tailscale `100.x` addresses are marked.

**Stop serving** closes that listener and clears the passcode. Quitting the app stops it too.

Both listeners stamp `x-thoth-peer` and `x-thoth-proxied` from the socket (`THOTH_TRUSTED_PEER=1`), so the gate in `src/proxy.ts` works as in doc 14. Loopback is allowed. LAN requests need the session cookie, and forged `X-Forwarded-For: 127.0.0.1` from the LAN gets 401 (checked by the smoke test).

The main window is a remote origin with no Tauri capability, so the web app cannot call these commands. Only the bundled `lan` window has the permissions (`src-tauri/build.rs`, `capabilities/lan.json`).

## Claude subscription in the app

The Agent SDK finds Claude Code only in its own per-platform package. The server entry looks for `claude` on the extended PATH and links it into `<data>/runtime/node_modules/@anthropic-ai/claude-agent-sdk-<platform>-<arch>/`, which is on `NODE_PATH`. The log records `@@thoth {"event":"claude","found":…}`.

- If `claude` is missing, the subscription provider fails as it does in the browser. Settings explains how to install and sign in.
- Windows needs `claude.exe` from the native installer in `%USERPROFILE%\.local\bin`.
- Sign-in state is the CLI's own, in `~/.claude`, so signing in once in a terminal is enough.

## The bundle

`prepare-sidecar.mjs [--target <triple>] [--skip-build] [--if-missing]` does the following:

1. Downloads `node-v22.23.5-<os>-<arch>` from nodejs.org and checks its SHA-256 against `SHASUMS256.txt`. A mismatch deletes the download and fails. The archive is cached in `apps/desktop/.cache/`.
2. Puts the `node` binary in `src-tauri/binaries/node-<triple>[.exe]`, where Tauri's `externalBin` expects it.
3. Runs `THOTH_STANDALONE=1 pnpm --filter @thoth/web build`.
4. Copies the standalone app, `.next/static`, `public`, the migrations and `thoth-server.mjs` into `src-tauri/resources/server/`. Every package is **hoisted into one flat `node_modules` with no symlinks**: pnpm's symlinks do not survive Tauri's copy or the Windows installers. A second version of a package is nested under the package that uses it.
5. Adds what Next's trace misses because it is loaded by path at run time:
   - `pdfjs-dist` in full (worker, fonts, cmaps): without it every PDF import fails with "could not read this PDF";
   - `onnxruntime-node`, with this target's binaries only;
   - `onnxruntime-common` in full: the trace keeps only its ESM half.

Native modules come from the machine's own install, so the target must match the host. The script refuses to cross-build.

| Native module                          | Ships as                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `libsql` (`@libsql/<platform>-<arch>`) | traced by Next                                                                              |
| `sharp` and `@img/*`                   | traced by Next (Transformers.js)                                                            |
| `onnxruntime-node`                     | added by the script. **No `darwin-x64` binary in 1.30**: Intel Macs get keyword-only search |
| `@napi-rs/keyring` (Lane 2)            | traced once `apps/web` imports it. Add it to `nativeChecks` in `smoke.mjs` then             |

Sizes on macOS arm64: server about 225 MB, Node about 110 MB, `.app` about 320 MB.

## Updates and Homebrew (ADR-0049)

- **In the app.** `src-tauri/src/updates.rs` checks `releases/latest/download/latest.json` a few seconds after the window opens, and from **Check for Updates…** in the menu. A newer version is offered in a native dialog: **Install and restart** downloads the bundle, checks its signature, stops the server, installs and restarts.
- **The key.** The public key is compiled in from the `TAURI_UPDATER_PUBKEY` repository variable. A build without it (any local build) never checks, and the menu item says updates are off. The private key and its password are the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets. To set them up once:

  ```bash
  pnpm --filter @thoth/desktop tauri signer generate -w ~/.tauri/thoth.key
  gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/thoth.key
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  gh variable set TAURI_UPDATER_PUBKEY < ~/.tauri/thoth.key.pub
  ```

  Back up `~/.tauri/thoth.key`. Without it, installed copies can never verify another update.
- **Release files.** `scripts/release-files.mjs` (tested by `scripts/release-files.test.mjs`) writes `latest.json` from the `.sig` files, and `Casks/thoth.rb` with the new version and DMG checksums.
- **Homebrew.** This repository is the tap: `brew tap <owner>/thoth https://github.com/<owner>/thoth`, then `brew install --cask thoth`. The cask is `auto_updates true` and clears the quarantine flag, because the app is not notarised.
- Both need the repository to be public, so release downloads work without a login.

## CI (`.github/workflows/desktop.yml`)

- **Triggers:** `workflow_dispatch` and tags `v*`.
- **Matrix:** `macos-14` (aarch64), `macos-13` (x86_64), `windows-latest`, `ubuntu-22.04`. Each runner does the following:
  1. `cargo test --lib`;
  2. `prepare-sidecar --target <triple>`;
  3. the headless smoke test on the prepared bundle;
  4. `tauri build`;
  5. on macOS, the smoke test again inside the built `.app`.

  It then uploads the `.dmg`, `.msi`, NSIS `.exe`, `.AppImage` and `.deb` as artifacts, plus each update bundle and its `.sig` when the build was signed.
- **Release job** (tags only, on `macos-15`): writes `latest.json` and the cask, lints the cask with `brew style`, publishes the release, and commits the cask to `main`.

The smoke test (`scripts/smoke.mjs`) checks the following:

- `libsql` and `onnxruntime-node` load from the bundle;
- `/api/health` and `/` answer 200;
- the server is not reachable on the LAN address;
- Serve on LAN refuses a passcode under 8 characters;
- with a passcode, a LAN request and a forged-localhost LAN request both get 401, while loopback still passes;
- stopping closes the LAN port;
- the server exits when stdin closes.

## Known limits

- Not code-signed: Gatekeeper ("unidentified developer": right-click → Open) and SmartScreen warn. Update bundles are signed (ADR-0049); code signing and notarisation are later.
- Intel Macs have no local embeddings (above).
- The app's data is not shared with a checkout's `data/`.
