# @deepseek-ai/dsh-client-ui-terminal

English | [中文](README.zh.md)

Interactive Web PTY surface over the existing `ctx.terminals` seam. Registers a fixed top-right chrome control and a bottom dock that spawn Host-owned user shells via `terminal.open` (no chat session or model tool required), plus an optional details-column panel for attaching to model-owned PTYs. Raw PTY bytes stay process-local and are never written to the session event log.

## Contract

- Top-right chrome cluster shows the brand wordmark left of the Terminal icon and toggles the bottom dock (hero chrome overlay, or session-header utilities beside Session log). The Terminal button uses the shared bottom `Tooltip` (not native `title`) so its label matches other top-bar icon chrome ([chrome tooltips](../../../.agents/notes/implemented/feature/2026-08-15-top-bar-chrome-tooltips-and-sidebar-toggle-glyphs.md)).
- The dock mounts in AppFrame's `shell.dock` row under center+details so the sidebar stays full-height.
- Opening an empty dock calls `terminal.open` (Host `user-shell` backend; default shell is `$SHELL` or `/bin/zsh` on macOS).
- Keyboard input uses `terminal.write` (authority matches `terminal_send` with `submit: false`).
- Geometry updates use `terminal.resize` after FitAddon / ResizeObserver measurements.
- Tab close uses `terminal.close`. Hiding the dock (chrome toggle or dock ×) keeps tabs, per-tab xterm buffers, and the selected tab's attach stream; author CSS forces `[hidden]` / `data-open=false` to `display: none` so the pane actually collapses. Only removing the last tab (or unmount) disposes viewports and detaches.
- Each dock tab owns its own xterm host (inactive hosts stay mounted but hidden) so tab switches restore that tab's screen without Enter; Host `terminal.attach` does not replay scrollback.
- Model `terminal_*` tools remain the auditable path for agent-owned PTYs; the dock does not replace them.

## Model Experience

### Indirect consumer

#### What the model sees

Nothing directly. User-shell bytes never enter model requests or the session log. Model-owned PTYs remain reconstructable through the six `terminal_*` tools.

#### Token effect

None. Raw streams never enter model requests or the session log.

#### KV Cache effect

No direct invalidation.

## Known Limitations and Deferred Work

- Windows ConPTY interactive path remains deferred with the underlying PTY backend.
- Dock multi-tab shows one pane at a time with a retained xterm buffer per tab; split panes are out of scope.
- Deep-link from a `terminal_open` tool card into this panel is not wired yet.
