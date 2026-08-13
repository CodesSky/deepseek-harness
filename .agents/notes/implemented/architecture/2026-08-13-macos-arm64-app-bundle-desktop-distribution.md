# Agent Note: macOS arm64 App Bundle desktop distribution

Status: implemented

English | [中文](2026-08-13-macos-arm64-app-bundle-desktop-distribution.zh.md)

## Problem

Desktop users need a macOS arm64 install that:

1. Does not require a system Node (double-click / Finder install).
2. Ships the web GUI as the primary surface.
3. Still supports `dsh plugin add` (pnpm) after install for out-of-tree profile bundles.
4. Does not depend on Developer ID signing or notarization for the chosen distribution channel.

The repository already has two related but different answers: the [single-file SEA/JSON-RPC runtime](../../implemented/architecture/2026-07-10-single-file-executable-sdk-runtime-distribution.md) for the Python SDK, and [source run without a managed installer](../../implemented/simplification/2026-08-10-source-run-without-managed-installer.md) for developers. Neither is a Finder-installable GUI product that keeps [profile plugin bundles](../../implemented/architecture/2026-08-05-profile-plugin-bundles.md) and `INSTALL_ANCHOR`-based resolution.

## Decision

Ship the GUI on a **disk install closure** wrapped as an ad-hoc-signed App Bundle (optional DMG):

- **Official Node** embedded beside the install (not a system Node, not pkg's patched runtime). The builder drops `include/`, bundled npm/corepack, and man pages by default (`--keep-node-headers` restores headers for post-install `node-gyp`).
- **Embedded pnpm** under `pnpm/` — the npm `pnpm` package matching root `packageManager`, plus a shim that runs it with the sibling Node so `spawnSync('pnpm')` needs no system pnpm. The `@pnpm/macos-arm64` Mach-O stays rejected on size.
- **PATH wrapper** `bin/dsh` (also copied into the `.app` Resources) prepends embedded `pnpm/bin` and `node/bin`.
- **Symlink-free `pnpm deploy --prod`** of a pure dependency manifest whose closure is the web+CLI production graph, with `apps/cli`'s built `lib/bin.js` as the entry and `@deepseek-ai/dsh-web-frontend/dist` resolved through ordinary package exports. Post-deploy prune removes foreign native prebuilds, `*.map`, `*.d.ts`, `@types/*`, test trees, and package READMEs — not product packages and not runtime `doc/` trees (for example `yaml`).
- **Native shell** is the Tauri/WKWebView binary from [`packaging/macos/shell/`](../../../../packaging/macos/shell/) (see [Tauri shell note](2026-08-13-macos-arm64-tauri-desktop-shell.md)). The zsh default-browser opener remains as [`launcher-browser/`](../../../../packaging/macos/launcher-browser/) (`--browser-launcher`).
- **Publish artifacts** are an ad-hoc-signed `.app`, a **ULMO** (lzma) DMG, and a `.app.tar.xz` (often the smallest download). CI uploads the compressed pair, not the raw `.app` tree.
- **User data** remains under `~/.dsh` / `$DSH_HOME`; nothing session-durable is stored inside the `.app`.
- **Ad-hoc `codesign --sign -` only**; Gatekeeper first-launch uses Finder right-click Open. Documented in [`packaging/macos/README.md`](../../../../packaging/macos/README.md).

Builders: [`scripts/build-macos-desktop-closure.ts`](../../../../scripts/build-macos-desktop-closure.ts) and [`scripts/package-macos-desktop.ts`](../../../../scripts/package-macos-desktop.ts). Root scripts: `build:macos-desktop-closure`, `build:macos-desktop-shell`, `package:macos-desktop`. CI: [`.github/workflows/macos-desktop.yml`](../../../../.github/workflows/macos-desktop.yml) (`workflow_dispatch` or PR label `macos-desktop`).

### Track split (hard)

| Track | Carrier | Entry | Plugin set |
|---|---|---|---|
| **Desktop GUI (this note)** | Official Node + deploy tree + App Bundle | `@deepseek-ai/dsh` / `dsh web` | Open after install via `dsh plugin` → embedded pnpm |
| **Python JSON-RPC SDK** | `@yao-pkg/pkg --sea` single-file exe | `dsh-sdk-jsonrpc-demo` packaged bin | Closed VFS set from `dsh-jsonrpc-agent-pkg` |

Do **not** use `@yao-pkg/pkg --sea` for the GUI product: SEA's closed VFS fights post-install `dsh plugin add`, and the SEA note already owns that route for the SDK. Do **not** revive a source-checkout installer or make Homebrew the primary GUI path.

## Alternatives considered

**Reuse `@yao-pkg/pkg --sea` for the GUI.** Loses a real on-disk `node_modules` for post-install plugin adds; conflates the closed SDK runtime with an open desktop install. Rejected; SEA stays on the Python track.

**Electron shell.** Adds a Chromium runtime (~100+ MB) on top of the Node closure. Rejected for size. A thin **Tauri / WKWebView** shell was later adopted for the native window — see [Tauri shell note](2026-08-13-macos-arm64-tauri-desktop-shell.md); that note owns shell size policy and lifecycle.

**Source-tree / managed-installer distribution.** Conflicts with the decision to run from source only via root `pnpm` scripts and not own installer lifecycle state. Rejected as the GUI primary path.

**Homebrew as the primary GUI install.** Fine as an optional later channel; it does not satisfy double-click users without Homebrew.

**Put the deploy manifest under `packages/examples/`.** Examples are runnable demo bundles; a packaging-only deploy root belongs next to other distribution roots (`python/sdk-runtime`), hence `packaging/macos/closure-manifest/`.

**Ship the 136 MB `@pnpm/macos-arm64` Mach-O.** Works, but the npm `pnpm` package plus a Node-bound shim is enough for `spawnSync('pnpm')` and keeps the closure smaller (~20 MB vs ~140 MB unpacked).

**Leave foreign prebuilds / `.map` / `.d.ts` / Node `include/` in the install.** Measured as the dominant easy wins on the desktop tree; pruning them does not change the web+plugin product surface. `--skip-prune` and `--keep-node-headers` remain for diagnosis and native rebuilds.

**Upload the raw `.app` as the CI artifact.** GitHub stores an uncompressed tree; DMG (ULMO) + `.app.tar.xz` are the publish pair.

## Consequences

- Double-click users get a DMG → `.app` path without installing Node or pnpm; Gatekeeper friction is accepted for the unsigned channel.
- `dsh plugin` works from the PATH wrapper without a system pnpm; profile state stays in `~/.dsh`.
- Manifest drift vs `apps/cli` still fails loud via `verify-runtime-closure` until the desktop peer list gains a line.
- CI builds and uploads the DMG / `.app.tar.xz` on demand; it is not part of the default PR suite.
- Full interactive web boot (credential + free port + browser) remains a local/manual check; automated smoke covers `web --help`, frontend resolve, embedded `which pnpm`, and ad-hoc codesign verify.
- Measured on darwin-arm64 after prune + ULMO + tar.xz (approximate): `.app` ~608 MB → ~309 MB; DMG ~253 MB (UDZO) → ~103 MB (ULMO); `.app.tar.xz` ~47 MB.
