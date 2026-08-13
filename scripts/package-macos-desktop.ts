/**
 * Assemble the macOS arm64 desktop `.app` (and optional DMG / tar.xz) from
 * `dist-macos-desktop/`: Tauri WKWebView shell + runtime closure.
 * Ad-hoc codesign only — no Developer ID / notarization.
 * ([Agent Note](../.agents/notes/implemented/architecture/2026-08-13-macos-arm64-tauri-desktop-shell.md)).
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'

const root = resolve(import.meta.dirname, '..')

/** Default closure directory produced by `build-macos-desktop-closure`. */
const DEFAULT_CLOSURE_DIR = 'dist-macos-desktop'
/** App bundle display name (also the `.app` folder name). */
const APP_NAME = 'DeepSeek Harness'
/** Executable name inside `Contents/MacOS/` (no spaces). */
const EXECUTABLE_NAME = 'DeepSeekHarness'
/** Packaging templates under `packaging/macos/`. */
const PACKAGING_DIR = join(root, 'packaging', 'macos')
/** Tauri / Cargo project that produces `Contents/MacOS/DeepSeekHarness`. */
const SHELL_DIR = join(PACKAGING_DIR, 'shell', 'src-tauri')
/** Deployed CLI entry relative to the dsh install tree. */
const CLI_BIN = 'node_modules/@deepseek-ai/dsh/lib/bin.js'
/**
 * Default DMG compression. ULMO (lzma) shrinks the publish artifact more than
 * UDZO (zlib) on the Node+closure tree; Finder still opens the image.
 */
const DEFAULT_DMG_FORMAT = 'ULMO'
/** Allowed `hdiutil -format` values for the desktop DMG. */
const DMG_FORMATS = new Set(['ULMO', 'UDZO', 'ULFO', 'UDBZ'])

/**
 * Validated CLI configuration; construction owns help and parse-error exits.
 */
class PackageCli {
  private constructor(
    /** Skip invoking the closure builder when the tree already exists. */
    readonly skipClosure: boolean,
    /** Skip `cargo build --release` when a shell binary already exists. */
    readonly skipShell: boolean,
    /** Install the zsh browser opener instead of the Tauri WKWebView shell. */
    readonly browserLauncher: boolean,
    /** Skip DMG creation. */
    readonly skipDmg: boolean,
    /** Skip `.tar.xz` of the `.app` (CI-friendly compressed artifact). */
    readonly skipTarXz: boolean,
    /** Skip ad-hoc codesign. */
    readonly skipSign: boolean,
    /** Skip post-package smokes. */
    readonly skipSmoke: boolean,
    /** Print every command and filesystem change instead of executing. */
    readonly dryRun: boolean,
    /** Closure directory relative to the repository root. */
    readonly closureDir: string,
    /** `hdiutil -format` for the DMG. */
    readonly dmgFormat: string,
  ) {}

  /**
   * Parse argv. Help exits 0; malformed flags exit 1.
   * @param argv - the raw arguments (`process.argv.slice(2)`).
   * @returns the parsed, validated configuration.
   */
  static parse(argv: string[]): PackageCli {
    let values: ReturnType<typeof PackageCli.parseRaw>
    try {
      values = PackageCli.parseRaw(argv)
    } catch (error) {
      console.error(`package-macos-desktop: ${error instanceof Error ? error.message : String(error)}\n`)
      console.error(PackageCli.usage())
      process.exit(1)
    }
    if (values.help) {
      console.log(PackageCli.usage())
      process.exit(0)
    }
    const dmgFormat = (values['dmg-format'] ?? DEFAULT_DMG_FORMAT).toUpperCase()
    if (!DMG_FORMATS.has(dmgFormat)) {
      throw new Error(
        `package-macos-desktop: --dmg-format must be one of ${[...DMG_FORMATS].join('|')}, got ${JSON.stringify(values['dmg-format'])}.`,
      )
    }
    return new PackageCli(
      values['skip-closure'],
      values['skip-shell'],
      values['browser-launcher'],
      values['skip-dmg'],
      values['skip-tar-xz'],
      values['skip-sign'],
      values['skip-smoke'],
      values['dry-run'],
      values['closure-dir'] ?? DEFAULT_CLOSURE_DIR,
      dmgFormat,
    )
  }

  private static parseRaw(argv: string[]) {
    return parseArgs({
      args: argv,
      options: {
        'skip-closure': { type: 'boolean', default: false },
        'skip-shell': { type: 'boolean', default: false },
        'browser-launcher': { type: 'boolean', default: false },
        'skip-dmg': { type: 'boolean', default: false },
        'skip-tar-xz': { type: 'boolean', default: false },
        'skip-sign': { type: 'boolean', default: false },
        'skip-smoke': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        'closure-dir': { type: 'string' },
        'dmg-format': { type: 'string' },
        'help': { type: 'boolean', default: false },
      },
    }).values
  }

  private static usage(): string {
    return [
      'Usage: pnpm exec tsx scripts/package-macos-desktop.ts [flags]',
      '',
      '  --skip-closure           require an existing closure tree; do not rebuild it.',
      '  --skip-shell             reuse packaging/macos/shell/src-tauri/target/release/' + EXECUTABLE_NAME + '.',
      '  --browser-launcher       install the zsh default-browser fallback instead of the Tauri shell.',
      '  --skip-dmg               skip hdiutil DMG creation.',
      '  --skip-tar-xz            skip .tar.xz of the .app (CI publish artifact).',
      '  --dmg-format=<fmt>       hdiutil format (default: ' + DEFAULT_DMG_FORMAT + '; also UDZO|ULFO|UDBZ).',
      '  --skip-sign              skip ad-hoc codesign.',
      '  --skip-smoke             skip wrapper / codesign smokes.',
      '  --closure-dir=<path>     closure directory under the repo root (default: ' + DEFAULT_CLOSURE_DIR + ').',
      '  --dry-run                print every command and filesystem change without executing.',
      '  --help                   print this help.',
      '',
      'Outputs (under the closure directory):',
      `  ${APP_NAME}.app/`,
      '  DeepSeek-Harness-macos-arm64.dmg  (unless --skip-dmg)',
      '  DeepSeek-Harness-macos-arm64.app.tar.xz  (unless --skip-tar-xz)',
      '',
      'Requires darwin-arm64 + Rust (cargo) for the Tauri shell. See packaging/macos/README.md.',
    ].join('\n')
  }
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
 * Assemble, sign, and optionally DMG-wrap the desktop App Bundle from a
 * closure tree.
 */
class MacosDesktopPackage {
  readonly closureDir: string
  readonly appBundle: string
  readonly dmgPath: string
  readonly tarXzPath: string

  constructor(private readonly cli: PackageCli) {
    this.closureDir = resolve(root, cli.closureDir)
    this.appBundle = join(this.closureDir, `${APP_NAME}.app`)
    this.dmgPath = join(this.closureDir, 'DeepSeek-Harness-macos-arm64.dmg')
    this.tarXzPath = join(this.closureDir, 'DeepSeek-Harness-macos-arm64.app.tar.xz')
  }

  /** Fail loud when packaging on a host that is not macOS arm64. */
  assertHost(): void {
    if (process.platform !== 'darwin' || process.arch !== 'arm64') {
      throw new Error(
        `package-macos-desktop: requires darwin-arm64 (host is ${process.platform}-${process.arch}).`,
      )
    }
  }

  /** Build or validate the install closure that feeds the App Bundle. */
  async ensureClosure(): Promise<void> {
    const nodeBin = join(this.closureDir, 'node', 'bin', 'node')
    const cliBin = join(this.closureDir, 'dsh', CLI_BIN)
    const pnpmShim = join(this.closureDir, 'pnpm', 'bin', 'pnpm')
    const ready = existsSync(nodeBin) && existsSync(cliBin) && existsSync(pnpmShim)
    if (this.cli.skipClosure) {
      if (!ready) {
        throw new Error(
          `package-macos-desktop: --skip-closure requires ${this.closureDir} with node/, dsh/, and pnpm/bin/pnpm `
          + '(run pnpm run build:macos-desktop-closure first).',
        )
      }
      console.log(`package-macos-desktop: using existing closure at ${this.closureDir}`)
      return
    }
    if (ready) {
      console.log(`package-macos-desktop: using existing closure at ${this.closureDir}`)
      return
    }
    await this.run('build closure', process.execPath, [
      '--import',
      'tsx',
      join(root, 'scripts', 'build-macos-desktop-closure.ts'),
      `--out-dir=${this.cli.closureDir}`,
    ])
  }

  /**
   * Release-build the Tauri shell unless `--browser-launcher` or `--skip-shell`.
   * @returns absolute path of the `Contents/MacOS` executable to install.
   */
  async ensureShellBinary(): Promise<string> {
    if (this.cli.browserLauncher) {
      const fallback = join(PACKAGING_DIR, 'launcher-browser', EXECUTABLE_NAME)
      if (!existsSync(fallback)) {
        throw new Error(`package-macos-desktop: browser launcher missing at ${fallback}`)
      }
      console.log(`package-macos-desktop: using browser-launcher fallback at ${fallback}`)
      return fallback
    }
    const releaseBin = join(SHELL_DIR, 'target', 'release', EXECUTABLE_NAME)
    if (this.cli.skipShell) {
      if (!existsSync(releaseBin)) {
        throw new Error(
          `package-macos-desktop: --skip-shell requires ${releaseBin} `
          + '(run: cargo build --release --manifest-path packaging/macos/shell/src-tauri/Cargo.toml).',
        )
      }
      console.log(`package-macos-desktop: using existing shell binary at ${releaseBin}`)
      return releaseBin
    }
    await this.run('cargo build --release (Tauri shell)', 'cargo', [
      'build',
      '--release',
      '--manifest-path',
      join(SHELL_DIR, 'Cargo.toml'),
    ])
    if (!this.cli.dryRun && !existsSync(releaseBin)) {
      throw new Error(`package-macos-desktop: cargo did not produce ${releaseBin}`)
    }
    return releaseBin
  }

  /** Materialize `DeepSeek Harness.app` from the closure + packaging templates. */
  async assembleApp(shellBinary: string): Promise<void> {
    const contents = join(this.appBundle, 'Contents')
    const macos = join(contents, 'MacOS')
    const resources = join(contents, 'Resources')
    if (this.cli.dryRun) {
      console.log(`package-macos-desktop: [dry-run] rm -rf ${this.appBundle}`)
      console.log(`package-macos-desktop: [dry-run] assemble ${this.appBundle}`)
      console.log(`package-macos-desktop: [dry-run] MacOS/${EXECUTABLE_NAME} <- ${shellBinary}`)
      console.log(`package-macos-desktop: [dry-run] Resources/AppIcon.icns <- ${join(PACKAGING_DIR, 'icon', 'AppIcon.icns')}`)
      return
    }
    await rm(this.appBundle, { recursive: true, force: true })
    await mkdir(macos, { recursive: true })
    await mkdir(join(resources, 'bin'), { recursive: true })

    const plistTemplate = await readFile(join(PACKAGING_DIR, 'Info.plist'), 'utf8')
    const version = await this.readCliVersion()
    const plist = plistTemplate
      .replaceAll('<string>0.1.0</string>', `<string>${version}</string>`)
    await writeFile(join(contents, 'Info.plist'), plist)

    const launcherDst = join(macos, EXECUTABLE_NAME)
    await cp(shellBinary, launcherDst)
    await chmod(launcherDst, 0o755)

    const appIcon = join(PACKAGING_DIR, 'icon', 'AppIcon.icns')
    if (!existsSync(appIcon)) {
      throw new Error(
        `package-macos-desktop: App icon missing at ${appIcon} `
        + '(rebuild from packaging/macos/icon/icon-1024.png via iconutil; see packaging/macos/README.md).',
      )
    }
    await cp(appIcon, join(resources, 'AppIcon.icns'))

    await cp(join(this.closureDir, 'node'), join(resources, 'node'), { recursive: true })
    await cp(join(this.closureDir, 'dsh'), join(resources, 'dsh'), { recursive: true })
    await cp(join(this.closureDir, 'pnpm'), join(resources, 'pnpm'), { recursive: true })
    await cp(join(this.closureDir, 'bin', 'dsh'), join(resources, 'bin', 'dsh'))
    await chmod(join(resources, 'bin', 'dsh'), 0o755)
    await chmod(join(resources, 'pnpm', 'bin', 'pnpm'), 0o755)
    await chmod(join(resources, 'node', 'bin', 'node'), 0o755)
  }

  /** Ad-hoc codesign the App Bundle (`codesign --sign -`). */
  async codesign(): Promise<void> {
    if (this.cli.skipSign) {
      console.log('package-macos-desktop: skipping codesign (--skip-sign)')
      return
    }
    await this.run('ad-hoc codesign', 'codesign', [
      '--force',
      '--deep',
      '--sign',
      '-',
      this.appBundle,
    ])
  }

  /** Build a compressed DMG with the `.app` and an Applications symlink. */
  async createDmg(): Promise<void> {
    if (this.cli.skipDmg) {
      console.log('package-macos-desktop: skipping DMG (--skip-dmg)')
      return
    }
    const staging = join(this.closureDir, '.dmg-staging')
    if (this.cli.dryRun) {
      console.log(`package-macos-desktop: [dry-run] hdiutil create -format ${this.cli.dmgFormat} ${this.dmgPath}`)
      return
    }
    await rm(staging, { recursive: true, force: true })
    await rm(this.dmgPath, { force: true })
    await mkdir(staging, { recursive: true })
    await cp(this.appBundle, join(staging, `${APP_NAME}.app`), { recursive: true })
    await this.run('Applications symlink', 'ln', ['-s', '/Applications', join(staging, 'Applications')])
    await this.run('create DMG', 'hdiutil', [
      'create',
      '-volname',
      APP_NAME,
      '-srcfolder',
      staging,
      '-ov',
      '-format',
      this.cli.dmgFormat,
      this.dmgPath,
    ])
    await rm(staging, { recursive: true, force: true })
  }

  /**
   * Compress the `.app` as `.tar.xz` for CI upload. Often smaller than the DMG
   * and avoids double-storing the uncompressed tree in the artifact set alone.
   */
  async createTarXz(): Promise<void> {
    if (this.cli.skipTarXz) {
      console.log('package-macos-desktop: skipping tar.xz (--skip-tar-xz)')
      return
    }
    if (this.cli.dryRun) {
      console.log(`package-macos-desktop: [dry-run] tar -cJf ${this.tarXzPath} ${APP_NAME}.app`)
      return
    }
    await rm(this.tarXzPath, { force: true })
    await this.run('create tar.xz', 'tar', [
      '-cJf',
      this.tarXzPath,
      '-C',
      this.closureDir,
      `${APP_NAME}.app`,
    ])
  }

  /** Verify codesign, MacOS binary kind, and that the PATH wrapper still works. */
  async smoke(): Promise<void> {
    if (this.cli.skipSmoke) {
      console.log('package-macos-desktop: skipping smoke (--skip-smoke)')
      return
    }
    if (this.cli.dryRun) {
      console.log('package-macos-desktop: [dry-run] smoke codesign + wrapper + MacOS binary')
      return
    }
    if (!this.cli.skipSign) {
      await this.run('codesign verify', 'codesign', ['--verify', '--verbose=2', this.appBundle])
      await this.run('codesign display', 'codesign', ['-dv', '--verbose=2', this.appBundle])
    }
    const macosBin = join(this.appBundle, 'Contents', 'MacOS', EXECUTABLE_NAME)
    await this.run('smoke MacOS binary file(1)', 'file', [macosBin])
    if (!this.cli.browserLauncher) {
      await this.run('smoke MacOS binary is Mach-O', '/bin/zsh', [
        '-c',
        `file ${JSON.stringify(macosBin)} | grep -q 'Mach-O 64-bit executable arm64'`,
      ])
    }
    const appIcon = join(this.appBundle, 'Contents', 'Resources', 'AppIcon.icns')
    await this.run('smoke AppIcon.icns present', '/bin/zsh', [
      '-c',
      `test -f ${JSON.stringify(appIcon)} && file ${JSON.stringify(appIcon)} | grep -q 'Mac OS X icon'`,
    ])
    const packIcns = join(PACKAGING_DIR, 'icon', 'pack_icns.py')
    await this.run('smoke AppIcon.icns Dock OSTypes', 'python3', [packIcns, 'verify', appIcon])
    await this.run('smoke CFBundleIconFile', '/bin/zsh', [
      '-c',
      `defaults read ${JSON.stringify(join(this.appBundle, 'Contents', 'Info'))} CFBundleIconFile | grep -qx AppIcon`,
    ])
    const wrapper = join(this.closureDir, 'bin', 'dsh')
    const resourcesWrapper = join(this.appBundle, 'Contents', 'Resources', 'bin', 'dsh')
    await this.run('smoke closure wrapper web --help', wrapper, ['web', '--help'])
    await this.run('smoke app Resources wrapper web --help', resourcesWrapper, ['web', '--help'])
    const expectedPnpm = join(this.closureDir, 'pnpm', 'bin', 'pnpm')
    await this.run('smoke which pnpm via wrapper env', '/bin/zsh', [
      '-c',
      [
        `export PATH=${JSON.stringify(`${join(this.closureDir, 'pnpm', 'bin')}:${join(this.closureDir, 'node', 'bin')}:/usr/bin:/bin`)}`,
        'command -v pnpm',
        'pnpm --version',
        `expected=${JSON.stringify(expectedPnpm)}`,
        'resolved="$(command -v pnpm)"',
        'if [ "$resolved" != "$expected" ]; then echo "expected $expected, got $resolved" >&2; exit 1; fi',
      ].join(' && '),
    ])
  }

  /** Print product paths and shell vs runtime-closure sizes. */
  printSummary(shellBinary: string): void {
    console.log(this.cli.dryRun ? 'package-macos-desktop: [dry-run] would produce:' : 'package-macos-desktop: products:')
    console.log(`  ${this.appBundle}`)
    if (!this.cli.skipDmg) console.log(`  ${this.dmgPath}  (format ${this.cli.dmgFormat})`)
    if (!this.cli.skipTarXz) console.log(`  ${this.tarXzPath}`)
    if (this.cli.dryRun) return
    if (existsSync(shellBinary)) {
      const shellMb = statSync(shellBinary).size / (1024 * 1024)
      console.log(`  shell binary (${shellMb.toFixed(2)} MB)  ${shellBinary}`)
    }
    if (existsSync(this.appBundle)) {
      const macosBin = join(this.appBundle, 'Contents', 'MacOS', EXECUTABLE_NAME)
      if (existsSync(macosBin)) {
        const installedMb = statSync(macosBin).size / (1024 * 1024)
        console.log(`  MacOS/${EXECUTABLE_NAME} (${installedMb.toFixed(2)} MB)`)
      }
      try {
        const appSize = execFileSync('du', ['-sh', this.appBundle], { encoding: 'utf8' }).trim().split(/\s+/, 1)[0]
        console.log(`  app bundle   ${appSize}`)
      } catch {
        console.log('  app bundle present (du -sh for total; runtime closure dominates)')
      }
      const resources = join(this.appBundle, 'Contents', 'Resources')
      for (const name of ['node', 'dsh', 'pnpm'] as const) {
        const path = join(resources, name)
        if (!existsSync(path)) continue
        try {
          const size = execFileSync('du', ['-sh', path], { encoding: 'utf8' }).trim().split(/\s+/, 1)[0]
          console.log(`  Resources/${name}  ${size}`)
        } catch {
          // Size reporting must not fail the build.
        }
      }
    }
    if (existsSync(this.dmgPath)) {
      const megabytes = statSync(this.dmgPath).size / (1024 * 1024)
      console.log(`  dmg          (${megabytes.toFixed(1)} MB)`)
    }
    if (existsSync(this.tarXzPath)) {
      const megabytes = statSync(this.tarXzPath).size / (1024 * 1024)
      console.log(`  tar.xz       (${megabytes.toFixed(1)} MB)`)
    }
  }

  /** Read the published CLI version for Info.plist. */
  private async readCliVersion(): Promise<string> {
    const manifestPath = join(root, 'apps', 'cli', 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { version?: string }
    const version = manifest.version?.trim()
    if (version === undefined || version.length === 0) {
      throw new Error('package-macos-desktop: apps/cli/package.json has no version')
    }
    return version
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
      console.log(`package-macos-desktop: [dry-run] ${printable}`)
      return
    }
    console.log(`package-macos-desktop: ${label}: ${printable}`)
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(command, args, {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, CI: 'true' },
      })
      child.once('error', (error) => {
        reject(new Error(`package-macos-desktop: ${label} failed to spawn: ${error.message} (${printable})`))
      })
      child.once('exit', (code, signal) => {
        if (code === 0) {
          resolvePromise()
          return
        }
        const cause = code === null ? `signal ${signal ?? 'unknown'}` : `exit code ${code}`
        reject(new Error(`package-macos-desktop: ${label} failed (${cause}): ${printable}`))
      })
    })
  }
}

async function main(): Promise<void> {
  const cli = PackageCli.parse(process.argv.slice(2))
  const pipeline = new MacosDesktopPackage(cli)
  console.log(`package-macos-desktop: closure-dir: ${pipeline.closureDir}`)
  pipeline.assertHost()
  if (pipeline.closureDir === root || root.startsWith(pipeline.closureDir + sep)) {
    throw new Error(`package-macos-desktop: refusing closure-dir ${pipeline.closureDir}: it contains the repo root.`)
  }
  await pipeline.ensureClosure()
  const shellBinary = await pipeline.ensureShellBinary()
  await pipeline.assembleApp(shellBinary)
  await pipeline.codesign()
  await pipeline.createDmg()
  await pipeline.createTarXz()
  await pipeline.smoke()
  pipeline.printSummary(shellBinary)
}

await main()
