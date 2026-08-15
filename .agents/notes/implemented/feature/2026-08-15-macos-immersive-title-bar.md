# Agent Note: macOS immersive overlay title bar

Status: implemented

English | [中文](2026-08-15-macos-immersive-title-bar.zh.md)

## Problem

The Tauri 2 / WKWebView desktop shell ([shell note](../architecture/2026-08-13-macos-arm64-tauri-desktop-shell.md)) used the default macOS title bar: a separate strip, a window title, and a horizontal separator above the web UI. Product chrome (sidebar `logoRow`, session header, terminal overlay) sat below that strip, so the window did not match the hidden-title-bar / traffic-lights-on-app-fill look of peer desktop agents.

## Decision

Keep native decorations and the system traffic lights. The shell window uses `TitleBarStyle::Overlay`, `hidden_title(true)`, `decorations(true)`, `accept_first_mouse(true)`, and a fixed `traffic_light_position` of `{ x: 16, y: 28 }` — platform chrome constants tuned so painted lights share the mid-line of the 40px sidebar `logoRow` (plus 6px column pad → center 26), not Config tunables. `y: 28` is +8 above the naive 12px-light top-edge formula (`y: 20`) because macOS overlay draw sits higher than Tauri `LogicalPosition` top-edge math against CSS; move the lights down rather than lifting web chrome. Web chrome shares that mid-line: expanded `logoRow` is 40px tall, hero Terminal cluster uses `top: 10px` (32px button), and the live session header pads `10px` above its 32px title row.

An `initialization_script` (`packaging/macos/shell/ui/desktop-init.js`) runs on every top-level navigation, including `http://127.0.0.1` after `navigate()`. On the embedded web UI origin and Tauri asset protocols it sets `document.documentElement.dataset.dshDesktop = 'macos'`, queries `plugin:window|is_fullscreen`, and stamps `data-tauri-drag-region` onto `[data-dsh-drag-chrome]` markers (`deep` for chrome rows so empty padding drags while buttons stay clickable). Fullscreen sets `data-dsh-fullscreen` and removes those drag attributes; a resize handler in Rust re-evals the same flag. Capabilities grant `core:window:allow-start-dragging` and `core:window:allow-is-fullscreen` to `http://127.0.0.1:*` so IPC survives the origin change. WKWebView has no `-webkit-app-region`; Tauri's injected drag script owns the hit test.

Web CSS under `html[data-dsh-desktop='macos']:not([data-dsh-fullscreen])` pins the sidebar panel toggle fixed beside the traffic lights (`left: 80px`, `top: 12px`) so expand/collapse stays on the light mid-line; collapsed also pins New Session at `left: 116px` while the sidebar column width is zero ([toggle beside lights](./2026-08-15-sidebar-toggle-beside-traffic-lights.md), [full hide](./2026-08-15-collapsed-sidebar-hides-column.md)). Expanded `logoRow` remains a deep-drag spacer under the lights. The live-session header reads AppFrame's `--dsh-collapsed-chrome-inset` (`152px` on overlay collapse) so title and actions start after that chrome; expanded sidebar already covers the lights and the header keeps `20px`. The session header's 1px `::after` is transparent whenever the desktop dataset is present. Hero and settling phases paint a 52px conversation-column drag band; the live session header carries `data-dsh-drag-chrome="deep"`. `dsh web` and `--browser-launcher` never load the init script, so they keep the in-flow expanded logoRow toggle, zero traffic-light inset, and zero `data-tauri-drag-region`. `host.describe.canOpenPath` is not a desktop-shell signal.

## Alternatives considered

**Electron `titleBarStyle: 'hidden'` / Chromium `-webkit-app-region`.** Rejected: the shell size budget forbids a second Chromium runtime ([shell note](../architecture/2026-08-13-macos-arm64-tauri-desktop-shell.md)).

**`decorations(false)` and CSS traffic lights.** Rejected: loses native lights, fullscreen, and the system shadow; the overlay style already keeps those.

**`TitleBarStyle::Transparent` without Overlay.** Rejected: the title bar still occupies height; content does not draw under the lights.

**Detect the desktop shell via `host.describe.canOpenPath`.** Rejected: that flag is true for ordinary `dsh web` on a Mac with a desktop opener.

**A new `shell.titlebar` slot spanning the three columns.** Rejected for this change: overlay, inset, and drag already work on the existing chrome; a unified command bar is a separate product.

## Consequences

- Double-click users of the `.app` see traffic lights on the app fill with no native title-bar separator; browser and `--browser-launcher` layouts are unchanged.
- Traffic-light pixels are fixed platform constants; moving `logoRow` height, Terminal `chromeCluster` top, or session-header top padding requires retuning `TRAFFIC_LIGHT_Y` (and those CSS values) so the painted light mid-line stays on web center 26 — prefer adjusting Y over lifting web chrome.
- Remote IPC is limited to `http://127.0.0.1:*` and the two window commands; outbound link policy is unchanged ([HTTP(S) links note](../bug-fix/2026-08-14-macos-desktop-http-links-system-browser.md)).
- Windows / Linux frameless chrome remains out of scope: packaging is macOS-only.

## Testing

- Shell unit tests pin the init-script contract, capability remote URL, and fullscreen eval strings.
- `packaging/macos/shell/tests/desktop-init.spec.ts` runs the script in jsdom: 127.0.0.1 stamps drag regions, a public origin stays unmarked, fullscreen clears them.
- Sidebar, conversation, and terminal style specs pin the overlay selectors and the shared mid-line geometry (40px `logoRow` spacer, pinned toggle `top: 12px` / `left: 80px`, `chromeCluster` `top: 10px`, header `padding-top: 10px`); conversation style specs pin collapsed header `padding-left` to `--dsh-collapsed-chrome-inset`; component specs assert `data-dsh-drag-chrome` without a Tauri attribute in the browser channel.
