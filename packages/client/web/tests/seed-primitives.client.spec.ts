/**
 * Shell static module table must re-export every ui-primitives value plugins
 * `require()` — including glyphs only referenced from plugin bundles.
 */
import { describe, expect, it } from 'vitest'
import * as UiPrimitives from '@deepseek-ai/dsh-client-ui-primitives'
import { getStaticModules } from '../src/seed.ts'

describe('getStaticModules ui-primitives', () => {
  it('exposes directional panel glyphs used by the sidebar toggle', () => {
    const seeded = getStaticModules()['@deepseek-ai/dsh-client-ui-primitives'] as typeof UiPrimitives
    expect(seeded.IconPanelLeftCollapseOutline16).toBeTypeOf('function')
    expect(seeded.IconPanelLeftExpandOutline16).toBeTypeOf('function')
    expect(seeded.IconPanelLeftCollapseOutline16).toBe(UiPrimitives.IconPanelLeftCollapseOutline16)
    expect(seeded.IconPanelLeftExpandOutline16).toBe(UiPrimitives.IconPanelLeftExpandOutline16)
  })
})
