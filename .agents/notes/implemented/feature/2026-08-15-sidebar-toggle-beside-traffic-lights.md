# Agent Note: Sidebar toggle pinned beside macOS traffic lights

Status: implemented

English | [中文](2026-08-15-sidebar-toggle-beside-traffic-lights.zh.md)

## Problem

After the brand lock moved top-right ([brand lock](./2026-08-15-brand-lock-top-right-chrome.md)), the sidebar expand/collapse control still lived in the `logoRow` flex flow. Expanding or collapsing the column moved that affordance with the rail width, so it was not a stable peer of the native traffic lights the way peer desktop agents (for example ZCode) keep the panel toggle fixed immediately right of the green light.

## Decision

Keep ownership in `dsh-client-ui-sidebar`. Under `html[data-dsh-desktop='macos']:not([data-dsh-fullscreen])`, CSS pins `.toggle` with `position: fixed; left: 80px; top: 12px; z-index: 30` (28×28 control centered on the shared mid-line 26 with `TRAFFIC_LIGHT_X=16` / `TRAFFIC_LIGHT_Y=28`). The button stays a real `<button>` inside `logoRow` so Tauri deep-drag chrome excludes it; expanded `logoRow` remains the deep-drag spacer under the lights and stays at `opacity: 1` during the wide fade so the pinned control does not vanish. Desktop overlay always shows the directional panel glyph at 16px (`IconPanelLeftCollapseOutline16` while open, `IconPanelLeftExpandOutline16` while collapsed; [chrome tooltips](./2026-08-15-top-bar-chrome-tooltips-and-sidebar-toggle-glyphs.md)). Collapsed column width is zero with no control rail; New Session pins at `left: 116px` beside the toggle ([full hide](./2026-08-15-collapsed-sidebar-hides-column.md)). Browser expanded keeps the in-flow logoRow toggle; browser collapsed pins toggle + New Session top-left. Fullscreen clears the macOS pin with the existing `:not([data-dsh-fullscreen])` guard.

## Alternatives considered

**AppFrame / `shell.overlay` owns a second toggle.** Rejected: `toggleSidebar` and sidebar copy already inject into `SidebarRoot`; duplicating the control across packages splits the affordance and the fold animation story.

**Always `position: fixed` in every channel while expanded.** Rejected: `dsh web` and `--browser-launcher` have no traffic lights; the in-flow logoRow toggle is the correct expanded browser layout. Collapsed pinning on every channel is owned by the [full-hide note](./2026-08-15-collapsed-sidebar-hides-column.md).

**New `shell.titlebar` slot.** Rejected for this change: overlay pin on the existing sidebar control is enough; a unified command bar remains deferred ([immersive title bar](./2026-08-15-macos-immersive-title-bar.md)).

## Consequences

- Expand and collapse both expose a clickable panel toggle on the traffic-light mid-line, independent of sidebar track width.
- Empty expanded logoRow padding beside the lights remains draggable; only the button eats clicks. Collapsed drag under the lights comes from conversation chrome.
- Moving `TRAFFIC_LIGHT_X` / light cluster width requires retuning `left: 80px` (and collapsed New Session `116px`) with the same mid-line discipline as Terminal `chromeCluster` and session-header padding ([immersive title bar](./2026-08-15-macos-immersive-title-bar.md)).

## Testing

- Sidebar style specs pin the fixed geometry, desktop New Session `left: 116px`, `animation: none` on the desktop chrome-in toggle, and `opacity: 1` on `.fading > .logoRow`.
- Sidebar component specs keep browser drag-chrome assertions and click the toggle while `data-dsh-desktop=macos` is set.
- Shell snapshots stay on the browser channel (in-flow expanded toggle; collapsed top-bar chrome).
