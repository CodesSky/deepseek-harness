# Agent Note: macOS 沉浸式 overlay 标题栏

Status: implemented

[English](2026-08-15-macos-immersive-title-bar.md) | 中文

## 问题

Tauri 2 / WKWebView 桌面壳（[壳说明](../architecture/2026-08-13-macos-arm64-tauri-desktop-shell.md)）使用默认 macOS 标题栏：独立一条、带窗口标题，并在 web UI 上方画水平分隔线。产品 chrome（侧栏 `logoRow`、会话 header、终端 overlay）落在该条之下，窗口因此对不齐同侪桌面 agent（智能体）那种隐藏标题栏、红绿灯叠在应用底色上的观感。

## 决策

保留原生 decorations 与系统红绿灯。壳窗口使用 `TitleBarStyle::Overlay`、`hidden_title(true)`、`decorations(true)`、`accept_first_mouse(true)`，以及固定的 `traffic_light_position` `{ x: 16, y: 28 }`——这是把绘制后的红绿灯叠在 40px 侧栏 `logoRow` 中线上的平台 chrome 常量（外加 6px 列 padding → 中心 26），不是 Config 可调参。`y: 28` 比按 12px 灯高的朴素顶边公式（`y: 20`）多 8，因为 macOS overlay 绘制相对 Tauri `LogicalPosition` 顶边与 CSS 的换算偏高；对齐时下移灯，而不是把 web chrome 往上拧。Web chrome 共用该中线：展开态 `logoRow` 高 40px，英雄页 Terminal 簇 `top: 10px`（32px 按钮），实况会话 header 在 32px 标题行上方垫 `10px`。

`initialization_script`（`packaging/macos/shell/ui/desktop-init.js`）在每一次顶层导航上运行，包括 `navigate()` 之后的 `http://127.0.0.1`。在嵌入式 web UI origin 与 Tauri 资源协议上，它设置 `document.documentElement.dataset.dshDesktop = 'macos'`，查询 `plugin:window|is_fullscreen`，并把 `data-tauri-drag-region` 盖到 `[data-dsh-drag-chrome]` 标记上（chrome 行用 `deep`，空白 padding 可拖、按钮仍可点）。全屏时设置 `data-dsh-fullscreen` 并去掉这些拖拽属性；Rust 的 resize 处理函数会再次 eval 同一标志。capabilities 把 `core:window:allow-start-dragging` 与 `core:window:allow-is-fullscreen` 授予 `http://127.0.0.1:*`，使 IPC 在换 origin 后仍可用。WKWebView 没有 `-webkit-app-region`；命中测试由 Tauri 注入的拖拽脚本负责。

Web CSS 在 `html[data-dsh-desktop='macos']:not([data-dsh-fullscreen])` 下把侧栏面板切换固定在红绿灯旁（`left: 80px`、`top: 12px`），使展开/收起落在灯中线上；折叠时另把新建会话钉在 `left: 116px`，侧栏列宽为零（[红绿灯旁切换](./2026-08-15-sidebar-toggle-beside-traffic-lights.md)、[整列隐藏](./2026-08-15-collapsed-sidebar-hides-column.md)）。展开态 `logoRow` 仍作灯下 deep-drag 占位。实况会话标题栏读取 AppFrame 的 `--dsh-collapsed-chrome-inset`（overlay 折叠为 `152px`），使标题与操作从该 chrome 之后开始；展开侧栏已盖住灯，标题栏仍用 `20px`。只要存在桌面 dataset，会话 header 的 1px `::after` 即为透明。英雄页与 settling 阶段在会话列顶部画一条 52px 拖拽带；实况会话 header 带 `data-dsh-drag-chrome="deep"`。`dsh web` 与 `--browser-launcher` 从不加载该 init script，因此保持展开流式 `logoRow` 切换、零红绿灯 inset、零 `data-tauri-drag-region`。`host.describe.canOpenPath` 不是桌面壳信号。

## 曾考虑的替代方案

**Electron `titleBarStyle: 'hidden'` / Chromium `-webkit-app-region`。** 否决：壳体积预算禁止再塞一套 Chromium 运行时（[壳说明](../architecture/2026-08-13-macos-arm64-tauri-desktop-shell.md)）。

**`decorations(false)` 加 CSS 自绘红绿灯。** 否决：会丢掉原生红绿灯、全屏和系统阴影；Overlay 样式已经保留这些。

**只用 `TitleBarStyle::Transparent`、不用 Overlay。** 否决：标题栏仍占高度，内容不会画到红绿灯底下。

**用 `host.describe.canOpenPath` 判断桌面壳。** 否决：普通 `dsh web` 在带桌面打开器的 Mac 上该标志也为 true。

**新增横跨三列的 `shell.titlebar` slot。** 本次否决：overlay、inset 与拖拽已能落在现有 chrome 上；贯通命令栏是另一项产品工作。

## 后果

- 双击 `.app` 的用户会看到红绿灯叠在应用底色上、没有原生标题栏分隔线；浏览器与 `--browser-launcher` 布局不变。
- 红绿灯像素是固定的平台常量；若改 `logoRow` 高度、Terminal `chromeCluster` 的 top、或会话 header 顶 padding，必须重调 `TRAFFIC_LIGHT_Y`（及对应 CSS），使绘制后的灯中线仍落在 web 的 center 26——优先改 Y，而不是把 web chrome 往上拧。
- Remote IPC 仅限 `http://127.0.0.1:*` 与上述两个窗口命令；出站链接策略不变（[HTTP(S) 链接说明](../bug-fix/2026-08-14-macos-desktop-http-links-system-browser.md)）。
- Windows / Linux 的 frameless chrome 仍不在范围内：当前 packaging 只做 macOS。

## 测试

- 壳单元测试钉住 init-script 约定、capability 的 remote URL，以及全屏 eval 字符串。
- `packaging/macos/shell/tests/desktop-init.spec.ts` 在 jsdom 中运行该脚本：127.0.0.1 会盖上拖拽区，公网 origin 保持未标记，全屏会清掉拖拽区。
- 侧栏、会话与终端的样式 spec 钉住 overlay 选择器与共用中线几何（40px `logoRow` 占位、固定切换 `top: 12px` / `left: 80px`、`chromeCluster` `top: 10px`、header `padding-top: 10px`）；会话样式 spec 钉住折叠态 header `padding-left` 使用 `--dsh-collapsed-chrome-inset`；组件 spec 断言浏览器通道上有 `data-dsh-drag-chrome` 且没有 Tauri 属性。
