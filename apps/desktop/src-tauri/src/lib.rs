//! Thoth desktop shell (docs/technical_design/19-desktop-app.md, ADR-0036).
//!
//! Start-up: single-instance lock → splash window → pick a 127.0.0.1 port → spawn the bundled
//! Node sidecar on `thoth-server.mjs` → poll `GET /api/health` → open the main window on
//! `http://127.0.0.1:<port>`. Quitting (or the shell dying) stops the server.

mod http;
mod links;

use std::collections::HashMap;
use std::ffi::OsString;
use std::fs::File;
use std::io::Write;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use links::Pending;
use serde_json::{json, Value};
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Tried first so the origin (and the web app's localStorage) stays the same between launches.
const PREFERRED_PORT: u16 = 47213;
/// The LAN port matches `pnpm start:lan`, so phone bookmarks keep working.
const LAN_PORT: u16 = 3214;
const MIN_PASSCODE_CHARS: usize = 8;
const HEALTH_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Default)]
struct Shell {
    port: Mutex<u16>,
    child: Mutex<Option<CommandChild>>,
    ready: AtomicBool,
    quitting: AtomicBool,
    pending: Mutex<Vec<Pending>>,
    fatal: Mutex<Option<String>>,
    lan_reply: Mutex<Option<mpsc::Sender<Value>>>,
    lan: Mutex<Option<Value>>,
    log: Mutex<Option<File>>,
}

type ShellState = Arc<Shell>;

impl Shell {
    fn port(&self) -> u16 {
        *self.port.lock().unwrap()
    }

    fn log_line(&self, line: &str) {
        if let Some(f) = self.log.lock().unwrap().as_mut() {
            let _ = writeln!(f, "{line}");
        }
    }

    fn send(&self, cmd: &Value) -> Result<(), String> {
        let mut guard = self.child.lock().unwrap();
        let child = guard.as_mut().ok_or("The Thoth server is not running.")?;
        child
            .write(format!("{cmd}\n").as_bytes())
            .map_err(|e| format!("Could not talk to the Thoth server: {e}"))
    }

    fn kill(&self) {
        self.quitting.store(true, Ordering::SeqCst);
        if let Some(child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

pub fn run() {
    let state: ShellState = Arc::new(Shell::default());

    tauri::Builder::default()
        // Must be first: a second launch hands its arguments to this one and exits.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            focus_main(app);
            for arg in argv.iter().skip(1) {
                if let Some(p) = links::classify(arg) {
                    dispatch(app, p);
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["splash", "lan"])
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state.clone())
        .menu(build_menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => navigate(app, "/settings"),
            "lan" => open_lan_window(app),
            "open_pdf" => pick_pdf(app),
            "reload" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.eval("window.location.reload()");
                }
            }
            _ => {}
        })
        .on_window_event(|window, event| {
            // One main window: closing it quits, even if the LAN window is still open.
            if window.label() == "main" && matches!(event, WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![lan_start, lan_stop, lan_status])
        .setup(|app| {
            let handle = app.handle().clone();
            #[cfg(any(target_os = "linux", target_os = "windows"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                // Installers register the scheme; this covers AppImage and portable runs.
                let _ = app.deep_link().register_all();
            }
            // Windows and Linux pass files and links to a first launch as arguments.
            for arg in std::env::args().skip(1) {
                if let Some(p) = links::classify(&arg) {
                    dispatch(&handle, p);
                }
            }
            WebviewWindowBuilder::new(app, "splash", WebviewUrl::App("index.html".into()))
                .title("Thoth")
                .inner_size(360.0, 240.0)
                .resizable(false)
                .decorations(false)
                .center()
                .build()?;
            start_server(&handle)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Thoth shell")
        .run(move |app, event| match event {
            RunEvent::Exit => app.state::<ShellState>().kill(),
            // macOS: "Open with", a PDF dropped on the dock icon, and thoth:// links.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            RunEvent::Opened { urls } => {
                for url in urls {
                    if let Some(p) = links::classify(url.as_str()) {
                        dispatch(app, p);
                    }
                }
            }
            _ => {}
        });
}

// ---- Menu ----------------------------------------------------------------------------------

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let settings = MenuItemBuilder::with_id("settings", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let lan = MenuItemBuilder::with_id("lan", "Serve on LAN…").build(app)?;
    let open_pdf = MenuItemBuilder::with_id("open_pdf", "Open PDF…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let reload = MenuItemBuilder::with_id("reload", "Reload")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;

    let menu = Menu::new(app)?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "Thoth")
            .item(&PredefinedMenuItem::about(app, Some("About Thoth"), None)?)
            .separator()
            .item(&settings)
            .item(&lan)
            .separator()
            .item(&PredefinedMenuItem::services(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::hide(app, None)?)
            .item(&PredefinedMenuItem::hide_others(app, None)?)
            .item(&PredefinedMenuItem::show_all(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::quit(app, None)?)
            .build()?;
        menu.append(&app_menu)?;
        let file = SubmenuBuilder::new(app, "File")
            .item(&open_pdf)
            .separator()
            .item(&PredefinedMenuItem::close_window(app, None)?)
            .build()?;
        menu.append(&file)?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let file = SubmenuBuilder::new(app, "File")
            .item(&open_pdf)
            .item(&settings)
            .item(&lan)
            .separator()
            .item(&PredefinedMenuItem::quit(app, None)?)
            .build()?;
        menu.append(&file)?;
    }

    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view = SubmenuBuilder::new(app, "View")
        .item(&reload)
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;
    let window = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .build()?;
    menu.append(&edit)?;
    menu.append(&view)?;
    menu.append(&window)?;
    Ok(menu)
}

// ---- Server --------------------------------------------------------------------------------

fn port_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// The last port if it is still free, else the preferred one, else any free loopback port.
fn pick_port(data_dir: &Path) -> std::io::Result<u16> {
    let saved = std::fs::read_to_string(data_dir.join("desktop.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.get("port").and_then(Value::as_u64))
        .and_then(|p| u16::try_from(p).ok());
    for p in saved.into_iter().chain([PREFERRED_PORT]) {
        if port_free(p) {
            return Ok(p);
        }
    }
    Ok(TcpListener::bind(("127.0.0.1", 0))?.local_addr()?.port())
}

/// PATH for the server: the bundled Node first (for `#!/usr/bin/env node` CLIs), then the usual
/// places the `claude` CLI is installed. GUI apps on macOS start with a bare PATH otherwise.
fn server_path(app: &AppHandle) -> OsString {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
    {
        dirs.push(exe_dir);
    }
    if let Ok(home) = app.path().home_dir() {
        dirs.push(home.join(".local/bin"));
        dirs.push(home.join(".claude/local"));
    }
    #[cfg(not(windows))]
    for d in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"] {
        dirs.push(PathBuf::from(d));
    }
    #[cfg(windows)]
    if let Some(appdata) = std::env::var_os("APPDATA") {
        dirs.push(PathBuf::from(appdata).join("npm"));
    }
    if let Some(existing) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&existing));
    }
    let mut seen = std::collections::HashSet::new();
    dirs.retain(|d| seen.insert(d.clone()));
    std::env::join_paths(dirs).unwrap_or_default()
}

fn start_server(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let state = app.state::<ShellState>().inner().clone();
    let paths = app.path();
    let data_dir = paths.app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let log_dir = paths.app_log_dir()?;
    std::fs::create_dir_all(&log_dir)?;
    *state.log.lock().unwrap() = File::create(log_dir.join("server.log")).ok();

    let resources = paths.resource_dir()?.join("server");
    let web_dir = resources.join("apps/web");
    let migrations = resources.join("packages/db/drizzle");
    let port = pick_port(&data_dir)?;
    *state.port.lock().unwrap() = port;
    let _ = std::fs::write(data_dir.join("desktop.json"), json!({ "port": port }).to_string());

    let mut env: HashMap<String, String> = HashMap::new();
    env.insert("HOSTNAME".into(), "127.0.0.1".into());
    env.insert("PORT".into(), port.to_string());
    env.insert("THOTH_DATA_DIR".into(), data_dir.display().to_string());
    env.insert("THOTH_MIGRATIONS_DIR".into(), migrations.display().to_string());
    env.insert(
        "NODE_PATH".into(),
        data_dir.join("runtime/node_modules").display().to_string(),
    );
    env.insert("PATH".into(), server_path(app).to_string_lossy().into_owned());
    env.insert("THOTH_PARENT_PID".into(), std::process::id().to_string());
    env.insert("NODE_ENV".into(), "production".into());
    env.insert("NEXT_TELEMETRY_DISABLED".into(), "1".into());
    state.log_line(&format!(
        "[shell] starting server on 127.0.0.1:{port}, data {}",
        data_dir.display()
    ));

    let (mut rx, child) = app
        .shell()
        .sidecar("node")?
        .args([web_dir.join("thoth-server.mjs").display().to_string()])
        .current_dir(&web_dir)
        .envs(env)
        .spawn()?;
    *state.child.lock().unwrap() = Some(child);

    // Server output: to the log, and `@@thoth {...}` lines are events.
    let events_app = app.clone();
    let events_state = state.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    for line in text.lines() {
                        events_state.log_line(line);
                        if let Some(json) = line.strip_prefix("@@thoth ") {
                            if let Ok(v) = serde_json::from_str::<Value>(json) {
                                on_server_event(&events_state, v);
                            }
                        }
                    }
                }
                CommandEvent::Terminated(payload) => {
                    events_state.log_line(&format!("[shell] server exited: {payload:?}"));
                    events_state.child.lock().unwrap().take();
                    if !events_state.quitting.load(Ordering::SeqCst) {
                        let why = events_state
                            .fatal
                            .lock()
                            .unwrap()
                            .clone()
                            .unwrap_or_else(|| format!("exit code {:?}", payload.code));
                        fail(&events_app, &format!("The Thoth server stopped ({why})."));
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    // Wait for /api/health, then show the app.
    let ready_app = app.clone();
    std::thread::spawn(move || {
        let started = Instant::now();
        loop {
            if state.quitting.load(Ordering::SeqCst) || state.child.lock().unwrap().is_none() {
                return;
            }
            if http::healthy(port) {
                break;
            }
            if started.elapsed() > HEALTH_TIMEOUT {
                fail(&ready_app, "The Thoth server did not start in time.");
                return;
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        state.log_line(&format!(
            "[shell] healthy after {} ms",
            started.elapsed().as_millis()
        ));
        if let Err(e) = open_main(&ready_app, port) {
            fail(&ready_app, &format!("Could not open the window: {e}"));
            return;
        }
        state.ready.store(true, Ordering::SeqCst);
        let queued: Vec<Pending> = std::mem::take(&mut *state.pending.lock().unwrap());
        for p in queued {
            dispatch(&ready_app, p);
        }
    });
    Ok(())
}

fn on_server_event(state: &Shell, v: Value) {
    match v.get("event").and_then(Value::as_str) {
        Some("fatal") => {
            *state.fatal.lock().unwrap() =
                v.get("message").and_then(Value::as_str).map(str::to_string);
        }
        Some("lan-started") => {
            *state.lan.lock().unwrap() = Some(v.clone());
            reply_lan(state, v);
        }
        Some("lan-stopped") => {
            *state.lan.lock().unwrap() = None;
            reply_lan(state, v);
        }
        Some("lan-error") => reply_lan(state, v),
        _ => {}
    }
}

fn reply_lan(state: &Shell, v: Value) {
    if let Some(tx) = state.lan_reply.lock().unwrap().take() {
        let _ = tx.send(v);
    }
}

fn fail(app: &AppHandle, message: &str) {
    let log = app
        .path()
        .app_log_dir()
        .map(|d| d.join("server.log").display().to_string())
        .unwrap_or_default();
    app.state::<ShellState>().log_line(&format!("[shell] fatal: {message}"));
    let handle = app.clone();
    app.dialog()
        .message(format!("{message}\n\nDetails are in {log}"))
        .title("Thoth could not start")
        .kind(MessageDialogKind::Error)
        .show(move |_| handle.exit(1));
}

// ---- Windows -------------------------------------------------------------------------------

fn base_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

fn open_main(app: &AppHandle, port: u16) -> tauri::Result<()> {
    let url: tauri::Url = base_url(port).parse().expect("valid loopback URL");
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("Thoth")
        .inner_size(1280.0, 820.0)
        .min_inner_size(720.0, 480.0)
        .build()?;
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    Ok(())
}

fn focus_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn navigate(app: &AppHandle, path: &str) {
    let state = app.state::<ShellState>();
    if !state.ready.load(Ordering::SeqCst) {
        state.pending.lock().unwrap().push(Pending::Navigate(path.to_string()));
        return;
    }
    if let (Some(w), Ok(url)) = (
        app.get_webview_window("main"),
        format!("{}{path}", base_url(state.port())).parse::<tauri::Url>(),
    ) {
        let _ = w.navigate(url);
        focus_main(app);
    }
}

/// Opens a link or a PDF now, or once the server is ready.
fn dispatch(app: &AppHandle, p: Pending) {
    let state = app.state::<ShellState>().inner().clone();
    if !state.ready.load(Ordering::SeqCst) {
        state.pending.lock().unwrap().push(p);
        return;
    }
    match p {
        Pending::Navigate(path) => navigate(app, &path),
        Pending::Pdf(path) => {
            let app = app.clone();
            std::thread::spawn(move || match http::upload_pdf(state.port(), &path) {
                Ok(id) => navigate(&app, &format!("/content/{id}")),
                Err(message) => {
                    app.dialog()
                        .message(message)
                        .title("Could not import the PDF")
                        .kind(MessageDialogKind::Warning)
                        .show(|_| {});
                }
            });
        }
    }
}

fn pick_pdf(app: &AppHandle) {
    let handle = app.clone();
    app.dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .pick_file(move |file| {
            if let Some(path) = file.and_then(|f| f.into_path().ok()) {
                dispatch(&handle, Pending::Pdf(path));
            }
        });
}

fn open_lan_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("lan") {
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "lan", WebviewUrl::App("lan.html".into()))
        .title("Serve on LAN")
        .inner_size(460.0, 460.0)
        .resizable(false)
        .center()
        .build();
}

// ---- LAN commands (only the bundled lan.html window may call these; see build.rs) ----------

async fn lan_request(state: ShellState, cmd: Value) -> Result<Value, String> {
    let (tx, rx) = mpsc::channel();
    *state.lan_reply.lock().unwrap() = Some(tx);
    state.send(&cmd)?;
    let reply = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(10)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "The Thoth server did not answer.".to_string())?;
    if reply.get("event").and_then(Value::as_str) == Some("lan-error") {
        return Err(reply
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Could not serve on the LAN.")
            .to_string());
    }
    Ok(reply)
}

#[tauri::command]
async fn lan_start(state: State<'_, ShellState>, passcode: String) -> Result<Value, String> {
    // Checked here and again in the server: never listen on the LAN without a passcode.
    if passcode.chars().count() < MIN_PASSCODE_CHARS {
        return Err(format!(
            "The passcode must be at least {MIN_PASSCODE_CHARS} characters."
        ));
    }
    let cmd = json!({ "cmd": "lan-start", "passcode": passcode, "port": LAN_PORT });
    lan_request(state.inner().clone(), cmd).await
}

#[tauri::command]
async fn lan_stop(state: State<'_, ShellState>) -> Result<Value, String> {
    lan_request(state.inner().clone(), json!({ "cmd": "lan-stop" })).await
}

#[tauri::command]
fn lan_status(state: State<'_, ShellState>) -> Value {
    state.lan.lock().unwrap().clone().unwrap_or(Value::Null)
}
