# Agent Note: macOS arm64 Tauri 桌面壳

Status: implemented

[English](2026-08-13-macos-arm64-tauri-desktop-shell.md) | 中文

## 问题

[磁盘安装闭包](2026-08-13-macos-arm64-app-bundle-desktop-distribution.md) 已在 ad-hoc 签名的 `.app` 中内嵌 Node、`dsh web` 与 pnpm，但最初的 GUI 路径是在**系统浏览器**中打开 `printUrl` 行。桌面用户需要**原生应用窗口**加载同一套本地 Web UI，在退出应用时停止 `dsh web`，并在窗口内提示端口/启动失败——且不能在已有约数百 MB 闭包之上再叠加一套 Chromium 运行时。

## 决策

交付使用**系统 WKWebView** 的 **Tauri 2（macOS arm64）壳**，并复用既有 Resources 闭包：

- `Contents/MacOS/DeepSeekHarness` 为 [`packaging/macos/shell/`](../../../../packaging/macos/shell/) 产出的 Tauri/Rust release 二进制。
- 启动时拉起内嵌 `dsh web --host 127.0.0.1 --port 0`（由操作系统分配空闲端口），解析 `dsh web: http://…` 就绪行，并导航窗口到该 URL。
- 对话中的外向 `http(s)://…` 链接在系统浏览器中打开；嵌入式 web UI origin 留在 WebView（[HTTP(S) 链接说明](../bug-fix/2026-08-14-macos-desktop-http-links-system-browser.md)）。
- 退出 / 关闭主窗口时杀死子进程，避免端口残留。
- 启动错误在壳的加载页内展示（不只写 stderr）。
- `Resources/{node,dsh,pnpm,bin}` 保持 M0–M3 闭包布局；壳**不**再附带第二份 `node_modules`。
- zsh 浏览器启动器移至 [`launcher-browser/`](../../../../packaging/macos/launcher-browser/)，可通过 `package-macos-desktop --browser-launcher` 安装。
- Release profile：`lto`、`strip`、`opt-level = "z"`、`panic = "abort"`。体积预算：壳二进制 ≤ **15–20 MB**；相对浏览器启动器的壳增量尽量 **&lt; 25 MB**；DMG 总量仍由运行时闭包主导（分别报告壳与闭包体积）。
- ad-hoc codesign 以及与 SEA/Python 分轨仍遵循[闭包笔记](2026-08-13-macos-arm64-app-bundle-desktop-distribution.md)。

构建：`pnpm run build:macos-desktop-shell`、`pnpm run package:macos-desktop`。CI workflow 安装 Rust 并缓存 `packaging/macos/shell/src-tauri/target`。

## 曾考虑的替代方案

**Electron 壳。** 附带 Chromium，通常在 Node 闭包之上再增加约 **100+ MB**。否决：包体积是硬约束，且 UI 已是本地 web 应用。

**继续以仅浏览器启动器为产品默认。** 壳增量为零，但不满足原生窗口要求。仅保留为 `--browser-launcher` 兜底。

**由 Tauri bundler 另产一套带独立资源树的 `.app`。** 有复制或分叉闭包布局的风险。否决；仍由 `package-macos-desktop.ts` 组装 App Bundle，并把一个 release 二进制拷进 `Contents/MacOS/`。

**固定 3080 端口再做重试循环。** `dsh web` 已支持 `--port 0`；优先操作系统分配端口，若日志仍出现 `EADDRINUSE` 再在窗口提示。

## 后果

- 双击用户在同一套 `dsh-web-frontend` / `dsh web` 栈上获得原生窗口。
- 打包与 CI 需要 Rust 工具链；闭包构建仍只需 Node/pnpm。
- 壳二进制体积与 DMG 体积一并测量并记录；引入 Electron 量级运行时的回归不在策略内。
- 完整交互对话仍需要凭证；自动冒烟仍覆盖 Mach-O 类型、codesign，以及 PATH wrapper / `web --help`。
