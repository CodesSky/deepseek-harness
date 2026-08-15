# Agent Note: 折叠侧栏整列隐藏（对齐 ZCode）

Status: implemented

[English](2026-08-15-collapsed-sidebar-hides-column.md) | 中文

## 问题

折叠侧栏仍保留 56px 带右边框的控制轨（切换、新建会话、工作区添加/搜索、设置）。在 macOS overlay 壳上，该轨及其右缘边框紧挨红绿灯，会把标题栏区域与会话底色从视觉上切开。同侪桌面 agent（例如 ZCode）在折叠时整列隐藏侧栏，顶栏只保留面板切换与新建会话。

## 决策

关闭侧栏宽度为 AppFrame 让步求解中的 `SIDEBAR_COLLAPSED = 0`。`data-sidebar-collapsed` 去掉侧栏列右框与填充，不再留下竖缝。展开态布局不变。

chrome 仍由 `dsh-client-ui-sidebar` 持有。既有 150ms 宽内容淡出结束后，收起态不再绘制轨：`regionArea` 与 `footArea` 为 `display: none`（seat 仍挂载以保留状态）。面板切换与新建会话图标作为固定顶栏控件留在 `logoRow`——浏览器为 `left: 12px` / `48px`，macOS overlay 为 `left: 80px` / `116px`（切换 + 8px 间距 + 28px）。展开态新建会话仍只用栏内胶囊，折叠态不重复。淡出中段在各通道保持 `logoRow`（因而保持切换）`opacity: 1`，避免滑向零宽的 track 裁切可供性。搜索、工作区添加与设置仍需展开后使用，不抬进顶栏。

浏览器通道同样整列隐藏，并在左上放置 chrome（无红绿灯 inset）。原先折叠轨上的鲸鱼 ↔ 面板切换已移除。

AppFrame 在 frame 上发布 `--dsh-collapsed-chrome-inset`，供实况会话标题栏让开该 chrome：浏览器为 `84px`（切换 `12` + `28` + `8` + 新建会话 `28` + `8`），macOS overlay 为 `152px`（新建会话 `116` + `28` + `8`；切换 `80` 落在该跨度内），展开为 `0px`。会话标题栏仅在 `[data-sidebar-collapsed]` 下把它用作 `padding-left`；`dsh web` 从不加红绿灯 `80px` inset。

## 曾考虑的替代方案

**仅浏览器保留 56px 轨。** 本次否决：产品要求是侧栏隐藏；浏览器无轨与 ZCode 一致，也避免第二套折叠叙事。`wide === false` 时工作区轨样式可暂时闲置。

**把原轨上全部图标抬进标题栏。** 否决：只有新建会话放在切换右侧；其余操作需先展开。

**把折叠 chrome 挪到 AppFrame / `shell.overlay`。** 否决：`toggleSidebar`、`startSession` 与侧栏文案已注入 `SidebarRoot`（[红绿灯旁切换](./2026-08-15-sidebar-toggle-beside-traffic-lights.md)）。

## 后果

- 折叠后主内容铺到窗口左缘；红绿灯落在连续的会话底色上。实况会话标题栏的标题、操作与工具从钉住的 chrome 右侧开始，而不是压在灯下。
- 设置与工作区搜索在侧栏展开前不可达。
- 重调红绿灯几何时，切换的 `left: 80px`、新建会话的 `left: 116px` 与 overlay `--dsh-collapsed-chrome-inset: 152px` 须一起移动（[沉浸式标题栏](./2026-08-15-macos-immersive-title-bar.md)）。

## 测试

- 布局列宽 spec 断言 `SIDEBAR_COLLAPSED === 0` 与关闭 track。
- AppFrame CSS 清除折叠侧栏边框并发布 `--dsh-collapsed-chrome-inset`；组件 spec 保持折叠 owner props 宽度为 0。
- 会话样式 spec 钉住标题栏仅在 `[data-sidebar-collapsed]` 下用该变量作 `padding-left`。
- 侧栏样式 spec 钉住固定 chrome 几何（浏览器 12/48，macOS 80/116）、隐藏的 region/foot，以及淡出透明度。
- 侧栏组件与快照 spec 断言 settle 后与冷启动折叠时只有一个新建会话控件。
