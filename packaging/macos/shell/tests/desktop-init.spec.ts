/**
 * Behavior of the macOS shell initialization script: desktop dataset, origin
 * guard, drag-region stamping, and fullscreen clearing. The script never
 * ships in `dsh web` / browser-launcher.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

const script = readFileSync(
  fileURLToPath(new URL('../ui/desktop-init.js', import.meta.url)),
  'utf8',
)

/**
 * Run the injected script against one document URL.
 * @param url - document URL the script sees as `location`.
 * @param extras - optional IPC mock and existing chrome markers.
 * @returns the jsdom window after the script runs.
 */
function runScript(
  url: string,
  extras?: { fullscreen?: boolean; chrome?: Array<{ deep?: boolean }> },
): Window & { __TAURI_INTERNALS__?: { invoke: (cmd: string) => Promise<unknown> } } {
  const markers = (extras?.chrome ?? []).map(item =>
    item.deep
      ? '<div data-dsh-drag-chrome="deep"></div>'
      : '<div data-dsh-drag-chrome=""></div>',
  ).join('')
  const dom = new JSDOM(`<!doctype html><html><body>${markers}</body></html>`, { url, runScripts: 'outside-only' })
  const win = dom.window as unknown as Window & {
    __TAURI_INTERNALS__?: { invoke: (cmd: string) => Promise<unknown> }
  }
  win.__TAURI_INTERNALS__ = {
    invoke: (cmd: string) => {
      if (cmd === 'plugin:window|is_fullscreen') return Promise.resolve(extras?.fullscreen === true)
      return Promise.reject(new Error(`unexpected ${cmd}`))
    },
  }
  win.eval(script)
  return win
}

describe('desktop-init.js', () => {
  it('marks 127.0.0.1 as the macOS desktop shell and stamps drag regions', () => {
    const win = runScript('http://127.0.0.1:54321/', { chrome: [{ deep: true }, {}] })
    expect(win.document.documentElement.dataset.dshDesktop).toBe('macos')
    const nodes = [...win.document.querySelectorAll('[data-dsh-drag-chrome]')]
    expect(nodes[0]?.getAttribute('data-tauri-drag-region')).toBe('deep')
    expect(nodes[1]?.getAttribute('data-tauri-drag-region')).toBe('')
  })

  it('leaves a public origin unmarked and without Tauri drag regions', () => {
    const win = runScript('https://example.com/', { chrome: [{ deep: true }] })
    expect(win.document.documentElement.dataset.dshDesktop).toBeUndefined()
    expect(win.document.querySelector('[data-tauri-drag-region]')).toBeNull()
  })

  it('clears drag regions when the window reports fullscreen', async () => {
    const win = runScript('http://127.0.0.1:9/', { chrome: [{ deep: true }], fullscreen: true })
    await Promise.resolve()
    expect(win.document.documentElement.dataset.dshFullscreen).toBe('true')
    expect(win.document.querySelector('[data-tauri-drag-region]')).toBeNull()
  })

  it('does not treat host.describe canOpenPath as a desktop-shell signal', () => {
    expect(script).not.toContain('canOpenPath')
  })
})
