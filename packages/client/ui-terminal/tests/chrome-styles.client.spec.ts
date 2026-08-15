/** Terminal chrome geometry: brand+Terminal cluster shares the traffic-light mid-line. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/TerminalPanel.module.css', import.meta.url)),
  'utf8',
)

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

describe('TerminalPanel.module.css chrome geometry', () => {
  it('fixes the hero chrome cluster on the traffic-light mid-line', () => {
    // top 10 + 32/2 = 26, matching TRAFFIC_LIGHT_Y=28 painted mid-line and sidebar panel toggle.
    expect(declarations('.chromeCluster')?.get('position')).toBe('fixed')
    expect(declarations('.chromeCluster')?.get('top')).toBe('10px')
    expect(declarations('.chrome')?.get('height')).toBe('32px')
  })

  it('matches sidebar iconButton circular hover chrome', () => {
    const chrome = declarations('.chrome')
    expect(chrome?.get('border-radius')).toBe('50%')
    expect(chrome?.get('background')).toBe('transparent')
    expect(chrome?.get('border')).toBe('none')
    expect(declarations('.chrome:hover')?.get('background')).toBe(
      'var(--dsw-alias-interactive-bg-hover)',
    )
    expect(declarations('.chromeUtility:hover')?.get('background')).toBe(
      'var(--dsw-alias-interactive-bg-hover)',
    )
  })
})
