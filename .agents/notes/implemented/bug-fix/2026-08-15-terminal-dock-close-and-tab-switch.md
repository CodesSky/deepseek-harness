# Agent Note: Terminal dock close and per-tab xterm buffers

Status: implemented

English | [中文](2026-08-15-terminal-dock-close-and-tab-switch.zh.md)

## Problem

Two defects remained after [hide preserves xterm](./2026-08-14-terminal-dock-hide-preserves-xterm.md):

1. Clicking the dock header × set `open=false` and the HTML `hidden` attribute, but author `.dock { display: flex }` overrode the UA `[hidden]` rule, so the pane stayed fully visible and interactive — the close control looked broken.
2. Multi-tab switching shared one xterm, called `reset()` on attach, and Host `terminal.attach` does not replay scrollback. Switching to another tab showed an empty cursor until focus + Enter reprinted a prompt.

## Decision

Force collapse in module CSS: `.dock[hidden], .dock[data-open='false'] { display: none !important }` (and the same for inactive `.dockTermHost[hidden]`). Keep the keep-mounted hide contract from the earlier note.

Give each dock tab its own xterm host that stays mounted while the tab exists. Inactive hosts use `hidden` without disposing the Terminal. On select or dock reopen, fit, refresh, focus, and `terminal.resize` for the active PTY. Never `reset()` an existing per-tab Terminal on re-attach.

## Alternatives considered

**Replay Host scrollback on every attach.** Rejected: the Web `terminal.*` API still has no UI scrollback read; per-tab client buffers already hold what the user saw.

**One shared xterm plus serialize/deserialize buffer on switch.** Rejected: more machinery than keeping one live Terminal per tab, with the same attach semantics.

**Rely on HTML `hidden` alone for dock close.** Rejected: author `display: flex` wins over the non-`!important` UA rule in Chromium/WebKit, so the pane never collapses.

## Verification

- `packages/client/ui-terminal/tests/dock.client.spec.tsx`: dock × sets `hidden` + `data-open=false`; tab switch mounts one host per tab, does not call `reset`, and calls fit/refresh/focus.
- Playwright against the running Host: close collapses layout height to 0; create two tabs, switch, see each tab's prompt without Enter; hide then reopen still shows content.

## Consequences

Close is layout-true, not only store-true. Operators who inspect `data-open` can trust it matches visibility. Background tabs do not receive mux chunks while detached; output produced while a tab is inactive is not shown until the shell reprints (same as any detach gap). Split panes remain out of scope.
