# Agent Note: Interactive Web terminal panel over `ctx.terminals`

Status: implemented

English | [中文](2026-08-14-interactive-web-terminal-panel.zh.md)

## Problem

Coding presets expose the six model-facing persistent PTY tools ([persistent PTY sessions](./2026-07-16-persistent-pty-sessions.md)). The Web client already renders one-shot and PTY tool *results* as read-only terminal cards ([Web terminal card](./2026-07-28-web-terminal-card.md)). Without an interactive panel, workflows that need a human at the keyboard (password prompts, TUI fragments the model cannot drive, inspecting a stuck REPL) force the user into an external terminal that does not share the agent's sandbox, approval, or owner fence.

## Decision

Ship a product UI path that attaches to the existing `ctx.terminals` seam. Do not replace `dsh-terminal` / `dsh-terminal-bash` / `dsh-tool-terminal`. The model keeps the six tools; the browser adds an optional interactive viewport over the same owner-scoped sessions.

### Package topology

| Package | Role |
|---|---|
| `@deepseek-ai/dsh-terminal` | `attach` / `writeRaw` / `resize` on the backend session and service, owner-fenced like every other operation |
| `@deepseek-ai/dsh-subprocess` / `dsh-subprocess-local` | `SubprocessTerminalHandle.resize` over node-pty |
| `@deepseek-ai/dsh-host-apiproxy` | `terminal.list` / `attach` / `detach` / `write` / `resize` unary methods; `session/terminal-chunk` mux frames; never logs raw bytes into the session event log |
| `@deepseek-ai/dsh-client-ui-terminal` | xterm.js panel; top-right Terminal icon (chrome / header utilities); `terminal.panel` in the details column; keyboard → write; ResizeObserver → resize |

Raw PTY bytes remain process-local. That durability invariant from the PTY Agent Note stays unless a later design deliberately adds an opt-in transcript sink with its own retention and privacy contract.

### Placement

`ui-conversation` still declares `terminal.panel` as a child of the details column for model-owned PTY attach. The primary product entry is the independent Host user-shell dock ([independent user-shell dock](./2026-08-14-independent-user-terminal-dock.md)): top-right Terminal icon (hero chrome overlay or session-header utilities) plus a bottom dock on `shell.dock` under center+details, which calls `terminal.open` without a chat session.

### RPC and stream

Unary methods ride the legacy API Proxy (`terminal.*`). Chunk delivery reuses the mux WebSocket as `session/terminal-chunk` frames (base64 payload + optional `overrun`). Host drops chunks when a mux queue exceeds a buffered-frame cap and marks overrun once rather than buffering unbounded raw bytes.

### Security and approval alignment

- Every attach/write/resize/list call requires the exact live Agent that owns the PTY (same fence as `dsh-tool-terminal`).
- Spawn remains on the model tools / sandbox / approval path for agent-owned PTYs; Host `terminal.open` is the separate user-shell spawn path ([independent user-shell dock](./2026-08-14-independent-user-terminal-dock.md)).
- Writing to a PTY is equivalent in authority to `terminal_send` with `submit: false`.
- Raw streams are not persisted into `tool/call` / `tool/result` or new session events.
- Cross-agent attach is rejected.
- UI write is allowed during an active model send; the service keeps one model send reservation and documents interference.

## Alternatives considered

**Drive the panel only through `terminal_send` / `terminal_read`.** Rejected for interactive use: readiness waits and scrollback paging cannot carry keystroke latency or continuous redraw.

**Replace the six tools with a single UI-owned shell.** Rejected: model-visible work must stay reconstructable from the session log; the tools already provide that path.

**Log raw bytes into the session.** Rejected for v1: credential and volume risk; the PTY note already keeps raw bytes process-local.

**ACP terminal advertisement.** Out of scope; ACP remains automation-oriented and does not gain a parallel terminal protocol.

## Verification

- Terminal service unit coverage for owner-fenced `attach` / `writeRaw` / `resize` without taking `SEND_ACTIVE`.
- Subprocess-local resize coverage on the node-pty handle.
- Host mux schema and API Proxy routes for `terminal.*` and `session/terminal-chunk`.
- API Proxy resolves `terminals` through `agentPresets.serviceFor` (preset isolate realm) with host `ctx.get` fallback.
- Panel always mounts the xterm host while open so attach can bind before the first `terminal.list` result.
- Client store coverage for panel open/select; Web composition registers `@deepseek-ai/dsh-client-ui-terminal`.

## Consequences

**Interactive keyboard access stays inside the product fence.** Users can attach to owner-scoped PTYs without leaving the Web client.

**Raw byte volume stays off the durable log.** High-throughput attach uses mux backpressure with a visible overrun marker; privacy and retention stay process-local.

**Deep-link from `terminal_open` tool cards and Windows ConPTY interactive paths remain deferred.** macOS/Linux Web paths are the supported interactive surface.
