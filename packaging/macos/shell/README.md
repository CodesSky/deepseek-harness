# Tauri desktop shell (macOS arm64)

Thin Tauri 2 host: system WKWebView + lifecycle for the Resources `dsh web` closure. See [`../README.md`](../README.md) and the [Agent Note](../../../.agents/notes/implemented/architecture/2026-08-13-macos-arm64-tauri-desktop-shell.md).

```sh
pnpm run build:macos-desktop-shell
# Local smoke without assembling a full .app (uses the existing closure tree):
DSH_DESKTOP_RESOURCES="$PWD/dist-macos-desktop" ./packaging/macos/shell/src-tauri/target/release/DeepSeekHarness
```
