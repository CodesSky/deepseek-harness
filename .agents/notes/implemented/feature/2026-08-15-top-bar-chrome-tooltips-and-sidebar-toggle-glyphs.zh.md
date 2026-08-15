# Agent Note: 顶栏图标 tooltip 在下方与侧栏方向性字形

Status: implemented

[English](2026-08-15-top-bar-chrome-tooltips-and-sidebar-toggle-glyphs.md) | 中文

## 问题

顶栏图标 chrome 混用两套标签：侧栏切换与新建会话用默认 `side="right"` 的 `Tooltip`，气泡落在控件右侧（紧邻红绿灯与其它顶栏同伴时别扭）；终端入口则用原生 `title`。展开与收起还共用同一个 `IconPanelLeftOutline16`，无法像同侪桌面 agent（例如 ZCode）那样用「左侧竖条 + 方向 chevron」表明下一次点击是藏栏还是展栏。

## 决策

顶栏图标标签与方向性面板字形统一为：

- 侧栏切换、折叠态新建会话、以及 Terminal chrome/utilities 的按钮都包在 `Tooltip` 里，`side="bottom"` 且 `delayMs={500}`（与客户端其余 UI 同一气泡）。气泡 portal 到 `document.body`，避免被 flex 标题栏当成流内兄弟。去掉这些 Terminal 按钮上的原生 `title`，只保留共享气泡。
- `dsh-client-ui-primitives` 在共享 panel-left 线框路径上增加 `IconPanelLeftCollapseOutline16`（左轨 + 左 chevron）与 `IconPanelLeftExpandOutline16`（左轨 + 右 chevron）。侧栏打开时切换显示收起字形；折叠时显示展开字形。`aria-label` / tooltip 文案仍为 `toggle.collapse` / `toggle.open`，与字形一致。
- 桌面固定切换与浏览器流式 / 折叠左上 chrome 都走 `SidebarRoot`，因此各通道共用同一套字形与下方 tooltip（[红绿灯旁切换](./2026-08-15-sidebar-toggle-beside-traffic-lights.md)）。

## 曾考虑的替代方案

**仅侧栏切换保留 `side="right"`。** 否决：顶栏同伴读作一行；侧向气泡与红绿灯、Terminal 簇冲突。

**一个面板图标用 CSS 翻转。** 否决：镜像会把竖条翻到右侧；设计要求侧栏竖条始终在左，只翻转 chevron。

**终端继续用原生 `title` 以免引入 Tooltip。** 否决：浏览器对 `title` 的样式与时序不同于产品 tooltip，破坏顶栏标签统一。

## 后果

- 侧栏切换、新建会话（折叠态）与 Terminal 的悬停/焦点标签落在图标下方，共用 tooltip 底板。
- 仅凭字形即可区分展开/收起；文案与动作保持一致。
- Dock 内新建/关闭标签仍可用 `title`；只有顶栏 Terminal 入口迁到 `Tooltip`。

## 测试

- 图标集计数包含两个面板方向字形；侧栏 shell spec 断言打开与折叠态的 chevron path 不同。
- 侧栏 shell 快照随新字形 content hash 刷新。
- Terminal chrome spec 保持品牌 + 图标坐席；Tooltip 包裹 Terminal 按钮且不改动簇布局；Tooltip spec 断言气泡是 `document.body` 的子节点。
