//! Tauri 2 desktop shell for the macOS arm64 App Bundle.
//!
//! Owns the native window and the lifecycle of the embedded `dsh web` child.
//! The product UI remains `dsh-web-frontend` served from the Resources closure;
//! this crate does not embed Chromium or a second Node tree.
//!
//! HTTP(S) navigations and `target="_blank"` requests that are not the embedded
//! web UI origin open in the system browser; only `http`/`https` are opened
//! ([Agent Note](../../../../../.agents/notes/implemented/bug-fix/2026-08-14-macos-desktop-http-links-system-browser.md)).

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl};
use url::Url;

/// Readiness line prefix emitted by `@deepseek-ai/dsh-web-app` when `printUrl` is on.
const READY_PREFIX: &str = "dsh web: ";
/// How long to wait for the readiness line before surfacing an error in-window.
const READY_TIMEOUT: Duration = Duration::from_secs(60);

/// How the shell routes a candidate URL relative to the embedded web UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LinkDisposition {
  /// Keep the load inside the main WKWebView (shell assets or web UI origin).
  AllowInWebview,
  /// Open with the system default handler and block WebView navigation / new windows.
  OpenInSystemBrowser,
  /// Block without opening (non-http(s) schemes outside the shell asset protocols).
  Deny,
}

/// Shared handle so exit teardown can stop the child after setup returns.
struct ServerState {
  child: Mutex<Option<Child>>,
  stopped: AtomicBool,
  /// Scheme/host/port of the embedded `dsh web` once the readiness URL is known.
  web_ui_origin: Mutex<Option<Url>>,
}

impl ServerState {
  fn empty() -> Self {
    Self {
      child: Mutex::new(None),
      stopped: AtomicBool::new(false),
      web_ui_origin: Mutex::new(None),
    }
  }

  fn adopt(&self, child: Child) -> Result<(), String> {
    if self.stopped.load(Ordering::SeqCst) {
      let mut child = child;
      let _ = child.kill();
      let _ = child.wait();
      return Err("Startup cancelled because the app is exiting.".to_string());
    }
    let Ok(mut guard) = self.child.lock() else {
      return Err("server state lock poisoned".to_string());
    };
    *guard = Some(child);
    Ok(())
  }

  fn stop(&self) {
    if self.stopped.swap(true, Ordering::SeqCst) {
      return;
    }
    let Ok(mut guard) = self.child.lock() else {
      return;
    };
    if let Some(mut child) = guard.take() {
      let _ = child.kill();
      let _ = child.wait();
    }
  }

  fn set_web_ui_origin(&self, url: &Url) -> Result<(), String> {
    let Ok(mut guard) = self.web_ui_origin.lock() else {
      return Err("server state lock poisoned".to_string());
    };
    *guard = Some(url.clone());
    Ok(())
  }

  fn web_ui_origin(&self) -> Option<Url> {
    self
      .web_ui_origin
      .lock()
      .ok()
      .and_then(|guard| guard.clone())
  }
}

/// True when `candidate` shares scheme, host, and port with `origin`.
fn same_origin(candidate: &Url, origin: &Url) -> bool {
  candidate.scheme() == origin.scheme()
    && candidate.host() == origin.host()
    && candidate.port_or_known_default() == origin.port_or_known_default()
}

/// Classify a URL for WebView navigation or a new-window request.
///
/// Only `http`/`https` may open in the system browser. The embedded web UI origin
/// and Tauri shell asset protocols stay in the WebView. Matches the markdown
/// sanitize allowlist (`http`/`https` only) for outbound opens.
fn classify_link(url: &Url, web_ui_origin: Option<&Url>) -> LinkDisposition {
  match url.scheme() {
    "http" | "https" => {
      if web_ui_origin.is_some_and(|origin| same_origin(url, origin)) {
        LinkDisposition::AllowInWebview
      } else {
        LinkDisposition::OpenInSystemBrowser
      }
    }
    // Loading page and other Tauri asset navigations before/around `dsh web`.
    "tauri" | "asset" | "about" => LinkDisposition::AllowInWebview,
    _ => LinkDisposition::Deny,
  }
}

fn open_http_in_system_browser(url: &Url) {
  if url.scheme() != "http" && url.scheme() != "https" {
    return;
  }
  if let Err(err) = tauri_plugin_opener::open_url(url.as_str(), None::<&str>) {
    eprintln!("DeepSeekHarness: failed to open URL in system browser: {err}");
  }
}

fn apply_navigation_disposition(url: &Url, disposition: LinkDisposition) -> bool {
  match disposition {
    LinkDisposition::AllowInWebview => true,
    LinkDisposition::OpenInSystemBrowser => {
      open_http_in_system_browser(url);
      false
    }
    LinkDisposition::Deny => false,
  }
}

fn apply_new_window_disposition(url: &Url) -> NewWindowResponse<tauri::Wry> {
  // Markdown uses target="_blank" for every http(s) href. Never spawn a second
  // WKWebView: open http(s) in the system browser (including the web UI origin)
  // and deny every other scheme without opening. Same-origin SPA loads still use
  // on_navigation → AllowInWebview.
  if url.scheme() == "http" || url.scheme() == "https" {
    open_http_in_system_browser(url);
  }
  NewWindowResponse::Deny
}

/// Resolve `Contents/Resources` for the App Bundle, or `DSH_DESKTOP_RESOURCES` for local smoke.
fn resources_dir() -> Result<PathBuf, String> {
  if let Ok(override_path) = std::env::var("DSH_DESKTOP_RESOURCES") {
    let path = PathBuf::from(override_path);
    if path.is_dir() {
      return Ok(path);
    }
    return Err(format!(
      "DSH_DESKTOP_RESOURCES is not a directory: {}",
      path.display()
    ));
  }
  let exe = std::env::current_exe().map_err(|e| format!("current_exe failed: {e}"))?;
  let macos_dir = exe
    .parent()
    .ok_or_else(|| "executable has no parent directory".to_string())?;
  let contents = macos_dir
    .parent()
    .ok_or_else(|| "MacOS directory has no parent".to_string())?;
  let resources = contents.join("Resources");
  if resources.is_dir() {
    return Ok(resources);
  }
  Err(format!(
    "Resources directory missing at {} (set DSH_DESKTOP_RESOURCES for non-bundle smoke)",
    resources.display()
  ))
}

/// Build PATH so `dsh plugin` → `spawnSync('pnpm')` still hits the embedded shim.
fn enriched_path(resources: &Path) -> String {
  let pnpm = resources.join("pnpm").join("bin");
  let node = resources.join("node").join("bin");
  let bin = resources.join("bin");
  let existing = std::env::var_os("PATH").unwrap_or_default();
  let existing = existing.to_string_lossy();
  format!(
    "{}:{}:{}{}",
    pnpm.display(),
    node.display(),
    bin.display(),
    if existing.is_empty() {
      String::new()
    } else {
      format!(":{existing}")
    }
  )
}

/// Spawn embedded `dsh web --host 127.0.0.1 --port 0` (OS-assigned free port).
fn spawn_dsh_web(resources: &Path) -> Result<(Child, Box<dyn Read + Send>, Box<dyn Read + Send>), String> {
  let node = resources.join("node").join("bin").join("node");
  let dsh_js = resources
    .join("dsh")
    .join("node_modules")
    .join("@deepseek-ai")
    .join("dsh")
    .join("lib")
    .join("bin.js");
  if !node.is_file() {
    return Err(format!("Embedded Node is missing at {}", node.display()));
  }
  if !dsh_js.is_file() {
    return Err(format!(
      "Embedded dsh install is missing at {}",
      dsh_js.display()
    ));
  }

  let mut command = Command::new(&node);
  command
    .arg(&dsh_js)
    .arg("web")
    .arg("--host")
    .arg("127.0.0.1")
    .arg("--port")
    .arg("0")
    .env("PATH", enriched_path(resources))
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

  let mut child = command
    .spawn()
    .map_err(|e| format!("failed to spawn dsh web ({}): {e}", node.display()))?;
  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| "dsh web stdout pipe missing".to_string())?;
  let stderr = child
    .stderr
    .take()
    .ok_or_else(|| "dsh web stderr pipe missing".to_string())?;
  Ok((child, Box::new(stdout), Box::new(stderr)))
}

/// Extract the first `http(s)://…` URL from a `dsh web:` readiness line.
fn parse_ready_url(line: &str) -> Option<String> {
  let rest = line.strip_prefix(READY_PREFIX)?.trim();
  let candidate = rest.split_whitespace().next()?;
  let parsed = Url::parse(candidate).ok()?;
  if parsed.scheme() != "http" && parsed.scheme() != "https" {
    return None;
  }
  Some(candidate.to_string())
}

/// Read child output until a readiness URL appears, the process exits, or timeout.
fn wait_for_ready_url(
  state: &ServerState,
  stdout: Box<dyn Read + Send>,
  stderr: Box<dyn Read + Send>,
) -> Result<String, String> {
  let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
  let log = Arc::new(Mutex::new(String::new()));

  let pump = |tx: std::sync::mpsc::Sender<Result<String, String>>,
              log: Arc<Mutex<String>>,
              reader: Box<dyn Read + Send>,
              label: &'static str| {
    thread::spawn(move || {
      let buffered = BufReader::new(reader);
      for line in buffered.lines() {
        match line {
          Ok(text) => {
            if let Ok(mut guard) = log.lock() {
              guard.push_str(&text);
              guard.push('\n');
              const KEEP: usize = 8_000;
              if guard.len() > KEEP {
                let trim_at = guard.len() - KEEP;
                *guard = guard[trim_at..].to_string();
              }
            }
            if let Some(url) = parse_ready_url(&text) {
              let _ = tx.send(Ok(url));
              return;
            }
            if text.contains("EADDRINUSE") {
              let _ = tx.send(Err(format!(
                "Port is already in use (EADDRINUSE). Close the other DeepSeek Harness / dsh web process, or free the port.\n\n{text}"
              )));
              return;
            }
          }
          Err(err) => {
            let _ = tx.send(Err(format!("failed reading dsh web {label}: {err}")));
            return;
          }
        }
      }
    });
  };

  pump(tx.clone(), Arc::clone(&log), stdout, "stdout");
  pump(tx, Arc::clone(&log), stderr, "stderr");

  let deadline = Instant::now() + READY_TIMEOUT;
  loop {
    let remaining = deadline.saturating_duration_since(Instant::now());
    if remaining.is_zero() {
      let tail = log.lock().map(|g| g.clone()).unwrap_or_default();
      return Err(format!(
        "Timed out waiting for the web UI readiness line (`dsh web: http://…`).\n\n{tail}"
      ));
    }
    match rx.recv_timeout(Duration::from_millis(200)) {
      Ok(Ok(url)) => return Ok(url),
      Ok(Err(message)) => return Err(message),
      Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
        let Ok(mut guard) = state.child.lock() else {
          continue;
        };
        if let Some(child) = guard.as_mut() {
          if let Ok(Some(status)) = child.try_wait() {
            *guard = None;
            let tail = log.lock().map(|g| g.clone()).unwrap_or_default();
            return Err(format!(
              "dsh web exited before becoming ready (status {status}).\n\n{tail}"
            ));
          }
        } else if state.stopped.load(Ordering::SeqCst) {
          return Err("Startup cancelled because the app is exiting.".to_string());
        }
      }
      Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
        let tail = log.lock().map(|g| g.clone()).unwrap_or_default();
        return Err(format!(
          "Lost the dsh web output pipes before readiness.\n\n{tail}"
        ));
      }
    }
  }
}

fn show_error(app: &AppHandle, title: &str, detail: &str) {
  let Some(window) = app.get_webview_window("main") else {
    eprintln!("DeepSeekHarness: {title}: {detail}");
    return;
  };
  let title_js = serde_json::to_string(title).unwrap_or_else(|_| "\"Error\"".to_string());
  let detail_js = serde_json::to_string(detail).unwrap_or_else(|_| "\"Unknown error\"".to_string());
  let script = format!(
    r#"(function(){{
      const api = window.__dshShell;
      if (api && typeof api.showError === "function") {{
        api.showError({title_js}, {detail_js}, null);
        return;
      }}
      document.body.textContent = {title_js} + "\n\n" + {detail_js};
    }})()"#
  );
  if let Err(err) = window.eval(&script) {
    eprintln!("DeepSeekHarness: failed to present error UI: {err}");
    eprintln!("DeepSeekHarness: {title}: {detail}");
  }
}

fn navigate_main(app: &AppHandle, state: &ServerState, url: &str) -> Result<(), String> {
  let window = app
    .get_webview_window("main")
    .ok_or_else(|| "main window missing".to_string())?;
  let parsed = Url::parse(url).map_err(|e| format!("invalid web URL {url:?}: {e}"))?;
  state.set_web_ui_origin(&parsed)?;
  window
    .navigate(parsed)
    .map_err(|e| format!("navigate to {url} failed: {e}"))
}

fn boot_server(app: AppHandle, state: Arc<ServerState>) {
  thread::spawn(move || {
    let resources = match resources_dir() {
      Ok(path) => path,
      Err(err) => {
        show_error(&app, "DeepSeek Harness", &err);
        return;
      }
    };

    let (child, stdout, stderr) = match spawn_dsh_web(&resources) {
      Ok(parts) => parts,
      Err(err) => {
        show_error(&app, "Could not start local server", &err);
        return;
      }
    };

    if let Err(err) = state.adopt(child) {
      show_error(&app, "Could not start local server", &err);
      return;
    }

    let url = match wait_for_ready_url(&state, stdout, stderr) {
      Ok(url) => url,
      Err(err) => {
        state.stop();
        show_error(&app, "Web UI did not become ready", &err);
        return;
      }
    };

    if let Err(err) = navigate_main(&app, &state, &url) {
      state.stop();
      show_error(&app, "Could not open Web UI", &err);
    }
  });
}

fn build_main_window(app: &tauri::App, state: Arc<ServerState>) -> tauri::Result<()> {
  let state_nav = Arc::clone(&state);
  WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
    .title("DeepSeek Harness")
    .inner_size(1280.0, 840.0)
    .resizable(true)
    .fullscreen(false)
    .on_navigation(move |url| {
      let origin = state_nav.web_ui_origin();
      apply_navigation_disposition(url, classify_link(url, origin.as_ref()))
    })
    .on_new_window(|url, _features| apply_new_window_disposition(&url))
    .build()?;
  Ok(())
}

/// Run the desktop shell event loop.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      let state = Arc::new(ServerState::empty());
      app.manage(Arc::clone(&state));
      build_main_window(app, Arc::clone(&state))?;
      boot_server(app.handle().clone(), state);
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building DeepSeek Harness shell");

  app.run(|app_handle, event| {
    if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
      if let Some(state) = app_handle.try_state::<Arc<ServerState>>() {
        state.stop();
      }
    }
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  fn url(s: &str) -> Url {
    Url::parse(s).expect("test URL")
  }

  #[test]
  fn web_ui_origin_stays_in_webview() {
    let origin = url("http://127.0.0.1:54321/");
    assert_eq!(
      classify_link(&url("http://127.0.0.1:54321/chat"), Some(&origin)),
      LinkDisposition::AllowInWebview
    );
  }

  #[test]
  fn other_localhost_opens_system_browser() {
    let origin = url("http://127.0.0.1:54321/");
    assert_eq!(
      classify_link(&url("http://localhost:3000/docs"), Some(&origin)),
      LinkDisposition::OpenInSystemBrowser
    );
    assert_eq!(
      classify_link(&url("http://127.0.0.1:9999/"), Some(&origin)),
      LinkDisposition::OpenInSystemBrowser
    );
  }

  #[test]
  fn public_https_opens_system_browser() {
    let origin = url("http://127.0.0.1:54321/");
    assert_eq!(
      classify_link(&url("https://example.com/a"), Some(&origin)),
      LinkDisposition::OpenInSystemBrowser
    );
  }

  #[test]
  fn http_before_origin_known_opens_system_browser() {
    assert_eq!(
      classify_link(&url("http://127.0.0.1:1/"), None),
      LinkDisposition::OpenInSystemBrowser
    );
  }

  #[test]
  fn shell_asset_protocols_stay_in_webview() {
    assert_eq!(
      classify_link(&url("tauri://localhost/index.html"), None),
      LinkDisposition::AllowInWebview
    );
    assert_eq!(
      classify_link(&url("about:blank"), None),
      LinkDisposition::AllowInWebview
    );
  }

  #[test]
  fn non_http_schemes_are_denied_without_open() {
    assert_eq!(
      classify_link(&url("javascript:alert(1)"), None),
      LinkDisposition::Deny
    );
    assert_eq!(
      classify_link(&url("file:///etc/passwd"), None),
      LinkDisposition::Deny
    );
    assert_eq!(
      classify_link(&url("mailto:user@example.com"), None),
      LinkDisposition::Deny
    );
  }
}
