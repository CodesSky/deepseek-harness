# Tauri desktop shell (macOS arm64)

Thin Tauri 2 host: system WKWebView + lifecycle for the Resources `dsh web` closure. See [`../README.md`](../README.md) and the [Agent Note](../../../.agents/notes/implemented/architecture/2026-08-13-macos-arm64-tauri-desktop-shell.md).

The crate enables Tauri `custom-protocol` so `cargo build --release` does **not** set `cfg(dev)`. Without it, Tauri embeds an `app_icon` and calls `setApplicationIconImage`, which makes the **running** Dock tile square while the quit tile (from `Resources/AppIcon.icns`) stays rounded ([note](../../../.agents/notes/implemented/bug-fix/2026-08-14-macos-dock-running-tile-custom-protocol.md)).

```sh
pnpm run build:macos-desktop-shell
# Local smoke without assembling a full .app (uses the existing closure tree):
DSH_DESKTOP_RESOURCES="$PWD/dist-macos-desktop" ./packaging/macos/shell/src-tauri/target/release/DeepSeekHarness
```
