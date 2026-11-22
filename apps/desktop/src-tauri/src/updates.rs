//! In-app updates (ADR-0049, doc 19).
//!
//! The shell asks GitHub Releases for `latest.json` once at launch and whenever the user picks
//! "Check for Updates…". A newer build is offered in a native dialog; it is downloaded, its
//! minisign signature checked against the public key baked in at build time, installed, and the
//! app restarts. Builds made without a key (local dev builds) skip the launch check and say so
//! from the menu.

use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

use crate::ShellState;

/// The updater's public key, set by CI from the `TAURI_UPDATER_PUBKEY` repo variable. Empty in
/// builds made without it.
pub const PUBKEY: &str = match option_env!("TAURI_UPDATER_PUBKEY") {
    Some(k) => k,
    None => "",
};

/// Whether this build can update itself.
pub fn enabled() -> bool {
    !PUBKEY.trim().is_empty()
}

/// Wait before the launch check, so it never competes with the server starting.
const LAUNCH_DELAY: Duration = Duration::from_secs(8);

/// Checks for an update off the main thread. `interactive` is true when the user asked from the
/// menu: then "no update" and errors are shown too; the launch check stays silent about them.
pub fn check(app: &AppHandle, interactive: bool) {
    if !enabled() {
        if interactive {
            say(
                app,
                MessageDialogKind::Info,
                "Updates are off in this build",
                "This copy of Thoth was built without an update key. Download the latest version \
                 from the website, where the Homebrew command is too.",
            );
        }
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        if !interactive {
            std::thread::sleep(LAUNCH_DELAY);
        }
        if let Err(e) = run(&app, interactive) {
            app.state::<ShellState>()
                .log_line(&format!("[shell] update check failed: {e}"));
            if interactive {
                say(
                    &app,
                    MessageDialogKind::Error,
                    "Could not check for updates",
                    &format!("{e}\n\nCheck your internet connection and try again."),
                );
            }
        }
    });
}

fn run(app: &AppHandle, interactive: bool) -> Result<(), Box<dyn std::error::Error>> {
    let update = tauri::async_runtime::block_on(app.updater()?.check())?;
    let Some(update) = update else {
        if interactive {
            say(
                app,
                MessageDialogKind::Info,
                "You're up to date",
                &format!("Thoth {} is the latest version.", app.package_info().version),
            );
        }
        return Ok(());
    };

    let notes = update
        .body
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| format!("\n\n{}", truncate(s, 600)))
        .unwrap_or_default();
    let install = app
        .dialog()
        .message(format!(
            "Thoth {} is available. You have {}.{notes}\n\nInstall it now? Thoth restarts when \
             it is done. Your library stays as it is.",
            update.version, update.current_version
        ))
        .title("Update available")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install and restart".into(),
            "Later".into(),
        ))
        .blocking_show();
    if !install {
        return Ok(());
    }

    let state = app.state::<ShellState>();
    state.log_line(&format!("[shell] installing update {}", update.version));
    let bytes = tauri::async_runtime::block_on(update.download(|_, _| {}, || {}))?;
    // Stop the server before its files are replaced; the restart starts the new one.
    state.kill();
    update.install(bytes)?;
    app.restart();
}

fn say(app: &AppHandle, kind: MessageDialogKind, title: &str, text: &str) {
    app.dialog()
        .message(text)
        .title(title)
        .kind(kind)
        .blocking_show();
}

/// At most `max` characters, cut at a character boundary, with an ellipsis when cut.
fn truncate(s: &str, max: usize) -> String {
    match s.char_indices().nth(max) {
        Some((i, _)) => format!("{}…", &s[..i]),
        None => s.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::truncate;

    #[test]
    fn truncates_long_release_notes_at_a_char_boundary() {
        assert_eq!(truncate("héllo", 10), "héllo");
        assert_eq!(truncate("héllo", 2), "hé…");
    }
}
