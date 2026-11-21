fn main() {
    // App commands need an explicit permission, so only the local LAN window can call them.
    // The main window shows http://127.0.0.1:<port>, a remote origin with no capability: no IPC.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["lan_start", "lan_stop", "lan_status"]),
    ))
    .expect("failed to run tauri-build");
}
