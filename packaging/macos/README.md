# macOS arm64 desktop packaging

English | [中文](README.zh.md)

Ships a Finder-installable **disk install closure** wrapped as an ad-hoc-signed `.app` (optional DMG): official Node + symlink-free `pnpm deploy --prod` of the web+CLI production graph + embedded pnpm for `dsh plugin`, plus a **Tauri 2 / system WKWebView** shell that owns the native window. User data stays under `~/.dsh` / `$DSH_HOME`. No Developer ID or notarization — Gatekeeper may require a right-click Open on first launch.

## Size budget

| Layer | Target | Notes |
|---|---|---|
| **Shell** (`Contents/MacOS/DeepSeekHarness`, Tauri/Rust arm64 release, strip/LTO) | ≤ **15–20 MB** (ideal much smaller) | System WebKit only — do **not** ship Electron/Chromium |
| **Shell delta vs browser-launcher** | Prefer **&lt; 25 MB** | Compared to the zsh `open` fallback |
| **Runtime closure** (`Resources/{node,dsh,pnpm}`) | Dominates DMG / `.app` | Official Node minus `include/`+npm; `pnpm deploy --prod` pruned of foreign prebuilds, `.map`, `.d.ts`, test dirs, package READMEs (keeps package `doc/` — e.g. `yaml`) |
| **Publish artifacts** | Prefer **DMG (ULMO) + `.app.tar.xz`** | ULMO (lzma) over UDZO (zlib); CI uploads compressed artifacts, not the raw `.app` tree |
| **Embedded pnpm** | npm `pnpm` package (~20 MB) | Keeps `@pnpm/macos-arm64` Mach-O (~140 MB unpacked) out of the closure |

Release Cargo profile: `lto`, `strip`, `opt-level = "z"`, `panic = "abort"`. macOS uses system WKWebView (no WebView2 bundle). Closure prune details: [Agent Note](../../.agents/notes/implemented/architecture/2026-08-13-macos-arm64-app-bundle-desktop-distribution.md).

## Layout

| Path | Role |
|---|---|
| [`closure-manifest/`](closure-manifest/package.json) | Pure dependency deploy root (`dsh-macos-desktop-pkg`), analogous to [`python/sdk-runtime`](../../python/sdk-runtime/package.json) for the SEA/JSON-RPC carrier |
| [`Info.plist`](Info.plist) | App Bundle metadata (`ai.deepseek.dsh.desktop`); `CFBundleIconFile` = `AppIcon` |
| [`icon/`](icon/) | App icon sources: `icon-1024.png`, `AppIcon.iconset/`, committed `AppIcon.icns` (copied to `Contents/Resources/AppIcon.icns`); mirrored into `shell/src-tauri/icons/` for Tauri. Replace the 1024 master, run [`icon/rebuild.sh`](icon/rebuild.sh), then re-run `package:macos-desktop` |
| [`shell/`](shell/) | Tauri 2 project; release binary becomes `Contents/MacOS/DeepSeekHarness` |
| [`launcher-browser/DeepSeekHarness`](launcher-browser/DeepSeekHarness) | Optional zsh fallback: `open` the `printUrl` line in the default browser (`--browser-launcher`) |
| [`bin/dsh`](bin/dsh) | PATH wrapper that prefers embedded Node + pnpm so `dsh plugin` → `spawnSync('pnpm')` hits the in-tree shim |
| [`bin/pnpm-shim.sh`](bin/pnpm-shim.sh) | Installed as `<closure>/pnpm/bin/pnpm`; runs the npm `pnpm` package with the sibling Node |
| [`../../scripts/build-macos-desktop-closure.ts`](../../scripts/build-macos-desktop-closure.ts) | `build` → verify → deploy → prune → embed Node + pnpm → install wrapper → smoke |
| [`../../scripts/package-macos-desktop.ts`](../../scripts/package-macos-desktop.ts) | Build Tauri shell → assemble `.app` → ad-hoc `codesign` → ULMO DMG + `.app.tar.xz` |
| `dist-macos-desktop/` (gitignored) | Closure + `DeepSeek Harness.app` + DMG + `.app.tar.xz` |

The GUI track is **not** `@yao-pkg/pkg --sea`; SEA remains the Python JSON-RPC SDK route. Shell rationale: [Agent Note](../../.agents/notes/implemented/architecture/2026-08-13-macos-arm64-tauri-desktop-shell.md). Closure track: [Agent Note](../../.agents/notes/implemented/architecture/2026-08-13-macos-arm64-app-bundle-desktop-distribution.md).

## Build

Requires **darwin-arm64**, **Rust/`cargo`**, and the usual Node/pnpm toolchain. If `cargo` is missing: `brew install rust` (or rustup). When crates.io index fetches hang, use sparse protocol (committed under `shell/src-tauri/.cargo/config.toml`) or a user-level registry mirror.

```sh
# Full monorepo build + closure (Node + pnpm + wrapper):
pnpm run build:macos-desktop-closure
# or, when lib/ and apps/web/dist already exist:
pnpm exec tsx scripts/build-macos-desktop-closure.ts --skip-build

# Assemble .app + Tauri shell + ad-hoc sign + DMG (reuses an existing closure with --skip-closure):
pnpm run package:macos-desktop -- --skip-closure

# Shell only (then package with --skip-shell):
pnpm run build:macos-desktop-shell
```

Useful closure flags: `--help`, `--skip-node`, `--skip-pnpm`, `--skip-prune`, `--keep-node-headers`, `--skip-smoke`, `--node-version=24.11.0`, `--node-dist-base=…`, `--npm-registry=…`, `--out-dir=dist-macos-desktop`, `--dry-run`. Packaging flags: `--skip-closure`, `--skip-shell`, `--browser-launcher`, `--skip-dmg`, `--skip-tar-xz`, `--dmg-format=ULMO|UDZO|ULFO|UDBZ`, `--skip-sign`, `--skip-smoke`, `--dry-run`. Embedding Node requires darwin-arm64. Tarballs cache under `.cache/nodejs/` and `.cache/pnpm-npm/`. Cargo `target/` is gitignored under `shell/src-tauri/`. Default prune drops Node `include/` (pass `--keep-node-headers` if post-install `node-gyp` rebuilds must work without a system Node).

CI: [`.github/workflows/macos-desktop.yml`](../../.github/workflows/macos-desktop.yml) (`workflow_dispatch` or PR label `macos-desktop`); installs a Rust toolchain and caches `shell/src-tauri/target`.

## Install and first launch (Gatekeeper)

1. Open the DMG and drag `DeepSeek Harness.app` into Applications (or run the `.app` from the build tree).
2. On first launch, if macOS blocks an unidentified developer: **Finder → right-click the app → Open → Open**. Ad-hoc signing is intentional for this channel; there is no Developer ID / notarization.
3. The Tauri shell starts `dsh web --host 127.0.0.1 --port 0` (OS-assigned free port), waits for the `dsh web: http://…` readiness line, loads that URL in the app window, and stops the server when the app exits or the main window closes.
4. Startup failures (missing Resources, server exit, timeout) show inside the window. `EADDRINUSE` is unlikely with `--port 0`; if it still appears in logs, the window surfaces the message.

## CLI / plugins from the install

```sh
# Prefer the PATH wrapper so embedded pnpm is visible to `dsh plugin`:
dist-macos-desktop/bin/dsh web --help
dist-macos-desktop/bin/dsh plugin --profile demo add <bundle-spec>

# Same wrapper inside the App Bundle:
"dist-macos-desktop/DeepSeek Harness.app/Contents/Resources/bin/dsh" plugin --profile demo add <bundle-spec>
```

Under that wrapper, `command -v pnpm` resolves to `<install>/pnpm/bin/pnpm` (shim → npm `pnpm` package + sibling Node). Direct `spawnSync('pnpm')` from `apps/cli` therefore does not need a system pnpm. Profile data still lives under `~/.dsh`.

## Smoke

```sh
dist-macos-desktop/bin/dsh web --help
PATH="dist-macos-desktop/pnpm/bin:dist-macos-desktop/node/bin" command -v pnpm
codesign --verify --verbose "dist-macos-desktop/DeepSeek Harness.app"
file "dist-macos-desktop/DeepSeek Harness.app/Contents/MacOS/DeepSeekHarness"
file "dist-macos-desktop/DeepSeek Harness.app/Contents/Resources/AppIcon.icns"
defaults read "dist-macos-desktop/DeepSeek Harness.app/Contents/Info" CFBundleIconFile
# Optional local UI smoke (needs free display; credential optional for page chrome):
open "dist-macos-desktop/DeepSeek Harness.app"
```

The closure build also resolves `@deepseek-ai/dsh-web-frontend/dist/index.html` through the deployed install. Full chat still needs a reachable model credential.
