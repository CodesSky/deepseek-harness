# @deepseek-ai/dsh-client-ui-terminal

[English](README.md) | 中文

基于既有 `ctx.terminals` seam 的交互式 Web PTY 界面。注册右上角固定入口与底部 dock：经 `terminal.open` 拉起 Host 拥有的用户 shell（无需聊天会话或模型工具）；另可选详情列面板用于附加模型拥有的 PTY。原始 PTY 字节保持进程本地，从不写入 session 事件日志。

## Contract

- 右上角 chrome 簇：品牌字标在终端图标左侧，二者切换底部 dock（英雄页 chrome overlay，或会话头 utilities 与 Session log 并排）。终端按钮使用共享的下方 `Tooltip`（不用原生 `title`），与其它顶栏图标标签一致（[顶栏 tooltip](../../../.agents/notes/implemented/feature/2026-08-15-top-bar-chrome-tooltips-and-sidebar-toggle-glyphs.md)）。
- dock 挂在 AppFrame 的 `shell.dock` 行（center+details 下方），侧栏保持全高。
- 空 dock 打开时调用 `terminal.open`（Host `user-shell` 后端；默认 shell 为 `$SHELL`，macOS 上为 `/bin/zsh`）。
- 键盘输入走 `terminal.write`（权限等价于 `submit: false` 的 `terminal_send`）。
- 几何更新在 FitAddon／ResizeObserver 测量后走 `terminal.resize`。
- Tab 关闭走 `terminal.close`。隐藏 dock（chrome 切换或 dock ×）保留 tabs、每 tab 的 xterm 缓冲与当前选中 tab 的 attach 流；作者 CSS 强制 `[hidden]`／`data-open=false` 为 `display: none`，面板才会真正收起。仅移除最后一个 tab（或卸载）才销毁视口并 detach。
- 每个 dock tab 自有 xterm 宿主（非活动宿主保持挂载但隐藏），切换 tab 无需回车即可恢复该 tab 屏幕；Host `terminal.attach` 不回放 scrollback。
- 模型 `terminal_*` 工具仍是 agent 拥有 PTY 的可审计路径；dock 不替换它们。

## Model Experience

### Indirect consumer

#### What the model sees

无直接可见内容。用户 shell 字节不进入模型请求或 session 日志。模型拥有的 PTY 仍通过六工具 `terminal_*` 可重建。

#### Token effect

无。原始流不进入模型请求或 session 日志。

#### KV Cache effect

无直接失效。

## Known Limitations and Deferred Work

- Windows ConPTY 交互路径随底层 PTY 后端一并推迟。
- Dock 多 tab 一次显示一个窗格，且每 tab 保留各自的 xterm 缓冲；分屏超出范围。
- 尚未从 `terminal_open` 工具卡片深链打开本面板。
