# Agent Note: Independent Host user-shell terminal dock

Status: implemented

English | [中文](2026-08-14-independent-user-terminal-dock.zh.md)

## Problem

The interactive Web terminal panel ([interactive Web terminal panel](./2026-08-14-interactive-web-terminal-panel.md)) only attached to PTYs owned by a live chat Agent after the model called `terminal_open`. Users who wanted a local zsh without starting a turn had no product entry: coding presets mount `ctx.terminals` inside an isolate realm, so the Host composition often had no user-facing spawn path.

## Decision

Ship a Host-owned user-shell path beside the existing model-owned PTY tools.

### Host seam

| Piece | Role |
|---|---|
| Web-app `user-terminal` group | Mounts host `dsh-terminal` + `dsh-terminal-bash` with `backendType: user-shell`, `profile: user`, shell `$SHELL` or `/bin/zsh` on Darwin; disabled on Windows with the rest of the PTY stack |
| `dsh-terminal-bash` `profile` | `controlled` keeps model readiness (dumb TERM, owned PS1); `user` uses `xterm-256color` and the interactive profile |
| ApiProxy `terminal.open` / `close` | Spawn and kill Host user shells; list/attach/write/resize accept `USER_SHELL_SESSION_ID` |
| Detached owner Agent | Registered under `USER_SHELL_SESSION_ID` without SessionStore entry so it never appears in `session.list` |

Model tools keep isolate-realm `terminals`. Host `ctx.get('terminals')` serves only the user-shell owner. Owner fencing, sandbox policy resolution, and the raw-byte durability invariant from the panel note stay in force.

### UI

`dsh-client-ui-terminal` registers a top-right brand+Terminal chrome cluster on `shell.overlay` (hero) and a bottom dock on `shell.dock` (AppFrame row under center+details, so the sidebar stays full-height), plus the same cluster in `conversation.session.header.utilities` beside Session log on live sessions so the controls share flex/gap instead of stacking. The brand wordmark sits left of the Terminal icon in both seats ([brand lock chrome](./2026-08-15-brand-lock-top-right-chrome.md)). Opening an empty dock calls `terminal.open` with the recent workspace path when known. Multi-tab `+` / tab close map to open / close. Each tab keeps its own xterm host (inactive hosts stay mounted but hidden). Hiding the dock keeps live tabs, per-tab buffers, and the selected attach stream; author CSS forces `[hidden]` to collapse layout. Reopen and tab select refit FitAddon, refresh, focus, and push `terminal.resize` so the retained screen is visible without a keystroke. The details-column panel remains for model-owned PTY attach and stays quiet while the dock owns the selected id.

## Alternatives considered

**Require a blank chat session before opening a shell.** Rejected: the product entry must work on the hero surface with no session.

**Spawn through the current agent isolate.** Rejected when no agent is live; also mixes human keyboard ownership with model tool ownership.

**Replace the six model tools with the UI shell.** Rejected: model-visible work must stay reconstructable from the session log ([persistent PTY sessions](./2026-07-16-persistent-pty-sessions.md)).

## Verification

- ApiProxy unit coverage for `terminal.open` / `close` under `USER_SHELL_SESSION_ID` without SessionStore pollution.
- Existing owner-fenced attach/write/resize and mux chunk tests remain for chat agents.
- `terminal-bash` config accepts `profile: user`.
- Client store coverage for dock tabs; browser plugin registers brand+Terminal chrome on `shell.overlay`, dock on `shell.dock`, and the same cluster on `conversation.session.header.utilities`.
- Dock hide/reopen keeps attach and xterm; reopen calls FitAddon.fit and `terminal.resize` without disposing the viewport.
- Web composition mounts the `user-terminal` group and depends on `dsh-terminal` / `dsh-terminal-bash`.

## Consequences

**Users can open an interactive shell from chrome without a model turn.** Default cwd follows the recent workspace when the client knows one; otherwise the Host default cwd.

**Human and model PTY ownership stay on separate service instances** (host vs isolate), so cross-attach remains impossible by construction.

**Windows remains deferred** with ConPTY; the group is disabled there so compositions do not claim a broken entry.
