# Agent Note: macOS desktop HTTP(S) links open in the system browser

Status: implemented

English | [中文](2026-08-14-macos-desktop-http-links-system-browser.zh.md)

## Problem

In the macOS Tauri desktop shell, clicking an `http(s)://…` link in a conversation (including `localhost` / other loopback ports) did nothing. Markdown renders those links as `<a target="_blank" rel="noopener noreferrer">` with no custom click handler. The shell hosted only a WKWebView and never handled navigation or new-window requests, so `target="_blank"` was swallowed. This was not a localhost special case: every external HTTP(S) link failed inside the shell.

## Decision

Handle outbound links in the **desktop shell**, not in the React markdown renderer:

- Create the `main` window with `WebviewWindowBuilder` so `on_navigation` and `on_new_window` can attach (declarative `tauri.conf.json` windows cannot).
- Record the embedded `dsh web` readiness URL as the web UI origin (scheme/host/port) before navigating the WebView to it.
- **Allow in WebView:** that web UI origin, plus shell asset protocols (`tauri`, `asset`, `about`).
- **Open in the system browser and block WebView navigation:** any other `http` / `https` URL on `on_navigation` (including other `localhost` / `127.0.0.1` ports and public sites), via `tauri_plugin_opener::open_url`.
- **`on_new_window` (`target="_blank"`):** never create a second WKWebView; open every `http`/`https` URL in the system browser (including the web UI origin) and deny other schemes without opening.
- **Deny without opening:** every other scheme (`javascript:`, `file:`, `mailto:`, …), matching the markdown sanitize allowlist that only admits `http`/`https` for authored hrefs.
- Keep Tauri `custom-protocol` enabled; do not reintroduce `cfg(dev)` Dock icon override.
- Capabilities stay window-scoped: `core:default` plus the overlay title-bar remote grants (`allow-start-dragging`, `allow-is-fullscreen` on `http://127.0.0.1:*`, [immersive title bar](../feature/2026-08-15-macos-immersive-title-bar.md)). The frontend does not gain a JS `openUrl` surface. Rust handlers call the opener crate directly.

## Alternatives considered

**Intercept clicks in `ui-primitives` markdown and invoke a Tauri command.** Rejected: every host (browser-only launcher, plain `dsh web`, desktop shell) would need a different bridge, and the defect is the missing shell navigation policy, not the anchor markup.

**Allow all `localhost` / loopback hosts inside the WebView.** Rejected: chat links often point at other local services; those must open in the system browser. Only the embedded `dsh web` origin stays in-process.

**Open arbitrary schemes with the system handler.** Rejected: would widen past the UI sanitize allowlist and invite `javascript:` / `file:` style abuse if markup or injection ever slipped through.

**Keep the window in `tauri.conf.json` and poll `url()`.** Rejected: brittle and late; Tauri 2 exposes `on_navigation` / `on_new_window` on the builder for this case.

## Consequences

- Conversation HTTP(S) links (including non-UI localhost) open in the user's default browser; in-app SPA navigation on the `dsh web` origin remains inside the window.
- The main window is created in Rust setup; `tauri.conf.json` `windows` stays empty so handlers can attach.
- Shell unit tests cover `classify_link` dispositions; interactive verification still needs a rebuilt `.app` or release binary with a live conversation.
- `tauri-plugin-opener` is a shell dependency; size stays within the existing WKWebView shell budget (no Chromium).
