# Agent Note: Collapsed sidebar hides the column (ZCode-style)

Status: implemented

English | [中文](2026-08-15-collapsed-sidebar-hides-column.zh.md)

## Problem

Collapsed sidebar still reserved a 56px bordered control rail (toggle, New Session, workspace add/search, settings). On the macOS overlay shell that rail and its right-edge border sat beside the traffic lights and visually split the title-bar region from the conversation fill. Peer desktop agents (for example ZCode) fully hide the sidebar when collapsed and keep only a panel toggle plus New Session on the top chrome.

## Decision

Closed sidebar width is `SIDEBAR_COLLAPSED = 0` in the AppFrame concession solver. `data-sidebar-collapsed` clears the sidebar column's right border and fill so no vertical seam remains. Expanded layout is unchanged.

`dsh-client-ui-sidebar` still owns chrome. After the existing 150ms wide-content fade, settled collapse paints no rail: `regionArea` and `footArea` are `display: none` (seats stay mounted for state). The panel toggle and a New Session icon escape as fixed top-bar controls in `logoRow` — browser at `left: 12px` / `48px`, macOS overlay at `left: 80px` / `116px` (toggle + 8px gap + 28px). Expanded New Session remains the in-column capsule only; collapsed never duplicates it. Mid-fade keeps `logoRow` (and thus the toggle) at `opacity: 1` on every channel so the sliding zero-width track does not clip the affordance. Search, workspace add, and settings stay expand-to-use; they are not promoted into the top bar.

Browser channels follow the same full hide and top-left chrome (no traffic-light inset). The former collapsed whale ↔ panel rail swap is removed.

AppFrame publishes `--dsh-collapsed-chrome-inset` on the frame so the live-session header can clear that chrome: `84px` on browser (toggle `12` + `28` + `8` + New Session `28` + `8`), `152px` on macOS overlay (New Session `116` + `28` + `8`; toggle `80` sits inside that span), and `0px` while expanded. The conversation header applies it as `padding-left` only under `[data-sidebar-collapsed]`; `dsh web` never receives the traffic-light `80px` inset.

## Alternatives considered

**Keep the 56px rail on browser only.** Rejected for this change: the product ask is sidebar hide; browser without a rail matches ZCode and avoids a second fold story. Workspace rail CSS may remain unused while `wide === false`.

**Promote every former rail icon into the title bar.** Rejected: only New Session sits beside the toggle; other actions require expand.

**Move collapsed chrome into AppFrame / `shell.overlay`.** Rejected: `toggleSidebar`, `startSession`, and sidebar copy already inject into `SidebarRoot` ([toggle beside lights](./2026-08-15-sidebar-toggle-beside-traffic-lights.md)).

## Consequences

- Collapsed main content extends to the window's left edge; traffic lights sit on continuous conversation fill. Title, actions, and utilities in the live-session header start after the pinned chrome rather than under the lights.
- Settings and workspace search are unreachable until the sidebar expands.
- Retuning traffic-light geometry still moves toggle `left: 80px`, New Session `left: 116px`, and overlay `--dsh-collapsed-chrome-inset: 152px` together ([immersive title bar](./2026-08-15-macos-immersive-title-bar.md)).

## Testing

- Layout column specs assert `SIDEBAR_COLLAPSED === 0` and closed tracks.
- AppFrame CSS clears the collapsed sidebar border and publishes `--dsh-collapsed-chrome-inset`; component specs keep collapsed owner props at width 0.
- Conversation style specs pin the header `padding-left` to that variable only under `[data-sidebar-collapsed]`.
- Sidebar style specs pin fixed chrome geometry (browser 12/48, macOS 80/116), hidden region/foot, and fade opacity.
- Sidebar component and snapshot specs assert a single New Session control after settle and on cold collapse.
