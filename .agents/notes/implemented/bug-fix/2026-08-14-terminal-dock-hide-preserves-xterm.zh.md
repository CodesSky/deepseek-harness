# Agent Note: 终端 dock 隐藏时保留 xterm 缓冲

Status: implemented

[English](2026-08-14-terminal-dock-hide-preserves-xterm.md) | 中文

## Problem

关闭独立用户 shell dock（[独立 Host 用户 shell 终端 dock](../feature/2026-08-14-independent-user-terminal-dock.md)）时，`open` 变为 false 会卸载 React 树。这会 dispose xterm 实例并 detach Host `terminal.attach` 流，而 PTY tab 列表仍保留。再次打开会创建空视口并重新 attach，但无 scrollback 回放（`terminal.attach` 只投递后续 chunk；Web API 没有 scrollback 读取）。shell 进程仍在，因此回车会打出新提示符；在此之前 dock 看起来是空白的。

## Decision

只要仍有 dock tab，就保持 dock 挂载，关闭时仅设置 HTML `hidden`（以及 `data-open=false`）。作者样式 `.dock { display: flex }` 否则会盖过 UA 的 `[hidden]` 规则，面板仍绘制且可点，因此模块 CSS 强制 `.dock[hidden], .dock[data-open='false'] { display: none !important }`。xterm、FitAddon 与当前选中 tab 的 attach 订阅继续存活，从而保留屏幕缓冲与实时输出。再次打开时清除 `hidden`，执行 FitAddon.fit、刷新视口行、focus 终端，并推送 `terminal.resize`，使几何与可见宿主一致，无需按键。ResizeObserver 在 dock 隐藏或 tab 非活动时跳过 fit，避免 0×0 宿主污染 PTY 的 cols/rows。移除最后一个 tab（或完全卸载）仍会销毁视口并 detach；关闭 tab 仍调用 `terminal.close` 并结束该 shell。每 tab 独立 xterm 宿主（见[dock 关闭与切 tab](./2026-08-15-terminal-dock-close-and-tab-switch.md)）把同一「保持挂载」规则扩展到 tab 切换。

## Alternatives considered

**每次重新 attach 时回放 Host scrollback。** 对本缺陷拒绝：`terminal.*` 没有面向 UI 的 scrollback 读取；在仍有 tab 时每次隐藏都销毁视口并无必要。

**重开时发送重绘或回车。** 拒绝：会改动 PTY，且无法恢复用户已见过的先前 scrollback。

**仅用 CSS `display:none` 却不保留 attach。** 拒绝：已 dispose 或已 detach 的视口在重开同一 tab 时仍会丢掉用户期望的屏幕。

## Verification

- `packages/client/ui-terminal/tests/dock.client.spec.tsx` 断言隐藏不触碰 attach/dispose，重开调用 fit、refresh 与 resize；dock × 设置 `hidden`，并由作者 CSS 收起布局。
- 手动或 Playwright：打开 dock → 见提示符 → 切换关闭（高度为 0）→ 切换打开 → 不按回车仍可见提示符或先前内容。

## Consequences

隐藏不再等同于视口拆除。若运维曾期望在仍有 tab 时于隐藏时 detach 以放下 mux 订阅，现在会在最后一个 tab 关闭之前为当前选中 tab 保留一个 attach 监听器。
