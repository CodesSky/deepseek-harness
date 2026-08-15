/** Sidebar shell style contracts shared with its slot-owned controls. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SidebarRoot.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('SidebarRoot.module.css', () => {
  it('shares and cancels the wide shell trailing padding structurally', () => {
    const root = declarations('.root')
    expect(root?.get('--dsh-sidebar-inline-padding')).toBe('12px')
    expect(root?.get('padding')).toBe('6px var(--dsh-sidebar-inline-padding)')
    expect(declarations('.regionArea')?.get('margin-left')).toBe('-4px')
    expect(declarations('.regionArea')?.get('padding-left')).toBe('4px')
    expect(declarations('.regionArea')?.get('margin-right')).toBe(
      'calc(-1 * var(--dsh-sidebar-inline-padding))',
    )
    expect(declarations('.collapsed .regionArea')?.get('display')).toBe('none')
    expect(declarations('.collapsed .footArea')?.get('display')).toBe('none')
  })

  it('fades fixed chrome in after a live collapse settle', () => {
    const animation = 'chrome-in 150ms var(--ds-ease-in-out) backwards'
    expect(declarations('.chromeIn .toggle')?.get('animation')).toBe(animation)
    expect(declarations('.chromeIn .collapsedNewSession')?.get('animation')).toBe(animation)
    expect(css).toMatch(/@keyframes chrome-in\s*\{\s*from\s*\{\s*opacity: 0;\s*}\s*}/)
  })

  it('pins the panel toggle beside traffic lights under the macOS overlay dataset', () => {
    const desktop = ":global(html[data-dsh-desktop='macos']:not([data-dsh-fullscreen]))"
    const desktopToggle = declarations(`${desktop} .toggle`)
    expect(desktopToggle?.get('position')).toBe('fixed')
    expect(desktopToggle?.get('top')).toBe('12px')
    expect(desktopToggle?.get('left')).toBe('80px')
    expect(desktopToggle?.get('z-index')).toBe('30')
    expect(desktopToggle?.get('width')).toBe('28px')
    expect(desktopToggle?.get('height')).toBe('28px')
    expect(declarations(`${desktop} .toggle .panelIcon`)?.get('width')).toBe('16px')
    expect(declarations(`${desktop} .toggle .panelIcon`)?.get('height')).toBe('16px')
    expect(declarations(`${desktop} .collapsed .toggle`)?.get('left')).toBe('80px')
    expect(declarations(`${desktop} .collapsed .collapsedNewSession`)?.get('left')).toBe('116px')
    expect(declarations(`${desktop} .fading .toggle`)?.get('left')).toBe('80px')
    expect(declarations(`${desktop} .chromeIn .toggle`)?.get('animation')).toBe('none')
    expect(css).not.toMatch(/canOpenPath/)
    expect(css).not.toMatch(/78px/)
  })

  it('pins collapsed chrome top-left on every channel and keeps logoRow visible during fade', () => {
    expect(declarations('.fading .toggle')?.get('position')).toBe('fixed')
    expect(declarations('.fading .toggle')?.get('left')).toBe('12px')
    expect(declarations('.collapsed .toggle')?.get('position')).toBe('fixed')
    expect(declarations('.collapsed .toggle')?.get('left')).toBe('12px')
    expect(declarations('.collapsed .collapsedNewSession')?.get('position')).toBe('fixed')
    expect(declarations('.collapsed .collapsedNewSession')?.get('left')).toBe('48px')
    expect(declarations('.fading > .logoRow')?.get('opacity')).toBe('1')
  })

  it('keeps the logoRow drag spacer on the traffic-light mid-line', () => {
    // root pad 6 + height 40 / 2 = 26, matching TRAFFIC_LIGHT_Y=28 painted mid-line.
    expect(declarations('.logoRow')?.get('height')).toBe('40px')
    expect(declarations('.logoRow')?.get('padding')).toBe('0 0 0 4px')
    expect(declarations('.logoRow')?.get('align-items')).toBe('center')
    // Fixed macOS toggle escapes the row; hidden would clip it.
    expect(declarations('.logoRow')?.get('overflow')).toBe('visible')
  })

  it('clears the collapsed column fill so no rail seam remains', () => {
    expect(declarations('.root.collapsed')?.get('padding')).toBe('0')
    expect(declarations('.root.collapsed')?.get('background')).toBe('transparent')
  })
})
