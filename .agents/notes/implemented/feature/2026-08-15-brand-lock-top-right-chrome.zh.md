# Agent Note: 品牌锁旁靠右上角 Terminal chrome

Status: implemented

[English](2026-08-15-brand-lock-top-right-chrome.md) | 中文

## Problem

完整品牌锁（鲸鱼 + deepseek 字标 + HARNESS 徽章）原先放在侧栏 `logoRow`、与面板折叠按钮并排。在 macOS overlay 标题栏下（[沉浸式标题栏](./2026-08-15-macos-immersive-title-bar.md)），产品品牌会落在红绿灯旁，迫使展开态 logo 行增加 78px 左 inset，并挤占红绿灯本应叠在其上的沉浸式 chrome。

## Decision

把品牌锁移入 `dsh-client-ui-terminal` 持有的 Terminal chrome 簇：

- 英雄页：`shell.overlay` 的 `TerminalChrome` 以固定右上角渲染 `[BrandWordmark][终端按钮]`。
- 实况会话：`conversation.session.header.utilities` 的 `TerminalAction` 以相同顺序内联渲染在 Session log 旁。
- 侧栏 `logoRow` 保留面板切换（浏览器：流式右缘；macOS overlay 固定在红绿灯旁——[红绿灯旁切换](./2026-08-15-sidebar-toggle-beside-traffic-lights.md)）。浏览器 rail 仍在悬停时在鲸鱼与面板图标间切换；桌面 overlay 始终显示方向性面板字形（[顶栏 tooltip](./2026-08-15-top-bar-chrome-tooltips-and-sidebar-toggle-glyphs.md)）。展开态 logo 行去掉红绿灯左 inset。

品牌图为装饰（`pointer-events: none`）；仅终端控件可点。浏览器通道从不设置 `data-dsh-desktop`，因此获得品牌+终端簇，且没有桌面红绿灯 inset。

## Alternatives considered

**品牌始终挂在 `shell.overlay`，实况会话时终端仍在 utilities。** 否决：当终端双胞胎移入 header 时，品牌不再紧挨终端图标左侧。

**新增横跨各列的 `shell.titlebar` slot。** 本次否决：既有 overlay／utilities 双胞胎已安置终端控件；品牌跟随该簇即可（[沉浸式标题栏](./2026-08-15-macos-immersive-title-bar.md) 已推迟贯通命令栏）。

**侧栏保留字标作为 New Session 快捷方式。** 否决：胶囊仍是明确的 New Session 控件；在已迁走的品牌上重复该手势会挤占 Terminal 簇。

## Consequences

- 展开侧栏折叠按钮旁的红绿灯叠区不再放品牌；品牌仍在右上与终端同簇可见。
- 点击字标不再新建会话；仅 New Session 胶囊负责。
- 沉浸式标题栏 CSS 不再给展开态 `logoRow` 加 78px padding（[沉浸式标题栏](./2026-08-15-macos-immersive-title-bar.md)）。

## Testing

- 侧栏组件与样式 spec 断言仅一个 New Session 胶囊，且展开态 logo 行无 78px inset。
- Terminal chrome spec 断言英雄页与 utilities 座位上品牌都在终端按钮之前。
- 侧栏 shell 快照刷新后不再含字标按钮。
