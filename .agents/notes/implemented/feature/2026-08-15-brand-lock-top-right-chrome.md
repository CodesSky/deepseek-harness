# Agent Note: Brand lock beside top-right Terminal chrome

Status: implemented

English | [中文](2026-08-15-brand-lock-top-right-chrome.zh.md)

## Problem

The full brand lock (whale + deepseek letterforms + HARNESS badge) lived in the sidebar `logoRow` next to the panel toggle. Under the macOS overlay title bar ([immersive title bar](./2026-08-15-macos-immersive-title-bar.md)) that placed product branding beside the traffic lights, forcing a 78px left inset on the expanded logo row and crowding the immersive chrome the lights are meant to sit on.

## Decision

Move the brand lock into the Terminal chrome cluster owned by `dsh-client-ui-terminal`:

- Hero: `shell.overlay` `TerminalChrome` renders `[BrandWordmark][Terminal button]` fixed top-right.
- Live session: `conversation.session.header.utilities` `TerminalAction` renders the same order inline beside Session log.
- Sidebar `logoRow` keeps the panel toggle (browser: in-flow at the right edge; macOS overlay pins it beside the traffic lights — [toggle beside lights](./2026-08-15-sidebar-toggle-beside-traffic-lights.md)). Browser rail still swaps whale ↔ panel on hover; desktop overlay always shows the directional panel glyph ([chrome tooltips](./2026-08-15-top-bar-chrome-tooltips-and-sidebar-toggle-glyphs.md)). Expanded logo row drops the traffic-light left inset.

Brand art is decorative (`pointer-events: none`); only the Terminal control is clickable. Browser channels never set `data-dsh-desktop`, so they gain the brand+Terminal cluster without desktop traffic-light insets.

## Alternatives considered

**Always-visible brand on `shell.overlay` while Terminal stays in utilities on live sessions.** Rejected: the brand would no longer sit immediately left of the Terminal icon when the twin moves into the header.

**New `shell.titlebar` slot spanning all columns.** Rejected for this change: the existing overlay / utilities twin already places the Terminal control; brand rides that cluster ([immersive title bar](./2026-08-15-macos-immersive-title-bar.md) already deferred a unified command bar).

**Keep the wordmark as a New Session shortcut in the sidebar.** Rejected: the capsule remains the explicit New Session control; duplicating that gesture on the moved brand would crowd the Terminal cluster.

## Consequences

- Traffic-light overlay area beside the expanded sidebar toggle stays empty of branding; brand remains visible top-right with Terminal.
- Wordmark click no longer starts a session; only the New Session capsule does.
- Immersive title-bar CSS no longer pads expanded `logoRow` by 78px ([immersive title bar](./2026-08-15-macos-immersive-title-bar.md)).

## Testing

- Sidebar component and style specs assert a single New Session capsule and no expanded logo-row 78px inset.
- Terminal chrome specs assert brand precedes the Terminal button in both hero and utilities seats.
- Sidebar shell snapshots refresh without the wordmark button.
