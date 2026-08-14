# Tauri 桌面壳（macOS arm64）

[English](README.md) | 中文

精简的 Tauri 2 宿主：系统 WKWebView + Resources 内 `dsh web` 闭包的生命周期。见 [`../README.md`](../README.md) 与 [Agent Note](../../../.agents/notes/implemented/architecture/2026-08-13-macos-arm64-tauri-desktop-shell.md)。

crate 启用 Tauri `custom-protocol`，使 `cargo build --release` **不会**设置 `cfg(dev)`。否则 Tauri 会嵌入 `app_icon` 并调用 `setApplicationIconImage`，导致**运行中** Dock 磁贴为直角，而退出态磁贴（来自 `Resources/AppIcon.icns`）仍有圆角（[说明](../../../.agents/notes/implemented/bug-fix/2026-08-14-macos-dock-running-tile-custom-protocol.md)）。

非嵌入式 `dsh web` origin 的 HTTP(S) 链接经 `on_navigation` / `on_new_window` 与 `tauri-plugin-opener` 在系统浏览器中打开（markdown 使用 `target="_blank"`）。仅打开 `http`/`https`；web UI origin 留在 WebView（[说明](../../../.agents/notes/implemented/bug-fix/2026-08-14-macos-desktop-http-links-system-browser.md)）。

```sh
pnpm run build:macos-desktop-shell
# Local smoke without assembling a full .app (uses the existing closure tree):
DSH_DESKTOP_RESOURCES="$PWD/dist-macos-desktop" ./packaging/macos/shell/src-tauri/target/release/DeepSeekHarness
```

不组装完整 `.app` 时，用上面的 `DSH_DESKTOP_RESOURCES` 指向已有闭包树即可本地冒烟。
