# @deepseek-ai/dsh-client-ui-sidebar

English | [中文](README.zh.md)

Sidebar shell plugin: the New Session action, layout-owned collapse control, scroll-aware region seat, and bottom-pinned Settings seat. The brand wordmark lives in Terminal chrome ([ui-terminal](../ui-terminal/README.md)), not this column. [ui-workspace](../ui-workspace/README.md) owns the Workspace and Session browser rendered into `sidebar.workspaces`; this package neither derives its rows nor owns its view preferences. Collapse hides the column at zero width and pins the panel toggle plus New Session as top-bar chrome ([full hide](../../../.agents/notes/implemented/feature/2026-08-15-collapsed-sidebar-hides-column.md)). The macOS desktop shell pins those controls beside the native traffic lights and keeps expanded `logoRow` as deep-drag chrome ([toggle beside lights](../../../.agents/notes/implemented/feature/2026-08-15-sidebar-toggle-beside-traffic-lights.md)); `dsh web` and `--browser-launcher` keep the in-flow expanded logoRow toggle and pin the same pair top-left when collapsed. The toggle swaps directional panel glyphs (collapse vs expand chevron) and top-bar icon labels use bottom `Tooltip`s ([chrome tooltips](../../../.agents/notes/implemented/feature/2026-08-15-top-bar-chrome-tooltips-and-sidebar-toggle-glyphs.md)). Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

New Session starts the runtime's page-local frontend Session Intent. The runtime targets the explicit Workspace used by a scoped action, otherwise the current Session's Workspace, otherwise the most recently active Workspace; when none exists it clears into the blank New Session page. Workspace-specific controls and the shared picker belong to ui-workspace.

`SidebarRootComponentProps` composes the layout owner share, the global `useSessions` and `useWorkspaces` hooks, the declared `sidebar.workspaces` and `sidebar.settings` child slots, and injected `startSession` plus sidebar-toggle callbacks. There is no plugin store.

During a live collapse, the shell holds the expanded content at its current width while it fades out for 150ms, then the layout's column track slides to zero. Settled collapse shows only the fixed panel toggle and New Session icon; workspace and settings seats stay mounted but unpainted until expand. A page that starts collapsed renders that chrome statically, and reduced-motion mode disables both transitions.

Scrollbars in the column are a pointer affordance: the shell rebinds ui-theme's [scrollbar indirection](../ui-theme/README.md) to `transparent` whenever the pointer is outside it, and keeps the thumb drawn for 2s after the pointer leaves, so a list nobody is pointing at carries no bar. The reservation that keeps rows from moving belongs to the scrolling region ([ui-workspace](../ui-workspace/README.md)), so revealing a thumb never reflows.

The foot is the `sidebar.settings` seat: the sidebar renders only the bottom-pinned layout slot and shares its column state (`wide`); ui-settings registers the trigger row and settings panel there.

The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; SidebarRoot, the row components, and the tree derivation remain package-internal behind the slot registration.

## Model Experience

None, as the sidebar renders the browser session list; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Session state-dot rendering is owned by [ui-workspace](../ui-workspace/README.md)** — no done/error notification sources are available.
- **Workspace browser behavior is composition-owned** — grouping, ordering, search, and row state belong to [ui-workspace](../ui-workspace/README.md), not this shell.
- **"New task completed" unread marking is local viewing state** — completion-time > last-seen never reaches the host.
