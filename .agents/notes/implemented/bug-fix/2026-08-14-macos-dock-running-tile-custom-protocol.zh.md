# Agent Note: macOS 运行中 Dock 磁贴需要 custom-protocol

Status: implemented

中文 | [English](2026-08-14-macos-dock-running-tile-custom-protocol.md)

## 问题

桌面 `.app` **退出后** Dock 图标有系统圆角，**运行中**却是直角方块。`Contents/Resources/AppIcon.icns` 已完整（[完整 ICNS OSType](2026-08-14-macos-dock-icon-full-icns-ostypes.md)）；运行中磁贴走了另一条路径。

## 决策

- 在 shell crate 上启用 Tauri 的 `custom-protocol`（`tauri = { features = ["custom-protocol"] }`）。Tauri 把 `cfg(dev)` 定义为 `!custom-protocol`，与 Cargo `--release` 无关。
- 启用后，codegen 将 `app_icon` 置为 `None`，Ready 处理不再调用 `NSApplication.setApplicationIconImage`。Dock 在运行中与退出后都继续使用 `CFBundleIconFile` / `AppIcon.icns`，并由系统套 squircle mask。
- Dock 磁贴仍由打包写入的 `Resources/AppIcon.icns` 负责；Rust 侧不覆盖。
- `package-macos-desktop` 冒烟（非 browser-launcher）在 `Contents/MacOS/DeepSeekHarness` 内嵌原始 `.icns` 时失败——那是 Tauri `cfg(dev)` 的 `app_icon` 载荷。

## 考虑过的替代方案

**在 PNG 主图上预烘焙圆角。** 否决：`setApplicationIconImage` 仍绕过系统 mask；预裁切素材在退出态会与 Finder mask 冲突，且所有者仍错。

**在 shell `setup` 里用 `setApplicationIconImage(None)` 清掉。** 否决：与 Tauri Ready 路径对抗，且 `cfg(dev)` 二进制仍会嵌入兆字节级 icns。

**依赖 `tauri build` / CLI。** 否决：本产品用 `package-macos-desktop` + `cargo build --release` 组装 `.app`；该 feature 必须在 crate 上显式打开。

## 后果

- `pnpm run build:macos-desktop-shell` / `package:macos-desktop` 产出的 shell 不再带 `cfg(dev)` Dock 覆盖。
- 去掉 `custom-protocol` 且无替代时，运行中 Dock 会再次变方；冒烟会抓住内嵌 icns。
- 本 shell 不做 `tauri dev` 式工作流（始终托管 Resources 里的 `dsh web` 闭包）。
