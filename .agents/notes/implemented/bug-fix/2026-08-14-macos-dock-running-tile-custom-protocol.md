# Agent Note: macOS running Dock tile needs custom-protocol

Status: implemented

English | [中文](2026-08-14-macos-dock-running-tile-custom-protocol.zh.md)

## Problem

The desktop `.app` showed a **system-rounded** Dock icon when quit, but a **square** tile while running. `Contents/Resources/AppIcon.icns` was complete ([full ICNS OSTypes](2026-08-14-macos-dock-icon-full-icns-ostypes.md)); the running tile came from a different path.

## Decision

- Enable Tauri's `custom-protocol` feature on the shell crate (`tauri = { features = ["custom-protocol"] }`). Tauri defines `cfg(dev)` as `!custom-protocol`, independent of Cargo `--release`.
- With `custom-protocol`, codegen leaves `app_icon` as `None` and the Ready handler does not call `NSApplication.setApplicationIconImage`. The Dock keeps using `CFBundleIconFile` / `AppIcon.icns` and applies the system squircle mask both while running and when quit.
- Keep packaging ownership of `Resources/AppIcon.icns`; do not replace the Dock tile from Rust.
- In `package-macos-desktop` smoke (non-browser-launcher), fail if `Contents/MacOS/DeepSeekHarness` embeds a raw `.icns` blob — that is the Tauri `cfg(dev)` `app_icon` payload.

## Alternatives considered

**Bake rounded corners into the PNG master.** Rejected: `setApplicationIconImage` still bypasses the system mask; a pre-masked asset fights Finder's mask when quit and does not fix the Wrong owner.

**Clear the Dock icon from shell `setup` with `setApplicationIconImage(None)`.** Rejected: fights Tauri's Ready path and still leaves a `cfg(dev)` binary embedding a megabyte-class icns.

**Rely on `tauri build` / CLI.** Rejected: this product assembles the `.app` with `package-macos-desktop` and `cargo build --release`; the feature must be explicit on the crate.

## Consequences

- `pnpm run build:macos-desktop-shell` / `package:macos-desktop` produce a shell without `cfg(dev)` Dock override.
- Removing `custom-protocol` without a replacement makes the running Dock square again; smoke catches the embedded icns.
- Local `tauri dev`-style workflows are out of scope for this shell (it always hosts the Resources `dsh web` closure).
