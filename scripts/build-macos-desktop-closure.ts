/**
 * Build the macOS arm64 desktop GUI install closure: official Node + symlink-free
 * `pnpm deploy --prod` of `dsh-macos-desktop-pkg` + embedded pnpm for `dsh plugin`.
 * Does not invoke `@yao-pkg/pkg` or SEA; that route stays with the Python JSON-RPC SDK
 * ([Agent Note](../.agents/notes/implemented/architecture/2026-08-13-macos-arm64-app-bundle-desktop-distribution.md)).
 *
 * After deploy, prunes runtime-unused tree weight (foreign prebuilds, maps, `.d.ts`,
 * test dirs) and slims the official Node tarball (drop `include/`, bundled npm/corepack)
 * so the `.app` / DMG stay smaller without changing product capabilities.
 */

import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync, statSync } from 'node:fs'
import { chmod, cp, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web'
import { parseArgs } from 'node:util'

/**
 * Write a `fetch` body to disk. Casts the DOM `ReadableStream` from
 * `Response.body` to Node's `stream/web` type so `Readable.fromWeb` accepts it
 * (the two lib definitions disagree on BYOB reader generics).
 *
 * @param body - Non-null `Response.body` from `fetch`.
 * @param dest - Destination file path.
 */
async function writeFetchBody(body: ReadableStream<Uint8Array>, dest: string): Promise<void> {
  await pipeline(
    Readable.fromWeb(body as NodeWebReadableStream<Uint8Array>),
    createWriteStream(dest),
  )
}

const root = resolve(import.meta.dirname, '..')

/** The closure manifest whose dependencies define the desktop install. */
const DEPLOY_ROOT_PACKAGE = 'dsh-macos-desktop-pkg'
/** Manifest path relative to the repository root. */
const MANIFEST_REL = 'packaging/macos/closure-manifest'
/** Legacy deploy may hoist peer-specialized workspace packages back here. */
const DEPLOY_SOURCE_NODE_MODULES = join(MANIFEST_REL, 'node_modules')
/** Built CLI entry inside the deployed closure. */
const CLI_BIN = 'node_modules/@deepseek-ai/dsh/lib/bin.js'
/** Frontend static index resolved the same way as `dsh-web-app`. */
const FRONTEND_INDEX = '@deepseek-ai/dsh-web-frontend/dist/index.html'
/** Default output directory (gitignored). */
const DEFAULT_OUT_DIR = 'dist-macos-desktop'
/** Official Node major matching the SEA/Python carrier target. */
const DEFAULT_NODE_VERSION = '24.11.0'
/**
 * Default Node dist root. Override with `--node-dist-base` or `DSH_NODE_DIST_BASE`
 * (for example `https://npmmirror.com/mirrors/node`) when nodejs.org is slow.
 */
const DEFAULT_NODE_DIST_BASE = process.env.DSH_NODE_DIST_BASE ?? 'https://nodejs.org/dist'
/**
 * Default npm registry for packing the embedded `pnpm` package. Override with
 * `--npm-registry` or `DSH_NPM_REGISTRY` when registry.npmjs.org is slow.
 */
const DEFAULT_NPM_REGISTRY = process.env.DSH_NPM_REGISTRY ?? 'https://registry.npmjs.org'
/** Packaging templates that ship into the closure (`bin/dsh`, pnpm shim). */
const PACKAGING_DIR = join(root, 'packaging', 'macos')
/** Documentation excluded from the deployed install tree root. */
const DEPLOY_ONLY_DOCS = ['README.md', 'README.zh.md', 'README.i18n.yaml'] as const
/** Host platform triple kept when pruning native prebuilds (macOS arm64 only). */
const KEEP_PREBUILD_PLATFORMS = new Set(['darwin-arm64'])
/**
 * Directory basenames removed from the deploy tree.
 * Only test trees — packages such as `yaml` ship runtime code under `doc/`.
 */
const PRUNE_DIR_NAMES = new Set(['test', 'tests', '__tests__'])
/** Package-local markdown/docs removed from every deployed package (keep LICENSE*). */
const PRUNE_DOC_BASENAMES = new Set([
  'readme.md',
  'readme.zh.md',
  'readme.i18n.yaml',
  'changelog.md',
  'changelog',
  'history.md',
  'changes.md',
  'authors',
  'authors.md',
  'contributing.md',
  'security.md',
])

/**
 * Validated CLI configuration; construction owns help and parse-error exits.
 */
class BuildCli {
  private constructor(
    /** Skip step 1 (`pnpm run build`); lib/ and web dist must already exist. */
    readonly skipBuild: boolean,
    /** Skip downloading and extracting the official Node tarball. */
    readonly skipNode: boolean,
    /** Skip packing and embedding the `pnpm` package for `dsh plugin`. */
    readonly skipPnpm: boolean,
    /** Skip post-deploy size pruning of the install tree and Node tarball extras. */
    readonly skipPrune: boolean,
    /**
     * Keep Node `include/` headers so post-install `node-gyp` rebuilds can compile
     * natives without a system Node. Default is off (headers are ~70 MB).
     */
    readonly keepNodeHeaders: boolean,
    /** Skip the post-deploy frontend resolve smoke. */
    readonly skipSmoke: boolean,
    /** Print every command and filesystem change instead of executing. */
    readonly dryRun: boolean,
    /** Official Node version string without a leading `v`. */
    readonly nodeVersion: string,
    /** Node dist base URL (`…/vX.Y.Z/node-vX.Y.Z-darwin-arm64.tar.gz`). */
    readonly nodeDistBase: string,
    /** npm registry used to `npm pack pnpm@…`. */
    readonly npmRegistry: string,
    /** Output directory relative to the repository root. */
    readonly outDir: string,
  ) {}

  /**
   * Parse argv. Help exits 0; malformed flags exit 1.
   * @param argv - the raw arguments (`process.argv.slice(2)`).
   * @returns the parsed, validated configuration.
   */
  static parse(argv: string[]): BuildCli {
    let values: ReturnType<typeof BuildCli.parseRaw>
    try {
      values = BuildCli.parseRaw(argv)
    } catch (error) {
      console.error(`build-macos-desktop-closure: ${error instanceof Error ? error.message : String(error)}\n`)
      console.error(BuildCli.usage())
      process.exit(1)
    }
    if (values.help) {
      console.log(BuildCli.usage())
      process.exit(0)
    }
    const nodeVersion = values['node-version'] ?? DEFAULT_NODE_VERSION
    if (!/^\d+\.\d+\.\d+$/.test(nodeVersion)) {
      throw new Error(`build-macos-desktop-closure: --node-version must look like ${DEFAULT_NODE_VERSION}, got ${JSON.stringify(nodeVersion)}.`)
    }
    const nodeDistBase = (values['node-dist-base'] ?? DEFAULT_NODE_DIST_BASE).replace(/\/$/, '')
    const npmRegistry = (values['npm-registry'] ?? DEFAULT_NPM_REGISTRY).replace(/\/$/, '')
    return new BuildCli(
      values['skip-build'],
      values['skip-node'],
      values['skip-pnpm'],
      values['skip-prune'],
      values['keep-node-headers'],
      values['skip-smoke'],
      values['dry-run'],
      nodeVersion,
      nodeDistBase,
      npmRegistry,
      values['out-dir'] ?? DEFAULT_OUT_DIR,
    )
  }

  private static parseRaw(argv: string[]) {
    return parseArgs({
      args: argv,
      options: {
        'skip-build': { type: 'boolean', default: false },
        'skip-node': { type: 'boolean', default: false },
        'skip-pnpm': { type: 'boolean', default: false },
        'skip-prune': { type: 'boolean', default: false },
        'keep-node-headers': { type: 'boolean', default: false },
        'skip-smoke': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        'node-version': { type: 'string' },
        'node-dist-base': { type: 'string' },
        'npm-registry': { type: 'string' },
        'out-dir': { type: 'string' },
        'help': { type: 'boolean', default: false },
      },
    }).values
  }

  private static usage(): string {
    return [
      'Usage: pnpm exec tsx scripts/build-macos-desktop-closure.ts [flags]',
      '',
      '  --skip-build              skip `pnpm run build` (lib/ and web dist must already exist).',
      '  --skip-node               skip embedding the official Node tarball.',
      '  --skip-pnpm               skip embedding the pnpm package used by `dsh plugin`.',
      '  --skip-prune              keep maps, .d.ts, tests, foreign prebuilds, Node include/npm.',
      '  --keep-node-headers       keep Node include/ (~70 MB) for post-install node-gyp rebuilds.',
      '  --skip-smoke              skip the post-deploy frontend resolve / PATH smokes.',
      '  --node-version=<x.y.z>    official Node version to embed (default: ' + DEFAULT_NODE_VERSION + ').',
      '  --node-dist-base=<url>    Node dist mirror (default: ' + DEFAULT_NODE_DIST_BASE + ', or $DSH_NODE_DIST_BASE).',
      '  --npm-registry=<url>      npm registry for packing pnpm (default: ' + DEFAULT_NPM_REGISTRY + ', or $DSH_NPM_REGISTRY).',
      '  --out-dir=<path>          output directory under the repo root (default: ' + DEFAULT_OUT_DIR + ').',
      '  --dry-run                 print every command and filesystem change without executing.',
      '  --help                    print this help.',
      '',
      'Output layout:',
      '  <out-dir>/node/     official Node (darwin-arm64; include/npm stripped unless kept)',
      `  <out-dir>/dsh/      symlink-free pnpm deploy of ${DEPLOY_ROOT_PACKAGE} (pruned)`,
      '  <out-dir>/pnpm/    embedded pnpm package + bin shim for `dsh plugin`',
      '  <out-dir>/bin/dsh  PATH wrapper that prefers the embedded pnpm + Node',
      '',
      'Smoke (after a successful build):',
      `  <out-dir>/node/bin/node <out-dir>/dsh/${CLI_BIN} web --help`,
      `  resolve ${FRONTEND_INDEX} through the deployed install (run automatically unless --skip-smoke)`,
      '  <out-dir>/bin/dsh web --help  and  which pnpm  under the wrapper PATH',
      '',
      'This script never calls @yao-pkg/pkg or --sea. See packaging/macos/README.md.',
    ].join('\n')
  }
}

function pnpmBin(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

/**
 * Render a command for logs and errors, quoting arguments with spaces.
 * @param command - the executable.
 * @param args - its arguments.
 * @returns the printable command line.
 */
function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(part => (part.includes(' ') ? JSON.stringify(part) : part)).join(' ')
}

/**
 * Sequential desktop-closure pipeline. Subprocesses inherit stdio; dry runs
 * print commands and filesystem changes.
 */
class MacosDesktopClosureBuild {
  readonly outDir: string
  readonly installDir: string
  readonly nodeDir: string
  readonly pnpmDir: string
  readonly binDir: string
  private readonly stagingSourceNodeModules = resolve(root, DEPLOY_SOURCE_NODE_MODULES)

  constructor(private readonly cli: BuildCli) {
    this.outDir = resolve(root, cli.outDir)
    this.installDir = join(this.outDir, 'dsh')
    this.nodeDir = join(this.outDir, 'node')
    this.pnpmDir = join(this.outDir, 'pnpm')
    this.binDir = join(this.outDir, 'bin')
  }

  /** Fail loud when embedding Node on a host that is not macOS arm64. */
  assertHostForNode(): void {
    if (this.cli.skipNode) return
    if (process.platform !== 'darwin' || process.arch !== 'arm64') {
      throw new Error(
        'build-macos-desktop-closure: embedding Node requires darwin-arm64 '
        + `(host is ${process.platform}-${process.arch}); pass --skip-node to build only the dsh install tree.`,
      )
    }
  }

  /** Verify the desktop deploy manifest supplies every required workspace peer. */
  async verifyClosure(): Promise<void> {
    await this.run('runtime dependency closure', pnpmBin(), [
      'exec',
      'tsx',
      'scripts/verify-runtime-closure.ts',
      '--manifest',
      `${MANIFEST_REL}/package.json`,
    ])
  }

  /** Build all package artifacts unless `--skip-build` was passed. */
  async build(): Promise<void> {
    if (this.cli.skipBuild) {
      console.log('build-macos-desktop-closure: skipping pnpm run build (--skip-build)')
      return
    }
    await this.run('build', pnpmBin(), ['run', 'build'])
  }

  /** Clear the output tree. */
  async prepareOutput(): Promise<void> {
    if (this.outDir === root || root.startsWith(this.outDir + sep)) {
      throw new Error(`build-macos-desktop-closure: refusing to clear out-dir ${this.outDir}: it contains the repo root.`)
    }
    if (this.cli.dryRun) {
      console.log(`build-macos-desktop-closure: [dry-run] rm -rf ${this.outDir}`)
      return
    }
    await rm(this.outDir, { recursive: true, force: true })
    await mkdir(this.outDir, { recursive: true })
  }

  /** Deploy the runtime closure into `<out-dir>/dsh`. */
  async deployInstall(): Promise<void> {
    if (this.cli.dryRun) console.log(`build-macos-desktop-closure: [dry-run] rm -rf ${this.installDir}`)
    else await rm(this.installDir, { recursive: true, force: true })
    await this.run('deploy', pnpmBin(), [
      '--filter',
      DEPLOY_ROOT_PACKAGE,
      'deploy',
      '--legacy',
      '--prod',
      '--config.node-linker=hoisted',
      '--config.auto-install-peers=false',
      '--config.link-workspace-packages=true',
      this.installDir,
    ])
    await this.restoreLegacyHoists()
    await this.materializeStagedLinks()
    if (this.cli.dryRun) {
      for (const name of DEPLOY_ONLY_DOCS) console.log(`build-macos-desktop-closure: [dry-run] rm -f ${join(this.installDir, name)}`)
    } else {
      await Promise.all(DEPLOY_ONLY_DOCS.map(name => rm(join(this.installDir, name), { force: true })))
    }
    if (!this.cli.dryRun && !existsSync(join(this.installDir, CLI_BIN))) {
      throw new Error(
        `build-macos-desktop-closure: ${join(this.installDir, CLI_BIN)} missing — run without --skip-build so lib/ artifacts exist.`,
      )
    }
    // Legacy deploy may leave a hoist tree beside the manifest; remove it so
    // subsequent workspace `pnpm` invocations do not treat it as install state.
    if (this.cli.dryRun) {
      console.log(`build-macos-desktop-closure: [dry-run] rm -rf ${this.stagingSourceNodeModules}`)
    } else {
      await rm(this.stagingSourceNodeModules, { recursive: true, force: true })
    }
  }

  /**
   * Restore direct packages that pnpm's legacy hoister places beside the deploy
   * source instead of in the target.
   */
  private async restoreLegacyHoists(): Promise<void> {
    if (this.cli.dryRun) {
      console.log('build-macos-desktop-closure: [dry-run] restore direct dependencies omitted by legacy deploy')
      return
    }
    const manifestPath = join(this.installDir, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const restored: string[] = []
    for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) {
      const destination = join(this.installDir, 'node_modules', dependency)
      if (existsSync(destination)) continue
      const source = join(this.stagingSourceNodeModules, dependency)
      if (!existsSync(source)) {
        throw new Error(
          `build-macos-desktop-closure: deployed dependency ${dependency} is absent from both ${destination} and ${source}.`,
        )
      }
      await mkdir(dirname(destination), { recursive: true })
      const nestedNodeModules = join(source, 'node_modules')
      await cp(source, destination, {
        recursive: true,
        dereference: true,
        filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
      })
      restored.push(dependency)
    }
    const stillMissing = Object.keys(manifest.dependencies ?? {})
      .filter(dependency => !existsSync(join(this.installDir, 'node_modules', dependency)))
    if (stillMissing.length > 0) {
      throw new Error(`build-macos-desktop-closure: staged dependencies remain missing: ${stillMissing.join(', ')}.`)
    }
    if (restored.length > 0) {
      console.log(`build-macos-desktop-closure: restored legacy deploy hoists: ${restored.join(', ')}`)
    }
  }

  /** Replace deploy-time package links with files and reject any remaining link. */
  private async materializeStagedLinks(): Promise<void> {
    if (this.cli.dryRun) {
      console.log('build-macos-desktop-closure: [dry-run] materialize staged package links')
      return
    }
    const nodeModules = join(this.installDir, 'node_modules')
    let remaining = await this.findSymlink(nodeModules)
    while (remaining !== undefined) {
      const segments = remaining.slice(nodeModules.length + 1).split(sep)
      const binIndex = segments.lastIndexOf('.bin')
      if (binIndex >= 0) {
        await rm(join(nodeModules, ...segments.slice(0, binIndex + 1)), { recursive: true, force: true })
        remaining = await this.findSymlink(nodeModules)
        continue
      }
      const destination = remaining
      const source = await realpath(destination)
      const nestedNodeModules = join(source, 'node_modules')
      await rm(destination, { recursive: true, force: true })
      await cp(source, destination, {
        recursive: true,
        dereference: true,
        filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
      })
      remaining = await this.findSymlink(nodeModules)
    }
  }

  /** Return the first symbolic link below a directory, if one exists. */
  private async findSymlink(directory: string): Promise<string | undefined> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const metadata = await lstat(path)
      if (metadata.isSymbolicLink()) return path
      if (metadata.isDirectory()) {
        const nested = await this.findSymlink(path)
        if (nested !== undefined) return nested
      }
    }
    return undefined
  }

  /** Download and extract the official Node darwin-arm64 tarball into `<out-dir>/node`. */
  async embedNode(): Promise<void> {
    if (this.cli.skipNode) {
      console.log('build-macos-desktop-closure: skipping Node embed (--skip-node)')
      return
    }
    const version = this.cli.nodeVersion
    const archiveName = `node-v${version}-darwin-arm64.tar.gz`
    const url = `${this.cli.nodeDistBase}/v${version}/${archiveName}`
    const cacheDir = resolve(root, '.cache', 'nodejs')
    const archivePath = join(cacheDir, archiveName)
    const extractRoot = join(cacheDir, `node-v${version}-darwin-arm64`)
    if (this.cli.dryRun) {
      console.log(`build-macos-desktop-closure: [dry-run] download ${url}`)
      console.log(`build-macos-desktop-closure: [dry-run] extract into ${this.nodeDir}`)
      return
    }
    await mkdir(cacheDir, { recursive: true })
    const archiveReady = existsSync(archivePath) && statSync(archivePath).size > 1_000_000
    if (!archiveReady) {
      console.log(`build-macos-desktop-closure: downloading ${url}`)
      const response = await fetch(url)
      if (!response.ok || response.body === null) {
        throw new Error(`build-macos-desktop-closure: failed to download ${url}: HTTP ${response.status}`)
      }
      await writeFetchBody(response.body, archivePath)
    } else {
      console.log(`build-macos-desktop-closure: reusing cached ${archivePath}`)
    }
    await rm(extractRoot, { recursive: true, force: true })
    await this.run('extract Node', 'tar', ['-xzf', archivePath, '-C', cacheDir])
    await rm(this.nodeDir, { recursive: true, force: true })
    await cp(extractRoot, this.nodeDir, { recursive: true })
    await chmod(join(this.nodeDir, 'bin', 'node'), 0o755)
    await this.slimEmbeddedNode()
  }

  /**
   * Drop Node tarball extras unused by the desktop runtime: headers (unless
   * `--keep-node-headers`), bundled npm/corepack, man pages, and docs. The
   * product uses the sibling embedded pnpm shim, not npm.
   */
  async slimEmbeddedNode(): Promise<void> {
    if (this.cli.skipNode || this.cli.skipPrune) return
    if (this.cli.dryRun) {
      console.log('build-macos-desktop-closure: [dry-run] slim embedded Node (drop include/npm/share/docs)')
      return
    }
    const removals: string[] = [
      join(this.nodeDir, 'lib'),
      join(this.nodeDir, 'share'),
      join(this.nodeDir, 'CHANGELOG.md'),
      join(this.nodeDir, 'README.md'),
      join(this.nodeDir, 'bin', 'npm'),
      join(this.nodeDir, 'bin', 'npx'),
      join(this.nodeDir, 'bin', 'corepack'),
    ]
    if (!this.cli.keepNodeHeaders) {
      removals.push(join(this.nodeDir, 'include'))
    }
    let removedBytes = 0
    for (const path of removals) {
      if (!existsSync(path)) continue
      removedBytes += await directoryByteSize(path)
      await rm(path, { recursive: true, force: true })
    }
    console.log(
      `build-macos-desktop-closure: slimmed Node extras (−${formatMegabytes(removedBytes)}`
      + `${this.cli.keepNodeHeaders ? '; kept include/' : ''})`,
    )
  }

  /**
   * Remove runtime-unused weight from the deploy tree: foreign native
   * prebuilds, source maps, TypeScript declaration files, `@types/*`, test
   * directories, and package READMEs. Does not drop product packages (otel, shiki,
   * LLM SDKs) or runtime `doc/` trees.
   */
  async pruneInstallTree(): Promise<void> {
    if (this.cli.skipPrune) {
      console.log('build-macos-desktop-closure: skipping install prune (--skip-prune)')
      return
    }
    if (this.cli.dryRun) {
      console.log('build-macos-desktop-closure: [dry-run] prune deploy tree (prebuilds/maps/d.ts/tests/docs)')
      return
    }
    const nodeModules = join(this.installDir, 'node_modules')
    if (!existsSync(nodeModules)) {
      throw new Error(`build-macos-desktop-closure: cannot prune missing ${nodeModules}`)
    }
    const before = await directoryByteSize(this.installDir)
    const stats = { dirs: 0, files: 0, typesPackages: 0 }
    await this.pruneTree(nodeModules, stats)
    // Root deploy docs already removed; also drop leftover bilingual READMEs at install root.
    for (const name of DEPLOY_ONLY_DOCS) {
      await rm(join(this.installDir, name), { force: true })
    }
    const after = await directoryByteSize(this.installDir)
    console.log(
      'build-macos-desktop-closure: pruned install tree '
      + `(−${formatMegabytes(before - after)}; ${stats.dirs} dirs, ${stats.files} files, `
      + `${stats.typesPackages} @types packages)`,
    )
  }

  /**
   * Depth-first prune of one directory under the deploy `node_modules`.
   * @param directory - absolute path to walk.
   * @param stats - running counters for the summary log.
   */
  private async pruneTree(
    directory: string,
    stats: { dirs: number; files: number; typesPackages: number },
  ): Promise<void> {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      // Race with concurrent deletes is impossible here; tolerate ENOENT if a
      // parent already removed the directory while walking scoped packages.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      let metadata
      try {
        metadata = await lstat(path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      if (metadata.isSymbolicLink()) continue
      if (metadata.isDirectory()) {
        const lower = entry.name.toLowerCase()
        if (entry.name === '@types') {
          await rm(path, { recursive: true, force: true })
          stats.typesPackages += 1
          stats.dirs += 1
          continue
        }
        if (PRUNE_DIR_NAMES.has(lower)) {
          await rm(path, { recursive: true, force: true })
          stats.dirs += 1
          continue
        }
        if (isForeignPrebuildDir(directory, entry.name)) {
          await rm(path, { recursive: true, force: true })
          stats.dirs += 1
          continue
        }
        await this.pruneTree(path, stats)
        continue
      }
      if (!metadata.isFile()) continue
      if (shouldPruneFile(entry.name)) {
        await rm(path, { force: true })
        stats.files += 1
      }
    }
  }

  /**
   * Embed the repository `packageManager` pnpm release under `<out-dir>/pnpm/`
   * and install a shim that runs it with the sibling embedded Node so
   * `spawnSync('pnpm')` does not need a system pnpm.
   */
  async embedPnpm(): Promise<void> {
    if (this.cli.skipPnpm) {
      console.log('build-macos-desktop-closure: skipping pnpm embed (--skip-pnpm)')
      return
    }
    const pnpmVersion = await this.readPackageManagerVersion()
    const cacheDir = resolve(root, '.cache', 'pnpm-npm')
    const tarballName = `pnpm-${pnpmVersion}.tgz`
    const tarballPath = join(cacheDir, tarballName)
    const packUrl = `${this.cli.npmRegistry}/pnpm/-/${tarballName}`
    if (this.cli.dryRun) {
      console.log(`build-macos-desktop-closure: [dry-run] download ${packUrl}`)
      console.log(`build-macos-desktop-closure: [dry-run] embed pnpm@${pnpmVersion} into ${this.pnpmDir}`)
      return
    }
    await mkdir(cacheDir, { recursive: true })
    const tarballReady = existsSync(tarballPath) && statSync(tarballPath).size > 10_000
    if (!tarballReady) {
      console.log(`build-macos-desktop-closure: downloading ${packUrl}`)
      const response = await fetch(packUrl)
      if (!response.ok || response.body === null) {
        throw new Error(`build-macos-desktop-closure: failed to download ${packUrl}: HTTP ${response.status}`)
      }
      await writeFetchBody(response.body, tarballPath)
    } else {
      console.log(`build-macos-desktop-closure: reusing cached ${tarballPath}`)
    }
    const extractRoot = join(cacheDir, `pnpm-${pnpmVersion}`)
    await rm(extractRoot, { recursive: true, force: true })
    await mkdir(extractRoot, { recursive: true })
    await this.run('extract pnpm', 'tar', ['-xzf', tarballPath, '-C', extractRoot])
    const packageDir = join(extractRoot, 'package')
    if (!existsSync(join(packageDir, 'bin', 'pnpm.cjs'))) {
      throw new Error(`build-macos-desktop-closure: unexpected pnpm tarball layout under ${packageDir}`)
    }
    await rm(this.pnpmDir, { recursive: true, force: true })
    await mkdir(join(this.pnpmDir, 'bin'), { recursive: true })
    await mkdir(join(this.pnpmDir, 'node_modules'), { recursive: true })
    await cp(packageDir, join(this.pnpmDir, 'node_modules', 'pnpm'), { recursive: true })
    await writeFile(
      join(this.pnpmDir, 'package.json'),
      `${JSON.stringify({ name: 'dsh-macos-desktop-pnpm', private: true, version: pnpmVersion }, null, 2)}\n`,
    )
    await cp(join(PACKAGING_DIR, 'bin', 'pnpm-shim.sh'), join(this.pnpmDir, 'bin', 'pnpm'))
    await chmod(join(this.pnpmDir, 'bin', 'pnpm'), 0o755)
  }

  /**
   * Install `<out-dir>/bin/dsh`, the PATH wrapper that prefers embedded pnpm + Node.
   */
  async installPathWrapper(): Promise<void> {
    if (this.cli.dryRun) {
      console.log(`build-macos-desktop-closure: [dry-run] install ${join(this.binDir, 'dsh')}`)
      return
    }
    await mkdir(this.binDir, { recursive: true })
    await cp(join(PACKAGING_DIR, 'bin', 'dsh'), join(this.binDir, 'dsh'))
    await chmod(join(this.binDir, 'dsh'), 0o755)
  }

  /**
   * Resolve the frontend static index through the deployed install using the
   * embedded Node when present, otherwise the host Node; also smoke the PATH
   * wrapper and embedded pnpm when both are present.
   */
  async smoke(): Promise<void> {
    if (this.cli.skipSmoke) {
      console.log('build-macos-desktop-closure: skipping smoke (--skip-smoke)')
      return
    }
    if (this.cli.dryRun) {
      console.log('build-macos-desktop-closure: [dry-run] smoke frontend resolve + `dsh web --help` + PATH wrapper')
      return
    }
    const nodeBin = existsSync(join(this.nodeDir, 'bin', 'node'))
      ? join(this.nodeDir, 'bin', 'node')
      : process.execPath
    const requireFrom = join(this.installDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
    const resolveScript = [
      'import { createRequire } from \'node:module\'',
      `const require = createRequire(${JSON.stringify(requireFrom)})`,
      `const resolved = require.resolve(${JSON.stringify(FRONTEND_INDEX)})`,
      'console.log(resolved)',
    ].join(';')
    await this.run('smoke frontend resolve', nodeBin, ['--input-type=module', '-e', resolveScript])
    await this.run('smoke dsh web --help', nodeBin, [join(this.installDir, CLI_BIN), 'web', '--help'])
    const wrapper = join(this.binDir, 'dsh')
    const pnpmShim = join(this.pnpmDir, 'bin', 'pnpm')
    if (existsSync(wrapper) && existsSync(pnpmShim) && existsSync(join(this.nodeDir, 'bin', 'node'))) {
      await this.run('smoke PATH wrapper web --help', wrapper, ['web', '--help'])
      await this.run('smoke embedded pnpm --version', pnpmShim, ['--version'])
      await this.run('smoke which pnpm under wrapper PATH', '/bin/zsh', [
        '-c',
        [
          // Keep /bin and /usr/bin so the shim's `dirname`/`cd` resolve; prepend
          // the embedded bins so `command -v pnpm` still prefers the in-tree shim.
          `export PATH=${JSON.stringify(`${this.pnpmDir}/bin:${this.nodeDir}/bin:/usr/bin:/bin`)}`,
          'command -v pnpm',
          'pnpm --version',
          `expected=${JSON.stringify(pnpmShim)}`,
          'resolved="$(command -v pnpm)"',
          'if [ "$resolved" != "$expected" ]; then echo "expected $expected, got $resolved" >&2; exit 1; fi',
        ].join(' && '),
      ])
    } else {
      console.log('build-macos-desktop-closure: skipping PATH-wrapper smoke (node/pnpm/wrapper incomplete)')
    }
  }

  /** Print the closure paths and sizes. */
  printSummary(): void {
    console.log(this.cli.dryRun ? 'build-macos-desktop-closure: [dry-run] would produce:' : 'build-macos-desktop-closure: products:')
    console.log(`  ${this.installDir}`)
    if (!this.cli.skipNode) console.log(`  ${this.nodeDir}`)
    if (!this.cli.skipPnpm) console.log(`  ${this.pnpmDir}`)
    console.log(`  ${this.binDir}`)
    if (this.cli.dryRun) return
    if (existsSync(join(this.nodeDir, 'bin', 'node'))) {
      const megabytes = statSync(join(this.nodeDir, 'bin', 'node')).size / (1024 * 1024)
      console.log(`  node binary  (${megabytes.toFixed(1)} MB)`)
    }
    if (existsSync(join(this.pnpmDir, 'bin', 'pnpm'))) {
      console.log(`  pnpm shim    ${join(this.pnpmDir, 'bin', 'pnpm')}`)
    }
    for (const [label, path] of [
      ['dsh/', this.installDir],
      ['node/', this.nodeDir],
      ['pnpm/', this.pnpmDir],
    ] as const) {
      if (!existsSync(path)) continue
      // Best-effort size; spawn du so APFS sparse accounting matches Finder.
      try {
        const output = spawnSyncDu(path)
        if (output !== undefined) console.log(`  ${label.padEnd(6)} ${output}`)
      } catch {
        // Size reporting must not fail the build.
      }
    }
  }

  /** Read `packageManager: pnpm@x.y.z` from the repository root package.json. */
  private async readPackageManagerVersion(): Promise<string> {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      packageManager?: string
    }
    const match = /^pnpm@(\d+\.\d+\.\d+)(?:\+.*)?$/.exec(manifest.packageManager ?? '')
    if (match?.[1] === undefined) {
      throw new Error(
        `build-macos-desktop-closure: root package.json packageManager must look like pnpm@x.y.z, got ${JSON.stringify(manifest.packageManager)}.`,
      )
    }
    return match[1]
  }

  /**
   * Run one subprocess with inherited stdio. Spawn and non-zero-exit errors
   * include the command; dry runs only print it.
   * @param label - the step name used in logs and error messages.
   * @param command - the executable.
   * @param args - its arguments.
   */
  private async run(label: string, command: string, args: string[]): Promise<void> {
    const printable = formatCommand(command, args)
    if (this.cli.dryRun) {
      console.log(`build-macos-desktop-closure: [dry-run] ${printable}`)
      return
    }
    console.log(`build-macos-desktop-closure: ${label}: ${printable}`)
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(command, args, {
        cwd: root,
        stdio: 'inherit',
        // Artifact builds must not mutate or validate a developer's Git hooks.
        env: { ...process.env, CI: 'true' },
      })
      child.once('error', (error) => {
        reject(new Error(`build-macos-desktop-closure: ${label} failed to spawn: ${error.message} (${printable})`))
      })
      child.once('exit', (code, signal) => {
        if (code === 0) {
          resolvePromise()
          return
        }
        const cause = code === null ? `signal ${signal ?? 'unknown'}` : `exit code ${code}`
        reject(new Error(`build-macos-desktop-closure: ${label} failed (${cause}): ${printable}`))
      })
    })
  }
}

async function main(): Promise<void> {
  const cli = BuildCli.parse(process.argv.slice(2))
  const pipeline = new MacosDesktopClosureBuild(cli)
  console.log(`build-macos-desktop-closure: out-dir: ${pipeline.outDir}`)
  console.log(`build-macos-desktop-closure: node: ${cli.skipNode ? '(skipped)' : `${cli.nodeVersion} from ${cli.nodeDistBase}`}`)
  console.log(`build-macos-desktop-closure: pnpm: ${cli.skipPnpm ? '(skipped)' : `from ${cli.npmRegistry}`}`)
  console.log(`build-macos-desktop-closure: prune: ${cli.skipPrune ? 'skipped' : cli.keepNodeHeaders ? 'on (keep node headers)' : 'on'}`)
  pipeline.assertHostForNode()
  await pipeline.verifyClosure()
  await pipeline.build()
  await pipeline.prepareOutput()
  await pipeline.deployInstall()
  await pipeline.pruneInstallTree()
  await pipeline.embedNode()
  await pipeline.embedPnpm()
  await pipeline.installPathWrapper()
  await pipeline.smoke()
  pipeline.printSummary()
}

/**
 * Whether a child directory under `prebuilds` / `prebuilt` is for a non-host OS/arch.
 * Keeps only {@link KEEP_PREBUILD_PLATFORMS}; every other child of those parents is removed.
 * @param parentDir - absolute parent path.
 * @param name - child basename (for example `win32-x64`).
 * @returns true when the folder should be deleted on darwin-arm64.
 */
function isForeignPrebuildDir(parentDir: string, name: string): boolean {
  const parentBase = parentDir.split(sep).at(-1)?.toLowerCase()
  if (parentBase !== 'prebuilds' && parentBase !== 'prebuilt') return false
  return !KEEP_PREBUILD_PLATFORMS.has(name)
}

/**
 * Whether a file basename is safe to delete from the runtime install.
 * @param name - the file basename.
 * @returns true when the file is maps, declarations, build info, or package docs.
 */
function shouldPruneFile(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower.endsWith('.map')) return true
  if (lower.endsWith('.tsbuildinfo')) return true
  if (lower.endsWith('.d.ts') || lower.endsWith('.d.mts') || lower.endsWith('.d.cts')) return true
  if (lower.endsWith('.pdb')) return true
  if (PRUNE_DOC_BASENAMES.has(lower)) return true
  return false
}

/**
 * Sum logical file sizes under a path (files only; follows nothing — uses lstat).
 * @param path - file or directory.
 * @returns total bytes.
 */
async function directoryByteSize(path: string): Promise<number> {
  let metadata
  try {
    metadata = await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw error
  }
  if (metadata.isSymbolicLink()) return 0
  if (metadata.isFile()) return metadata.size
  if (!metadata.isDirectory()) return 0
  let total = 0
  for (const entry of await readdir(path, { withFileTypes: true })) {
    total += await directoryByteSize(join(path, entry.name))
  }
  return total
}

/**
 * Format a byte count as megabytes for logs.
 * @param bytes - size in bytes.
 * @returns a string like `12.3 MB`.
 */
function formatMegabytes(bytes: number): string {
  return `${(Math.max(0, bytes) / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Run `du -sh` and return the size field, or undefined on failure.
 * @param path - directory to measure.
 * @returns the `du` size token (for example `112M`).
 */
function spawnSyncDu(path: string): string | undefined {
  const text = execFileSync('du', ['-sh', path], { encoding: 'utf8' }).trim()
  return text.split(/\s+/, 1)[0]
}

await main()
