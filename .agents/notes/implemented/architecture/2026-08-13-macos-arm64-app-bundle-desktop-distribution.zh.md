# Agent Note: macOS arm64 App Bundle 桌面发行

Status: implemented

[English](2026-08-13-macos-arm64-app-bundle-desktop-distribution.md) | 中文

## 问题

桌面用户需要一种 macOS arm64 安装形态，满足：

1. 不依赖系统 Node（可双击 / 在 Finder 中安装）。
2. 以 web GUI 为主要使用面。
3. 安装后仍支持 `dsh plugin add`（pnpm），以便安装树外 profile 组合包。
4. 在选定的分发渠道上不依赖 Developer ID 签名或 notarization。

仓库里已有两条相关但不同的路径：面向 Python SDK 的[单文件 SEA/JSON-RPC 运行时](../../implemented/architecture/2026-07-10-single-file-executable-sdk-runtime-distribution.md)，以及面向开发者的[无托管安装器的源码运行](../../implemented/simplification/2026-08-10-source-run-without-managed-installer.md)。二者都不是可在 Finder 安装的 GUI 产品，也无法在保留 [profile 插件组合包](../../implemented/architecture/2026-08-05-profile-plugin-bundles.md) 与基于 `INSTALL_ANCHOR` 的解析的同时满足上述约束。

## 决策

GUI 走**磁盘安装闭包**，并包装为 ad-hoc 签名的 App Bundle（可选 DMG）：

- **官方 Node** 与安装树并列内嵌（不是系统 Node，也不是 pkg 的打过补丁的运行时）。构建器默认去掉 `include/`、自带的 npm/corepack 与 man 页（`--keep-node-headers` 可保留头文件，供安装后 `node-gyp` 使用）。
- **内嵌 pnpm** 在 `pnpm/`——与根 `packageManager` 对齐的 npm `pnpm` 包，外加用并列 Node 运行它的 shim，使 `spawnSync('pnpm')` 不需要系统 pnpm。继续否决 `@pnpm/macos-arm64` Mach-O（体积过大）。
- **PATH wrapper** `bin/dsh`（同时复制进 `.app` Resources）把内嵌 `pnpm/bin` 与 `node/bin` 放在 PATH 前面。
- 对纯依赖 manifest 做去符号链接的 **`pnpm deploy --prod`**，其闭包即 web+CLI 生产依赖图；入口为 `apps/cli` 构建出的 `lib/bin.js`，`@deepseek-ai/dsh-web-frontend/dist` 经普通 package exports 解析。deploy 后裁剪异平台 native prebuild、`*.map`、`*.d.ts`、`@types/*`、test 树与包内 README，不删除产品包，也不删除运行时 `doc/` 树（例如 `yaml`）。
- **原生壳**为 [`packaging/macos/shell/`](../../../../packaging/macos/shell/) 的 Tauri/WKWebView 二进制（见 [Tauri 壳笔记](2026-08-13-macos-arm64-tauri-desktop-shell.md)）。zsh 默认浏览器启动器保留在 [`launcher-browser/`](../../../../packaging/macos/launcher-browser/)（`--browser-launcher`）。
- **发布产物**为 ad-hoc 签名的 `.app`、**ULMO**（lzma）DMG，以及 `.app.tar.xz`（通常下载更小）。CI 上传压缩对，不上传原始 `.app` 树。
- **用户数据**仍在 `~/.dsh` / `$DSH_HOME`；任何会话持久化内容都不放进 `.app`。
- **仅 ad-hoc `codesign --sign -`**；Gatekeeper 首次启动用 Finder 右键打开。说明见 [`packaging/macos/README.md`](../../../../packaging/macos/README.md)。

构建器：[`scripts/build-macos-desktop-closure.ts`](../../../../scripts/build-macos-desktop-closure.ts) 与 [`scripts/package-macos-desktop.ts`](../../../../scripts/package-macos-desktop.ts)。根脚本：`build:macos-desktop-closure`、`build:macos-desktop-shell`、`package:macos-desktop`。CI：[`.github/workflows/macos-desktop.yml`](../../../../.github/workflows/macos-desktop.yml)（`workflow_dispatch` 或 PR 标签 `macos-desktop`）。

### 分轨（硬约束）

| 轨道 | 载体 | 入口 | 插件集合 |
|---|---|---|---|
| **桌面 GUI（本笔记）** | 官方 Node + deploy 树 + App Bundle | `@deepseek-ai/dsh` / `dsh web` | 安装后经 `dsh plugin` → 内嵌 pnpm 开放扩展 |
| **Python JSON-RPC SDK** | `@yao-pkg/pkg --sea` 单文件可执行文件 | `dsh-sdk-jsonrpc-demo` 打包 bin | 来自 `dsh-jsonrpc-agent-pkg` 的封闭 VFS 集合 |

**不要**用 `@yao-pkg/pkg --sea` 做 GUI 产品：SEA 的封闭 VFS 与安装后的 `dsh plugin add` 冲突，且 SEA 笔记已将该路线归属 SDK。**不要**恢复源码检出安装器，也不要把 Homebrew 当作 GUI 主路径。

## 曾考虑的替代方案

**GUI 复用 `@yao-pkg/pkg --sea`。** 失去可供安装后插件添加使用的真实磁盘 `node_modules`；把封闭的 SDK 运行时与开放的桌面安装混为一谈。否决；SEA 留在 Python 轨道。

**Electron 壳。** 在 Node 闭包之上再叠加 Chromium 运行时（约 100+ MB）。因体积否决。原生窗口后来采用轻量 **Tauri / WKWebView** 壳——见 [Tauri 壳笔记](2026-08-13-macos-arm64-tauri-desktop-shell.md)；壳的体积策略与生命周期由该笔记负责。

**源码树 / 托管安装器分发。** 与「仅通过根 `pnpm` 脚本从源码运行、不拥有安装器生命周期状态」的决策冲突。否决作为 GUI 主路径。

**Homebrew 作为 GUI 主安装渠道。** 可作为后续可选渠道；它不能服务没有 Homebrew 的双击用户。

**把 deploy manifest 放在 `packages/examples/` 下。** examples 是可运行的演示组合包；纯打包用的 deploy 根应与其他分发根（`python/sdk-runtime`）并列，因此放在 `packaging/macos/closure-manifest/`。

**附带 136 MB 的 `@pnpm/macos-arm64` Mach-O。** 可用，但 npm `pnpm` 包加绑定 Node 的 shim 已足以满足 `spawnSync('pnpm')`，并让闭包更小（约 20 MB vs 解压约 140 MB）。

**在安装树中保留异平台 prebuild / `.map` / `.d.ts` / Node `include/`。** 度量后这是桌面树最容易拿下的体积；裁剪不改变 web+plugin 产品面。`--skip-prune` 与 `--keep-node-headers` 留给诊断与原生重建。

**把原始 `.app` 作为 CI artifact 上传。** GitHub 会存一份未压缩树；发布对为 DMG（ULMO）+ `.app.tar.xz`。

## 后果

- 双击用户可走 DMG → `.app`，无需安装 Node 或 pnpm；未签名渠道接受 Gatekeeper 摩擦。
- 通过 PATH wrapper 使用 `dsh plugin` 时不需要系统 pnpm；profile 状态仍在 `~/.dsh`。
- manifest 相对 `apps/cli` 漂移仍会经 `verify-runtime-closure` 显式失败，直到桌面 peer 列表补上对应行。
- CI 按需构建并上传 DMG / `.app.tar.xz`；不进入默认 PR suite。
- 完整交互式 web 启动（凭证 + 空闲端口 + 浏览器）仍为本地/手工检查；自动冒烟覆盖 `web --help`、前端解析、内嵌 `which pnpm`，以及 ad-hoc codesign 校验。
- darwin-arm64 上裁剪 + ULMO + tar.xz 后的近似度量：`.app` 约 608 MB → 约 309 MB；DMG 约 253 MB（UDZO）→ 约 103 MB（ULMO）；`.app.tar.xz` 约 47 MB。
