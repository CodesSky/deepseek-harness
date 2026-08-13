# Agent Note: macOS arm64 Tauri desktop shell

Status: implemented

English | [中文](2026-08-13-macos-arm64-tauri-desktop-shell.zh.md)

## Problem

The [disk install closure](2026-08-13-macos-arm64-app-bundle-desktop-distribution.md) already embeds Node, `dsh web`, and pnpm in an ad-hoc-signed `.app`, but the first GUI path opened the `printUrl` line in the **system browser**. Desktop users need a **native app window** that loads the same local Web UI, stops `dsh web` when the app exits, and surfaces port/startup failures in-window — without growing the install by another Chromium runtime on top of the ~hundreds-of-MB closure.

## Decision

Ship a **Tauri 2 (macOS arm64) shell** that uses **system WKWebView** and reuses the existing Resources closure:

- `Contents/MacOS/DeepSeekHarness` is the Tauri/Rust release binary from [`packaging/macos/shell/`](../../../../packaging/macos/shell/).
- On launch it starts embedded `dsh web --host 127.0.0.1 --port 0` (OS-assigned free port), parses the `dsh web: http://…` readiness line, and navigates the window to that URL.
- Exit / main-window close kills the child process so port 3080-class leftovers do not linger.
- Startup errors render in the shell’s loading page (not only stderr).
- `Resources/{node,dsh,pnpm,bin}` stay the M0–M3 closure layout; the shell does **not** vendor a second `node_modules`.
- The zsh browser opener moves to [`launcher-browser/`](../../../../packaging/macos/launcher-browser/) and remains available via `package-macos-desktop --browser-launcher`.
- Release profile: `lto`, `strip`, `opt-level = "z"`, `panic = "abort"`. Size budget: shell binary ≤ **15–20 MB**; shell delta vs browser-launcher preferably **&lt; 25 MB**; DMG total still dominated by the runtime closure (report shell vs closure separately).
- Ad-hoc codesign and SEA/Python track split stay as in the [closure note](2026-08-13-macos-arm64-app-bundle-desktop-distribution.md).

Builders: `pnpm run build:macos-desktop-shell`, `pnpm run package:macos-desktop`. CI workflow installs Rust and caches `packaging/macos/shell/src-tauri/target`.

## Alternatives considered

**Electron shell.** Ships Chromium and typically adds on the order of **100+ MB** on top of the Node closure. Rejected: package size is a hard constraint and the UI is already a local web app.

**Keep browser-only launcher as the product default.** Satisfies zero shell bytes but fails the native-window requirement. Kept only as `--browser-launcher` fallback.

**Tauri bundler producing a separate `.app` with its own resource tree.** Would risk duplicating or forking the closure layout. Rejected; `package-macos-desktop.ts` still owns App Bundle assembly and copies one release binary into `Contents/MacOS/`.

**Fixed port 3080 with retry loops only.** `dsh web` already accepts `--port 0`; prefer OS-assigned ports and still surface `EADDRINUSE` if it appears in logs.

## Consequences

- Double-click users get a native window over the same `dsh-web-frontend` / `dsh web` stack.
- Packaging and CI need a Rust toolchain; closure build remains Node/pnpm-only.
- Shell binary size is measured and logged beside DMG size; regressions that pull Electron-class runtimes are out of policy.
- Full interactive chat still needs credentials; automated smoke covers Mach-O kind, codesign, and PATH wrapper/`web --help` as before.
