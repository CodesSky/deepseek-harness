# Agent Note: macOS Dock needs full ICNS OSTypes

Status: implemented

English | [中文](2026-08-14-macos-dock-icon-full-icns-ostypes.zh.md)

## Problem

The desktop `.app` showed a correct icon in Finder / Launchpad / Applications but a **blank Dock tile**. `Contents/Resources/AppIcon.icns` was present and `CFBundleIconFile=AppIcon`, yet the file only contained 128/256/512 PNG entries. Retina Dock needs 1024 and @2x OSTypes as well.

## Decision

- Build the iconset from `icon-1024.png` as **RGBA** (Tauri `CachedIcon::new_png` requires RGBA; RGB masters get an opaque alpha).
- Pack `AppIcon.icns` with [`pack_icns.py`](../../../../packaging/macos/icon/pack_icns.py) writing every PNG OSType (`icp4`/`icp5`/`ic07`–`ic14`/`ic10`/`ic11`/`ic12`), and **verify** those tags after pack and in `package-macos-desktop` smoke.
- Do **not** rely on `iconutil -c icns` alone: on current macOS it silently drops 1024 and @2x members from a complete `.iconset`.
- Keep `CFBundleIconFile=AppIcon` (no asset catalog / `CFBundleIconName`). Tauri release builds do not override the Dock icon on macOS (`set_window_icon` is a no-op; `app_icon` is only embedded in `dev`).
- List `icons/icon.png` first in `tauri.conf.json` so `find_icon` prefers the 1024 master for the default window icon payload.

## Alternatives considered

**Trust `iconutil -c icns`.** Rejected: it produces a Finder-visible but Dock-incomplete icns from the same iconset.

**Tell users to `killall Dock` only.** Insufficient: the on-disk icns lacked Dock sizes; cache flush cannot invent OSTypes.

**Asset catalog + `CFBundleIconName`.** Unnecessary while a complete `.icns` in Resources works; adds Xcode-only tooling.

## Consequences

- [`icon/rebuild.sh`](../../../../packaging/macos/icon/rebuild.sh) is the only supported rebuild path; changing the master requires re-pack and `package:macos-desktop` (shell rebuild when Tauri icons change).
- Smoke fails if `AppIcon.icns` lacks required OSTypes.
- After replacing a signed `.app`, prefer revealing/re-adding the app for Dock; `killall Dock` remains a last-resort cache flush ([README](../../../../packaging/macos/README.md)).
