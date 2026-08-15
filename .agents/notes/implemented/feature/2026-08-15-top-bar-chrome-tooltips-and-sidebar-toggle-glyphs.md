# Agent Note: Top-bar chrome tooltips below icons and directional sidebar glyphs

Status: implemented

English | [中文](2026-08-15-top-bar-chrome-tooltips-and-sidebar-toggle-glyphs.zh.md)

## Problem

Top-bar icon chrome mixed two label systems: sidebar toggle and New Session used `Tooltip` with the default `side="right"`, so the bubble sat beside the control (awkward next to traffic lights and other top-bar peers), while Terminal used the native `title` attribute. Expand and collapse also shared one `IconPanelLeftOutline16` glyph, so the affordance did not show whether the next click would hide or reveal the rail the way peer desktop agents (for example ZCode) do with a left-rail frame plus directional chevron.

## Decision

Use one presentation for top-bar icon labels and directional panel glyphs:

- Sidebar toggle, collapsed New Session, and Terminal chrome/utilities wrap their buttons in `Tooltip` with `side="bottom"` and `delayMs={500}` (same bubble as the rest of the client UI). The bubble portals to `document.body` so a flex header cannot treat it as an in-flow sibling. Drop native `title` on those Terminal buttons so only the shared bubble appears.
- `dsh-client-ui-primitives` adds `IconPanelLeftCollapseOutline16` (left rail + left chevron) and `IconPanelLeftExpandOutline16` (left rail + right chevron) on the shared panel-left frame path. While the sidebar is open the toggle shows collapse; while collapsed it shows expand. `aria-label` / tooltip copy stay `toggle.collapse` / `toggle.open` and match the glyph.
- Desktop fixed toggle and browser in-flow / collapsed top-left chrome share `SidebarRoot`, so both channels get the same glyphs and bottom tooltips ([toggle beside lights](./2026-08-15-sidebar-toggle-beside-traffic-lights.md)).

## Alternatives considered

**Keep `side="right"` for the sidebar toggle only.** Rejected: top-bar peers read as one row; a side bubble fights the traffic-light and Terminal clusters.

**Reuse one panel icon and flip it with CSS.** Rejected: a mirrored panel reverses the rail to the right; the design keeps the sidebar strip on the left and only flips the chevron.

**Native `title` for Terminal to avoid importing Tooltip.** Rejected: browsers style and time `title` differently from the product tooltip, breaking the unified top-bar label.

## Consequences

- Hover/focus labels for sidebar toggle, New Session (collapsed), and Terminal sit under the icon with the shared tooltip plate.
- Open vs collapsed sidebar is readable from the glyph alone; labels stay aligned with the action.
- Dock-internal tab new/close controls may still use `title`; only the top-bar Terminal entry moved onto `Tooltip`.

## Testing

- Icon set count includes the two panel-direction glyphs; sidebar shell specs assert distinct chevron path data for open vs collapsed.
- Sidebar shell snapshots refresh with the new glyph content hashes.
- Terminal chrome specs keep brand + icon seating; Tooltip wraps the Terminal button without changing the cluster layout; Tooltip specs assert the bubble is a `document.body` child.
