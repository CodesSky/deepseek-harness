# Agent Note: 终端 dock 关闭与每 tab 独立 xterm 缓冲

Status: implemented

[English](2026-08-15-terminal-dock-close-and-tab-switch.md) | 中文

## Problem

在[隐藏时保留 xterm](./2026-08-14-terminal-dock-hide-preserves-xterm.md) 之后仍有两处缺陷：

1. 点击 dock 标题栏 × 会把 `open=false` 并设置 HTML `hidden`，但作者样式 `.dock { display: flex }` 盖过 UA 的 `[hidden]` 规则，面板仍完全可见且可交互——关闭控件看起来无效。
2. 多 tab 共用一个 xterm，attach 时调用 `reset()`，而 Host `terminal.attach` 不回放 scrollback。切到另一 tab 只见空光标，直到 focus 并回车才重打提示符。

## Decision

在模块 CSS 中强制收起：`.dock[hidden], .dock[data-open='false'] { display: none !important }`（非活动 `.dockTermHost[hidden]` 同样处理）。保留先前笔记的「保持挂载」隐藏约定。

每个 dock tab 自有 xterm 宿主，tab 存在期间保持挂载。非活动宿主用 `hidden`，不 dispose Terminal。选中或 dock 重开时对该 PTY 执行 fit、refresh、focus 与 `terminal.resize`。对已有的每 tab Terminal，重新 attach 时绝不 `reset()`。

## Alternatives considered

**每次 attach 回放 Host scrollback。** 拒绝：Web `terminal.*` API 仍无面向 UI 的 scrollback 读取；每 tab 客户端缓冲已保存用户见过的内容。

**共用一个 xterm，切换时序列化／反序列化缓冲。** 拒绝：比每 tab 一个存活 Terminal 更重，attach 语义相同。

**仅依赖 HTML `hidden` 关闭 dock。** 拒绝：在 Chromium／WebKit 中作者 `display: flex` 会赢过非 `!important` 的 UA 规则，面板不会收起。

## Verification

- `packages/client/ui-terminal/tests/dock.client.spec.tsx`：dock × 设置 `hidden` + `data-open=false`；切 tab 每 tab 一个宿主、不调用 `reset`，并调用 fit／refresh／focus。
- 对运行中 Host 的 Playwright：关闭后面板高度为 0；建两个 tab 并切换，无需回车即见各 tab 提示符；隐藏再打开仍保留内容。

## Consequences

关闭是布局意义上的关闭，而不只是 store 状态。检查 `data-open` 的运维可相信它与可见性一致。非活动 tab 在 detach 期间不接收 mux chunk；后台产出的输出不会显示，直到 shell 再次打印（与任何 detach 空窗相同）。分屏仍超出范围。
