# macOS arm64 桌面打包

[English](README.md) | 中文

交付可在 Finder 安装的**磁盘安装闭包**，并包装为 ad-hoc 签名的 `.app`（可选 DMG）：官方 Node + 对 web+CLI 生产依赖图做去符号链接的 `pnpm deploy --prod` + 供 `dsh plugin` 使用的内嵌 pnpm，外加负责原生窗口的 **Tauri 2 / 系统 WKWebView** 壳。用户数据仍在 `~/.dsh` / `$DSH_HOME`。不要求 Developer ID 或 notarization——首次启动时 Gatekeeper 可能需要「右键 → 打开」。

## 体积预算

| 层级 | 目标 | 说明 |
|---|---|---|
| **壳**（`Contents/MacOS/DeepSeekHarness`，Tauri/Rust arm64 release，strip/LTO） | ≤ **15–20 MB**（理想更小） | 仅用系统 WebKit——**不要**附带 Electron/Chromium |
| **相对浏览器启动器的壳增量** | 尽量 **&lt; 25 MB** | 对比 zsh `open` 兜底方案 |
| **运行时闭包**（`Resources/{node,dsh,pnpm}`） | 主导 DMG / `.app` | 官方 Node 去掉 `include/`+npm；`pnpm deploy --prod` 再裁掉异平台 prebuild、`.map`、`.d.ts`、test 目录、包内 README（保留包内 `doc/`，例如 `yaml`） |
| **发布产物** | 优先 **DMG（ULMO）+ `.app.tar.xz`** | ULMO（lzma）优于 UDZO（zlib）；CI 上传压缩产物，不上传原始 `.app` 树 |
| **内嵌 pnpm** | npm `pnpm` 包（约 20 MB） | 不采用 `@pnpm/macos-arm64` Mach-O（解压约 140 MB） |

Release Cargo profile：`lto`、`strip`、`opt-level = "z"`、`panic = "abort"`。macOS 使用系统 WKWebView（不捆绑 WebView2）。闭包裁剪细节见 [Agent Note](../../.agents/notes/implemented/architecture/2026-08-13-macos-arm64-app-bundle-desktop-distribution.md)。

## 布局

| 路径 | 作用 |
|---|---|
| [`closure-manifest/`](closure-manifest/package.json) | 纯依赖 deploy 根（`dsh-macos-desktop-pkg`），对标 SEA/JSON-RPC 载体的 [`python/sdk-runtime`](../../python/sdk-runtime/package.json) |
| [`Info.plist`](Info.plist) | App Bundle 元数据（`ai.deepseek.dsh.desktop`）；`CFBundleIconFile` = `AppIcon` |
| [`icon/`](icon/) | App 图标源：`icon-1024.png`、`AppIcon.iconset/`、已提交的 `AppIcon.icns`（装入 `Contents/Resources/AppIcon.icns`）；并镜像到 `shell/src-tauri/icons/` 供 Tauri。替换时改 1024 主图，运行 [`icon/rebuild.sh`](icon/rebuild.sh)（RGBA + [`pack_icns.py`](icon/pack_icns.py)；不要单独用 `iconutil -c icns`，它会丢掉 1024/@2x），再跑 `package:macos-desktop` |
| [`shell/`](shell/) | Tauri 2 工程；release 二进制成为 `Contents/MacOS/DeepSeekHarness` |
| [`launcher-browser/DeepSeekHarness`](launcher-browser/DeepSeekHarness) | 可选 zsh 兜底：在默认浏览器中 `open` `printUrl` 行（`--browser-launcher`） |
| [`bin/dsh`](bin/dsh) | PATH wrapper：优先内嵌 Node + pnpm，使 `dsh plugin` → `spawnSync('pnpm')` 命中树内 shim |
| [`bin/pnpm-shim.sh`](bin/pnpm-shim.sh) | 安装为 `<closure>/pnpm/bin/pnpm`；用并列 Node 运行 npm `pnpm` 包 |
| [`../../scripts/build-macos-desktop-closure.ts`](../../scripts/build-macos-desktop-closure.ts) | `build` → 校验 → deploy → 裁剪 → 内嵌 Node + pnpm → 安装 wrapper → 冒烟 |
| [`../../scripts/package-macos-desktop.ts`](../../scripts/package-macos-desktop.ts) | 构建 Tauri 壳 → 组装 `.app` → ad-hoc `codesign` → ULMO DMG + `.app.tar.xz` |
| `dist-macos-desktop/`（已 gitignore） | 闭包 + `DeepSeek Harness.app` + DMG + `.app.tar.xz` |

GUI 主路径**不是** `@yao-pkg/pkg --sea`；SEA 仍留给 Python JSON-RPC SDK。壳的理由见 [Agent Note](../../.agents/notes/implemented/architecture/2026-08-13-macos-arm64-tauri-desktop-shell.md)。闭包分轨见 [Agent Note](../../.agents/notes/implemented/architecture/2026-08-13-macos-arm64-app-bundle-desktop-distribution.md)。

## 构建

需要 **darwin-arm64**、**Rust/`cargo`**，以及常规 Node/pnpm 工具链。若缺少 `cargo`：`brew install rust`（或 rustup）。若 crates.io 索引拉取卡住，使用 `shell/src-tauri/.cargo/config.toml` 中的 sparse 协议，或配置用户级 registry 镜像。

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

闭包常用参数：`--help`、`--skip-node`、`--skip-pnpm`、`--skip-prune`、`--keep-node-headers`、`--skip-smoke`、`--node-version=24.11.0`、`--node-dist-base=…`、`--npm-registry=…`、`--out-dir=dist-macos-desktop`、`--dry-run`。打包参数：`--skip-closure`、`--skip-shell`、`--browser-launcher`、`--skip-dmg`、`--skip-tar-xz`、`--dmg-format=ULMO|UDZO|ULFO|UDBZ`、`--skip-sign`、`--skip-smoke`、`--dry-run`。内嵌 Node 需要 darwin-arm64。tarball 缓存在 `.cache/nodejs/` 与 `.cache/pnpm-npm/`。Cargo `target/` 在 `shell/src-tauri/` 下已 gitignore。默认裁剪会去掉 Node `include/`（若安装后 `node-gyp` 重建必须不依赖系统 Node，传 `--keep-node-headers`）。

CI：[`.github/workflows/macos-desktop.yml`](../../.github/workflows/macos-desktop.yml)（`workflow_dispatch` 或 PR 标签 `macos-desktop`）；安装 Rust 工具链并缓存 `shell/src-tauri/target`。

## 安装与首次启动（Gatekeeper）

1. 打开 DMG，将 `DeepSeek Harness.app` 拖入「应用程序」（也可直接运行构建树中的 `.app`）。
2. 首次启动若被识别为未认证开发者拦截：在 **Finder 中右键应用 → 打开 → 打开**。本渠道有意使用 ad-hoc 签名，不做 Developer ID / notarization。
3. Tauri 壳启动 `dsh web --host 127.0.0.1 --port 0`（由操作系统分配空闲端口），等待 `dsh web: http://…` 就绪行后在应用窗口加载该 URL；退出应用或关闭主窗口时停止服务。
4. 启动失败（缺少 Resources、服务退出、超时）在窗口内提示。使用 `--port 0` 时 `EADDRINUSE` 很少见；若日志仍出现，窗口会展示该信息。

## 从安装树使用 CLI / 插件

```sh
# Prefer the PATH wrapper so embedded pnpm is visible to `dsh plugin`:
dist-macos-desktop/bin/dsh web --help
dist-macos-desktop/bin/dsh plugin --profile demo add <bundle-spec>

# Same wrapper inside the App Bundle:
"dist-macos-desktop/DeepSeek Harness.app/Contents/Resources/bin/dsh" plugin --profile demo add <bundle-spec>
```

在该 wrapper 下，`command -v pnpm` 解析为 `<install>/pnpm/bin/pnpm`（shim → npm `pnpm` 包 + 并列 Node）。因此 `apps/cli` 里的 `spawnSync('pnpm')` 不依赖系统 pnpm。Profile 数据仍在 `~/.dsh`。

## 冒烟

```sh
dist-macos-desktop/bin/dsh web --help
PATH="dist-macos-desktop/pnpm/bin:dist-macos-desktop/node/bin" command -v pnpm
codesign --verify --verbose "dist-macos-desktop/DeepSeek Harness.app"
file "dist-macos-desktop/DeepSeek Harness.app/Contents/MacOS/DeepSeekHarness"
file "dist-macos-desktop/DeepSeek Harness.app/Contents/Resources/AppIcon.icns"
python3 packaging/macos/icon/pack_icns.py verify "dist-macos-desktop/DeepSeek Harness.app/Contents/Resources/AppIcon.icns"
defaults read "dist-macos-desktop/DeepSeek Harness.app/Contents/Info" CFBundleIconFile
# Optional local UI smoke (needs free display; credential optional for page chrome):
open "dist-macos-desktop/DeepSeek Harness.app"
```

替换 `.app`（或重新签名）后，Finder/Launchpad 通常会立刻用上 `AppIcon.icns`；若 **Dock** 仍空白而应用程序里图标正常，先退出应用，再 `open -R "/Applications/DeepSeek Harness.app"`（或把新 app 拖到 Dock 一次），最后才用 `killall Dock` 清缓存。

闭包构建还会通过已部署的安装树解析 `@deepseek-ai/dsh-web-frontend/dist/index.html`。完整对话仍需要可用的模型凭证。
