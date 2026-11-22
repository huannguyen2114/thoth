# ADR-0049: The desktop app updates itself, and installs with Homebrew

- Status: Accepted
- Date: 2026-11-22
- Builds on: ADR-0036, ADR-0045

## Context

The desktop app (ADR-0036) had no way to learn of a new version: you went back to the website. The owner asked for updates right in the app, and for a Homebrew install.

## Decision

1. **The Tauri updater, driven from Rust.** `tauri-plugin-updater` and `tauri-plugin-process` run in the shell (`src-tauri/src/updates.rs`). The web app needs no new permissions.
   - The shell checks once, a few seconds after the window opens. "Check for Updates…" (the app menu on macOS, File elsewhere) checks on demand.
   - A newer version is offered in a native dialog with its notes: **Install and restart** or **Later**. On install, the shell downloads the bundle, checks its signature, stops the server, installs, and restarts.
   - The launch check is silent when there is nothing new or the network fails. The menu check says so either way.
2. **Signed with a key the owner holds.** Update bundles are signed with a minisign key made by `tauri signer generate`.
   - The private key, and its password, are the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets.
   - The public key is the `TAURI_UPDATER_PUBKEY` repository variable. CI compiles it into the app (`option_env!`), so it is not in the repo.
   - Without the key, `desktop.yml` builds as before, with a warning. Such a build never checks, and its menu item says updates are off. Setting only one of the secret and the variable fails the build.
3. **One manifest, from GitHub Releases.** The updater reads `releases/latest/download/latest.json`.
   - The release job writes `latest.json` with `apps/desktop/scripts/release-files.mjs`, from the `.sig` files collected under stable names.
   - The bundles are `Thoth-macOS-{arm64,x64}.app.tar.gz`, the NSIS `Thoth-Windows-x64-setup.exe` (passive install) and `Thoth-Linux-x86_64.AppImage`. The `.deb` does not self-update.
4. **Homebrew: a cask, with this repository as the tap.**
   - `Casks/thoth.rb` installs the DMG for the Mac's architecture.
   - It is `auto_updates true`, because the app updates itself; `brew upgrade --greedy` also works.
   - It removes the quarantine flag after install, because the app is not notarised yet.
   - The release job regenerates the cask with the new version and DMG checksums, lints it with `brew style`, and commits it to `main`.
   - Install: `brew tap <owner>/thoth https://github.com/<owner>/thoth`, then `brew install --cask thoth`. A separate `homebrew-thoth` repository would allow a one-line install. It needs its own repository and a push token, so it is left for later.

## Consequences

- **Making the repository public comes first.** Updates and Homebrew both need public release downloads, which a private repository does not serve.
- **The signing key cannot be replaced.** Losing it means existing installs can never verify another update, and must be reinstalled by hand. Keep a backup of the key outside the machine.
- **`require_signed_version` is off.** Turning it on (it guards against downgrade tricks) needs every release users can still update from to be signed by a Tauri CLI that records the version.
- **Code signing and notarisation are still not done**, so first-launch warnings stay (doc 19).
