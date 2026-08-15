# Agent Note: macOS 桌面端 HTTP(S) 链接在系统浏览器中打开

Status: implemented

[English](2026-08-14-macos-desktop-http-links-system-browser.md) | 中文

## 问题

在 macOS Tauri 桌面壳中，对话里点击 `http(s)://…` 链接（含 `localhost` / 其他回环端口）无反应。Markdown 将这些链接渲染为带 `target="_blank" rel="noopener noreferrer"` 的 `<a>`，没有自定义点击处理。壳只托管 WKWebView，未处理导航或新窗口请求，因此 `target="_blank"` 被吞掉。这不是 localhost 特判：壳内所有外链 HTTP(S) 都打不开。

## 决策

在**桌面壳**侧处理外链，而不是改 React markdown 渲染：

- 用 `WebviewWindowBuilder` 创建 `main` 窗口，以便挂上 `on_navigation` 与 `on_new_window`（声明式 `tauri.conf.json` 窗口无法挂这些钩子）。
- 在导航到嵌入式 `dsh web` 之前，将其就绪 URL 记为 web UI origin（scheme/host/port）。
- **留在 WebView：** 该 web UI origin，以及壳资源协议（`tauri`、`asset`、`about`）。
- **用系统浏览器打开并阻止 WebView 导航：** `on_navigation` 上其余一切 `http` / `https`（含其他 `localhost` / `127.0.0.1` 端口与公网站点），经 `tauri_plugin_opener::open_url`。
- **`on_new_window`（`target="_blank"`）：** 从不创建第二个 WKWebView；凡 `http`/`https`（含 web UI origin）都在系统浏览器打开，其他 scheme 拒绝且不打开。
- **拒绝且不打开：** 其他一切 scheme（`javascript:`、`file:`、`mailto:` 等），与 markdown sanitize 仅放行 `http`/`https` 的 authored href 一致。
- 继续启用 Tauri `custom-protocol`；不重新引入 `cfg(dev)` 的 Dock 图标覆盖。
- capabilities 仍只作用于本窗口：`core:default` 加上 overlay 标题栏的 remote 授权（`http://127.0.0.1:*` 上的 `allow-start-dragging`、`allow-is-fullscreen`，[沉浸式标题栏](../feature/2026-08-15-macos-immersive-title-bar.md)）。前端不获得 JS `openUrl` 面。Rust 处理函数直接调用 opener crate。

## 曾考虑的替代方案

**在 `ui-primitives` markdown 里拦截点击并调用 Tauri command。** 否决：浏览器启动器、纯 `dsh web`、桌面壳各自需要不同桥接，缺陷在壳缺少导航策略，不在锚点标记。

**允许所有 `localhost` / 回环主机留在 WebView。** 否决：对话链接常指向其他本地服务，必须进系统浏览器；仅嵌入式 `dsh web` origin 留在进程内。

**用系统处理器打开任意 scheme。** 否决：会宽于 UI sanitize 白名单；若标记或注入漏过，会引入 `javascript:` / `file:` 类滥用面。

**窗口仍写在 `tauri.conf.json` 里并对 `url()` 轮询。** 否决：脆弱且滞后；Tauri 2 在 builder 上提供了 `on_navigation` / `on_new_window`。

## 后果

- 对话中的 HTTP(S) 链接（含非 UI 的 localhost）在用户默认浏览器中打开；`dsh web` origin 上的应用内 SPA 导航仍在窗口内。
- 主窗口在 Rust setup 中创建；`tauri.conf.json` 的 `windows` 保持为空以便挂钩子。
- 壳单元测试覆盖 `classify_link` 分派；交互验证仍需重建 `.app` 或 release 二进制并在真实对话中点链。
- `tauri-plugin-opener` 成为壳依赖；体积仍落在既有 WKWebView 壳预算内（无 Chromium）。
