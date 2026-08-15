# Agent Note: 基于 `ctx.terminals` 的交互式 Web 终端面板

Status: implemented

[English](2026-08-14-interactive-web-terminal-panel.md) | 中文

## Problem

编码 preset 已暴露 6 个面向模型的持久 PTY 工具（[持久 PTY 会话](./2026-07-16-persistent-pty-sessions.md)）。Web 客户端已将一次性与 PTY 工具*结果*渲染为只读终端卡片（[Web 终端卡片](./2026-07-28-web-terminal-card.md)）。若无可交互面板，需要人类键盘介入的工作流（密码提示、模型无法驱动的 TUI 片段、检查卡住的 REPL）会把用户逼出产品、进入不共享 agent 沙箱／审批／所有者围栏的外部终端。

## Decision

交付一条挂接到现有 `ctx.terminals` seam 的产品 UI 路径。不替换 `dsh-terminal`／`dsh-terminal-bash`／`dsh-tool-terminal`。模型继续使用六工具；浏览器为同一所有者作用域会话增加可选的交互视口。

### 包拓扑

| 包 | 职责 |
|---|---|
| `@deepseek-ai/dsh-terminal` | 后端会话与服务上的 `attach`／`writeRaw`／`resize`，与其他操作一样受所有者围栏约束 |
| `@deepseek-ai/dsh-subprocess`／`dsh-subprocess-local` | 经 node-pty 的 `SubprocessTerminalHandle.resize` |
| `@deepseek-ai/dsh-host-apiproxy` | `terminal.list`／`attach`／`detach`／`write`／`resize` 一元方法；`session/terminal-chunk` mux 帧；从不把原始字节写入 session 事件日志 |
| `@deepseek-ai/dsh-client-ui-terminal` | xterm.js 面板；右上角终端图标（chrome／header utilities）；详情列中的 `terminal.panel`；键盘 → write；ResizeObserver → resize |

原始 PTY 字节仍为进程本地。PTY Agent Note 中的该持久化不变量保持不变，除非后续设计明确增加带自有留存与隐私约定的 opt-in transcript 汇。

### 放置

`ui-conversation` 仍在详情列中声明 `terminal.panel`，用于附加模型拥有的 PTY。主要产品入口是独立的 Host 用户 shell dock（[独立用户 shell dock](./2026-08-14-independent-user-terminal-dock.md)）：右上角终端图标（英雄页 chrome overlay 或会话头 utilities）与 `shell.dock` 上位于 center+details 下方的底部 dock，经 `terminal.open` 拉起且无需聊天会话。

### RPC 与流

一元方法走遗留 API Proxy（`terminal.*`）。字节块复用 mux WebSocket 上的 `session/terminal-chunk` 帧（base64 载荷 + 可选 `overrun`）。当 mux 队列缓冲帧数超过上限时，Host 丢弃并标记 overrun，而不是为 UI 消费者无界缓冲原始字节。

### 安全与审批对齐

- 每次 attach／write／resize／list 都要求拥有该 PTY 的精确实时 Agent（与 `dsh-tool-terminal` 相同围栏）。
- Agent 拥有的 PTY 的 spawn 仍走模型工具／沙箱／审批路径；Host `terminal.open` 是独立的用户 shell spawn 路径（[独立用户 shell dock](./2026-08-14-independent-user-terminal-dock.md)）。
- 向 PTY 写入在权限上等价于 `submit: false` 的 `terminal_send`。
- 原始流不持久化进 `tool/call`／`tool/result` 或新的 session 事件。
- 跨 agent attach 被拒绝。
- 模型 send 活跃期间仍允许 UI write；服务保留一个模型 send 预留并记录干扰。

## Alternatives considered

**仅通过 `terminal_send`／`terminal_read` 驱动面板。**因交互用途拒绝：就绪等待与 scrollback 分页无法承载击键延迟或连续重绘。

**用单一 UI 拥有的 shell 替换六工具。**拒绝：模型可见工作必须可从 session 日志重建；这些工具已提供该路径。

**把原始字节记入 session。**v1 拒绝：凭证与体积风险；PTY note 已将原始字节保持为进程本地。

**ACP 终端广告。**超出范围；ACP 保持自动化取向，不增加并行终端协议。

## Verification

- Terminal 服务单元覆盖所有者围栏下的 `attach`／`writeRaw`／`resize`，且不占用 `SEND_ACTIVE`。
- Subprocess-local 在 node-pty 句柄上覆盖 resize。
- Host mux schema 与 API Proxy 路由覆盖 `terminal.*` 与 `session/terminal-chunk`。
- API Proxy 通过 `agentPresets.serviceFor` 解析 preset isolate realm 中的 `terminals`，并以 host `ctx.get` 为回退。
- 面板在打开期间始终挂载 xterm host，使 attach 可在首次 `terminal.list` 结果之前绑定。
- Client store 覆盖面板打开／选择；Web 组合注册 `@deepseek-ai/dsh-client-ui-terminal`。

## Consequences

**交互键盘访问留在产品围栏内。**用户可在不离开 Web 客户端的情况下附加到所有者作用域 PTY。

**原始字节体积远离耐久日志。**高吞吐 attach 使用带可见 overrun 标记的 mux 背压；隐私与留存保持进程本地。

**从 `terminal_open` 工具卡片深链以及 Windows ConPTY 交互路径仍推迟。**macOS／Linux Web 路径是受支持的交互面。
