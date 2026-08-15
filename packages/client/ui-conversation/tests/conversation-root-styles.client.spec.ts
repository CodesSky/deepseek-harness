/** Conversation column overlay-title-bar style contracts. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/skeleton/ConversationRoot.module.css', import.meta.url)),
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

describe('ConversationRoot.module.css overlay chrome', () => {
  it('hides the header separator under the macOS desktop overlay dataset', () => {
    expect(declarations('.header::after')?.get('background')).toBe('var(--dsw-alias-border-l2)')
    expect(
      declarations(":global(html[data-dsh-desktop='macos']) .header::after")?.get('background'),
    ).toBe('transparent')
  })

  it('shows the hero drag band only on the desktop overlay and not in fullscreen', () => {
    expect(declarations('.desktopDragBand')?.get('display')).toBe('none')
    expect(
      declarations(
        ":global(html[data-dsh-desktop='macos']:not([data-dsh-fullscreen])) .desktopDragBand",
      )?.get('height'),
    ).toBe('52px')
  })

  it('pads the session header so utilities share the traffic-light mid-line', () => {
    // 10 + 32/2 = 26, matching TRAFFIC_LIGHT_Y=28 painted mid-line and sidebar panel toggle.
    expect(declarations('.header')?.get('padding')).toBe('10px 28px 0 20px')
    expect(declarations('.titleRow')?.get('min-height')).toBe('32px')
  })

  it('insets the live header only while the sidebar is collapsed', () => {
    expect(
      declarations(':global([data-sidebar-collapsed]) .header')?.get('padding-left'),
    ).toBe('max(20px, var(--dsh-collapsed-chrome-inset, 0px))')
    expect(declarations('.header')?.get('padding-left')).toBeUndefined()
  })
})
