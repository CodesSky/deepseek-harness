# Agent Note: Stale web frontend seed drops plugin-only icons

Status: implemented

English | [中文](2026-08-15-stale-web-frontend-seed-drops-plugin-icons.zh.md)

## Problem

After sidebar chrome switched to `IconPanelLeftCollapseOutline16` / `IconPanelLeftExpandOutline16` ([chrome tooltips and glyphs](../feature/2026-08-15-top-bar-chrome-tooltips-and-sidebar-toggle-glyphs.md)), the live desktop UI showed a full-width empty sidebar column: no session list, no New Session capsule, no settings, and no traffic-light toggle. The console reported React error #130 and `slot entry crashed in 'sidebar'` — the element type was `undefined`. Brand lock and Terminal chrome (other slots) kept working, which made the empty column look like a CSS fold regression.

## Decision

`apps/web` Vite-builds the shell and seeds `@deepseek-ai/dsh-client-ui-primitives` into the client module static table (`packages/client/web/src/seed.ts` `import * as UiPrimitives`). Plugin bundles such as `ui-sidebar` `require()` that table at runtime; they do not ship their own copy of the glyphs. Adding icons to `ui-primitives` source and rebuilding only the plugin is not enough: the shell frontend dist must be rebuilt so the static seed exports the new names. After rebuild, also refresh the macOS desktop closure copy of `@deepseek-ai/dsh-web-frontend/dist` when smoke-testing with `DSH_DESKTOP_RESOURCES`.

Collapsed column CSS keeps fixed top-bar chrome unclipped: `AppFrame` sets `.frame[data-sidebar-collapsed] .sidebarCol { overflow: visible }`, and expanded `logoRow` uses `overflow: visible` so the macOS `position: fixed` toggle is not clipped by the row.

## Alternatives considered

**Inline the panel glyphs inside `ui-sidebar`'s client bundle.** Rejected: platform modules exist so every plugin shares one React icon instance table; duplicating SVGs fights that contract.

**Keep `IconPanelLeftOutline16` only.** Rejected: the product requires directional collapse/expand glyphs already shipped in ui-primitives.

## Verification

- `apps/web/tests/static-seed-panel-icons.spec.ts` asserts the built index chunk contains both glyph export names (catches a stale `apps/web/dist`).
- `packages/client/web/tests/seed-primitives.client.spec.ts` asserts `getStaticModules()` exposes the same functions as the primitives barrel.
- Sidebar root specs assert expanded seats (region/settings/capsule/toggle) and collapsed top-bar toggle visibility; layout/sidebar style specs pin collapsed `overflow: visible`.

## Consequences

Any new `ui-primitives` export consumed only from a plugin client bundle requires `pnpm --filter @deepseek-ai/dsh-web-frontend build` in the same change (and closure refresh for desktop smoke). Omitting that rebuild surfaces as an empty sidebar column with React #130, not a missing icon placeholder.
