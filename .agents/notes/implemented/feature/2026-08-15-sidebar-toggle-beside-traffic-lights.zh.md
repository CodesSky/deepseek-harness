# Agent Note: 侧栏折叠按钮固定在 macOS 红绿灯旁

Status: implemented

[English](2026-08-15-sidebar-toggle-beside-traffic-lights.md) | 中文

## 问题

品牌锁迁到右上之后（[品牌锁](./2026-08-15-brand-lock-top-right-chrome.md)），侧栏展开/收起控件仍活在 `logoRow` 的 flex 流里。栏宽随展开/收起变化时，该可供性会跟着跑位，无法像同侪桌面 agent（例如 ZCode）那样，把面板切换稳定钉在绿灯右侧、与原生红绿灯共线。

## 决策

所有权仍在 `dsh-client-ui-sidebar`。在 `html[data-dsh-desktop='macos']:not([data-dsh-fullscreen])` 下，CSS 将 `.toggle` 固定为 `position: fixed; left: 80px; top: 12px; z-index: 30`（28×28 控件与 `TRAFFIC_LIGHT_X=16` / `TRAFFIC_LIGHT_Y=28` 共用中线 26）。按钮仍是 `logoRow` 内的真实 `<button>`，以便 Tauri deep-drag chrome 排除它；展开态 `logoRow` 继续作为灯下的 deep-drag 占位，并在宽内容淡出期间保持 `opacity: 1`，避免固定控件一起消失。桌面 overlay 在两种折叠态下始终以 16px 显示方向性面板字形（展开态用 `IconPanelLeftCollapseOutline16`，折叠态用 `IconPanelLeftExpandOutline16`；[顶栏 tooltip](./2026-08-15-top-bar-chrome-tooltips-and-sidebar-toggle-glyphs.md)）。折叠列宽为零、无控制轨；新建会话钉在切换旁的 `left: 116px`（[整列隐藏](./2026-08-15-collapsed-sidebar-hides-column.md)）。浏览器展开保持流式 `logoRow` 切换；浏览器折叠则在左上钉住切换与新建会话。全屏沿用既有 `:not([data-dsh-fullscreen])` 守卫，取消 macOS 固定定位。

## 曾考虑的替代方案

**由 AppFrame / `shell.overlay` 再挂一个切换。** 否决：`toggleSidebar` 与侧栏文案已注入 `SidebarRoot`；跨包复制控件会拆散可供性与折叠动画叙事。

**展开态在所有通道都 `position: fixed`。** 否决：`dsh web` 与 `--browser-launcher` 没有红绿灯；流式 `logoRow` 切换才是正确的浏览器展开布局。各通道折叠态钉住由[整列隐藏 note](./2026-08-15-collapsed-sidebar-hides-column.md) 持有。

**新增 `shell.titlebar` slot。** 本次否决：在既有侧栏控件上做 overlay 固定即可；贯通命令栏仍推迟（[沉浸式标题栏](./2026-08-15-macos-immersive-title-bar.md)）。

## 后果

- 展开与收起都在红绿灯中线上暴露可点的面板切换，且不随侧栏 track 宽度移动。
- 展开态灯旁空白的 logoRow padding 仍可拖；只有按钮吃点击。折叠态灯下拖拽来自会话 chrome。
- 若改 `TRAFFIC_LIGHT_X` / 灯簇宽度，须与 Terminal `chromeCluster`、会话 header padding 同一中线纪律重调 `left: 80px`（以及折叠新建会话的 `116px`）（[沉浸式标题栏](./2026-08-15-macos-immersive-title-bar.md)）。

## 测试

- 侧栏样式 spec 钉住固定几何、桌面新建会话 `left: 116px`、桌面 chrome-in 时 toggle 的 `animation: none`，以及 `.fading > .logoRow` 的 `opacity: 1`。
- 侧栏组件 spec 保留浏览器拖拽 chrome 断言，并在设置 `data-dsh-desktop=macos` 时点击切换。
- 壳快照仍走浏览器通道（展开流式切换；折叠顶栏 chrome）。
