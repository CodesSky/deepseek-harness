/** AppFrame column style contracts for collapsed sidebar chrome escape. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)), 'utf8')

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

describe('AppFrame.module.css', () => {
  it('lets collapsed zero-width sidebar clip nothing so fixed toggle chrome escapes', () => {
    const collapsed = declarations('.frame[data-sidebar-collapsed] .sidebarCol')
    expect(collapsed?.get('overflow')).toBe('visible')
    expect(collapsed?.get('border-right')).toBe('none')
    expect(collapsed?.get('background')).toBe('transparent')
    expect(declarations('.sidebarCol')?.get('overflow')).toBe('hidden')
  })

  it('publishes collapsed chrome inset for the conversation header to clear', () => {
    expect(declarations('.frame')?.get('--dsh-collapsed-chrome-inset')).toBe('0px')
    expect(declarations('.frame[data-sidebar-collapsed]')?.get('--dsh-collapsed-chrome-inset')).toBe('84px')
    expect(
      declarations(
        ":global(html[data-dsh-desktop='macos']:not([data-dsh-fullscreen])) .frame[data-sidebar-collapsed]",
      )?.get('--dsh-collapsed-chrome-inset'),
    ).toBe('152px')
  })
})
