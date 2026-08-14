# Agent Note: macOS Dock 需要完整 ICNS OSType

Status: implemented

中文 | [English](2026-08-14-macos-dock-icon-full-icns-ostypes.md)

## 问题

桌面 `.app` 在 Finder / Launchpad /「应用程序」中图标正常，但 **Dock 磁贴空白**。`Contents/Resources/AppIcon.icns` 存在且 `CFBundleIconFile=AppIcon`，文件却只有 128/256/512 的 PNG 条目。Retina 下 Dock 还需要 1024 与 @2x 的 OSType。

## 决策

- 从 `icon-1024.png` 生成 **RGBA** iconset（Tauri `CachedIcon::new_png` 要求 RGBA；RGB 主图补不透明 alpha）。
- 用 [`pack_icns.py`](../../../../packaging/macos/icon/pack_icns.py) 打包 `AppIcon.icns`，写入全部 PNG OSType（`icp4`/`icp5`/`ic07`–`ic14`/`ic10`/`ic11`/`ic12`），并在打包后与 `package-macos-desktop` 冒烟中 **校验** 这些标签。
- **不要**单独依赖 `iconutil -c icns`：当前 macOS 会从完整 `.iconset` 静默丢掉 1024 与 @2x。
- 保持 `CFBundleIconFile=AppIcon`（不用 asset catalog / `CFBundleIconName`）。macOS 上 `set_window_icon` 为空操作；仅在 `cfg(dev)` 下 Tauri 会嵌入 `app_icon` 并调用 `setApplicationIconImage`。生产 shell 构建必须启用 `tauri/custom-protocol`，否则会走该路径（[运行中 Dock 磁贴](2026-08-14-macos-dock-running-tile-custom-protocol.md)）。
- 在 `tauri.conf.json` 中把 `icons/icon.png` 放在首位，使 `find_icon` 优先选用 1024 主图作为默认窗口图标载荷。

## 考虑过的替代方案

**信任 `iconutil -c icns`。** 否决：同一 iconset 会得到 Finder 可见但 Dock 不完整的 icns。

**只让用户 `killall Dock`。** 不够：磁盘上的 icns 缺少 Dock 尺寸，清缓存变不出 OSType。

**Asset catalog + `CFBundleIconName`。** 完整 Resources `.icns` 已够用，且会引入仅 Xcode 的工具链。

## 后果

- [`icon/rebuild.sh`](../../../../packaging/macos/icon/rebuild.sh) 是唯一支持的重建路径；改主图后需重新打包并跑 `package:macos-desktop`（Tauri 图标变更时需重建 shell）。
- 若 `AppIcon.icns` 缺少必需 OSType，冒烟失败。
- 替换已签名 `.app` 后，优先在 Finder 中显示/重新固定到 Dock；`killall Dock` 仅作最后手段的缓存刷新（见 [README](../../../../packaging/macos/README.md)）。
