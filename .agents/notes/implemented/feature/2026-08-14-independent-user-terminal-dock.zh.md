# Agent Note: 独立 Host 用户 shell 终端 dock

Status: implemented

[English](2026-08-14-independent-user-terminal-dock.md) | 中文

## Problem

交互式 Web 终端面板（[交互式 Web 终端面板](./2026-08-14-interactive-web-terminal-panel.md)）只能附加到模型已调用 `terminal_open` 之后、由实况聊天 Agent 拥有的 PTY。希望不开启一轮对话就使用本地 zsh 的用户没有产品入口：编码 preset 把 `ctx.terminals` 挂在 isolate realm 内，Host 组合往往没有面向用户的 spawn 路径。

## Decision

在既有模型拥有的 PTY 工具旁交付一条 Host 拥有的用户 shell 路径。

### Host seam

| 部件 | 职责 |
|---|---|
| Web-app `user-terminal` 组 | 挂载 host `dsh-terminal` + `dsh-terminal-bash`（`backendType: user-shell`，`profile: user`，shell 为 `$SHELL` 或 Darwin 上的 `/bin/zsh`）；与其余 PTY 栈一并在 Windows 上禁用 |
| `dsh-terminal-bash` `profile` | `controlled` 保留模型就绪（dumb TERM、受控 PS1）；`user` 使用 `xterm-256color` 与交互式 profile |
| ApiProxy `terminal.open`／`close` | 拉起与关闭 Host 用户 shell；list／attach／write／resize 接受 `USER_SHELL_SESSION_ID` |
| 分离的所有者 Agent | 以 `USER_SHELL_SESSION_ID` 注册且不进入 SessionStore，因而从不出现在 `session.list` |

模型工具继续使用 isolate realm 的 `terminals`。Host `ctx.get('terminals')` 只服务用户 shell 所有者。面板笔记中的所有者围栏、沙箱策略解析与原始字节耐久性不变量保持有效。

### UI

`dsh-client-ui-terminal` 在 `shell.overlay` 上注册右上角「品牌锁 + 终端」chrome 簇，在 `shell.dock` 上注册底部 dock（AppFrame 中位于 center+details 下方的行，侧栏保持全高），并在实况会话的 `conversation.session.header.utilities` 中与 Session log 并排注册同一簇，用 flex/gap 避免叠压。品牌字标在两个座位上都位于终端图标左侧（[品牌锁 chrome](./2026-08-15-brand-lock-top-right-chrome.md)）。空 dock 打开时调用 `terminal.open`，cwd 在已知时取最近工作区路径。多 tab 的 `+`／关闭对应 open／close。每个 tab 保留各自的 xterm 宿主（非活动宿主保持挂载但隐藏）。隐藏 dock 时保留实况 tabs、每 tab 缓冲与当前选中 attach 流；作者 CSS 强制 `[hidden]` 收起布局。再次打开与选中 tab 时 FitAddon 重新 fit、refresh、focus 并推送 `terminal.resize`，无需按键即可看到已有屏幕内容。详情列面板仍用于模型拥有的 PTY 附加，并在 dock 拥有当前选中 id 时保持静默。

## Alternatives considered

**打开 shell 前必须先有空白聊天会话。**拒绝：产品入口必须在无会话的英雄页可用。

**经当前 agent isolate spawn。**无实况 agent 时不可行；且会把人类键盘所有权与模型工具所有权混在一起。

**用 UI shell 替换六模型工具。**拒绝：模型可见工作必须可从 session 日志重建（[持久 PTY 会话](./2026-07-16-persistent-pty-sessions.md)）。

## Verification

- ApiProxy 单元覆盖 `USER_SHELL_SESSION_ID` 下的 `terminal.open`／`close`，且不污染 SessionStore。
- 既有聊天 agent 的所有者围栏 attach／write／resize 与 mux chunk 测试保留。
- `terminal-bash` 配置接受 `profile: user`。
- Client store 覆盖 dock tabs；浏览器插件在 `shell.overlay` 注册品牌+终端 chrome、在 `shell.dock` 注册 dock，并在 `conversation.session.header.utilities` 注册同一簇。
- Dock 隐藏／重开保留 attach 与 xterm；重开调用 FitAddon.fit 与 `terminal.resize`，且不 dispose 视口。
- Web 组合挂载 `user-terminal` 组并依赖 `dsh-terminal`／`dsh-terminal-bash`。

## Consequences

**用户可从 chrome 打开交互式 shell，无需模型回合。**默认 cwd 在客户端已知时跟随最近工作区，否则为 Host 默认 cwd。

**人类与模型 PTY 所有权落在不同服务实例上**（host vs isolate），跨 attach 在构造上不可能。

**Windows 随 ConPTY 一并推迟**；该组在彼处禁用，避免组合声称残缺入口。
