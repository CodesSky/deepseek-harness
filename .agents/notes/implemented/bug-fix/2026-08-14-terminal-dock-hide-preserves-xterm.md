# Agent Note: Terminal dock hide preserves xterm buffer

Status: implemented

English | [中文](2026-08-14-terminal-dock-hide-preserves-xterm.zh.md)

## Problem

Closing the independent user-shell dock ([independent user-shell dock](../feature/2026-08-14-independent-user-terminal-dock.md)) unmounted the React tree when `open` became false. That disposed the xterm instance and detached the Host `terminal.attach` stream while the PTY tab list remained. Reopening created an empty viewport and reattached without scrollback replay (`terminal.attach` delivers only subsequent chunks; the Web API has no scrollback read). The shell stayed alive, so Enter produced a new prompt; until then the dock looked blank.

## Decision

As long as any dock tab remains, keep the dock mounted and only set the HTML `hidden` attribute (and `data-open=false`) when closed. Author `.dock { display: flex }` would otherwise override the UA `[hidden]` rule and leave the pane painted and clickable, so the module CSS forces `.dock[hidden], .dock[data-open='false'] { display: none !important }`. xterm, FitAddon, and the selected tab's attach subscription stay alive so the retained screen buffer and live output continue. Reopening clears `hidden`, runs FitAddon.fit, refreshes the viewport rows, focuses the terminal, and pushes `terminal.resize` so geometry matches the visible host without requiring a keystroke. ResizeObserver skips fit while the dock is hidden or the tab is inactive so a 0×0 host cannot poison PTY cols/rows. Removing the last tab (or full unmount) still disposes the viewport and detaches; tab close still calls `terminal.close` and kills that shell. Per-tab xterm hosts (see [dock close and tab switch](./2026-08-15-terminal-dock-close-and-tab-switch.md)) extend the same keep-mounted rule across tab switches.

## Alternatives considered

**Replay Host scrollback on every re-attach.** Rejected for this defect: `terminal.*` has no UI scrollback read, and destroying the viewport on every hide is unnecessary when tabs already imply a live session.

**Send a redraw or Enter on reopen.** Rejected: it mutates the PTY and does not restore prior scrollback the user already saw.

**CSS `display:none` without keeping attach.** Rejected: a disposed or detached viewport still loses the screen the user expects when reopening the same tab.

## Verification

- `packages/client/ui-terminal/tests/dock.client.spec.tsx` asserts hide leaves attach/dispose untouched and reopen calls fit, refresh, and resize; dock × sets `hidden` with author CSS collapsing layout.
- Manual or Playwright: open dock → see prompt → toggle closed (height 0) → toggle open → prompt or prior content visible without Enter.

## Consequences

Hide is no longer equivalent to viewport teardown. Operators who expected detach-on-hide to drop the mux subscription while tabs remain will instead keep one attach listener for the selected tab until the last tab closes.
