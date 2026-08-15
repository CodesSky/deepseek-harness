/**
 * Guard: Vite seeds `@deepseek-ai/dsh-client-ui-primitives` into the shell
 * static module table. Plugin bundles (ui-sidebar) require icons from that
 * table at runtime — a stale `apps/web/dist` that predates new glyph exports
 * yields React #130 (undefined element) and an empty sidebar column.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DIST_ASSETS = join(dirname(fileURLToPath(import.meta.url)), '../dist/assets')

describe('web frontend static seed', () => {
  it('ships sidebar panel collapse/expand glyphs in the index chunk', () => {
    const index = readdirSync(DIST_ASSETS).find(name => /^index-.*\.js$/.test(name))
    expect(index, 'apps/web/dist must be built (pnpm --filter @deepseek-ai/dsh-web-frontend build)').toBeTypeOf('string')
    const bundle = readFileSync(join(DIST_ASSETS, index!), 'utf8')
    expect(bundle).toContain('IconPanelLeftCollapseOutline16')
    expect(bundle).toContain('IconPanelLeftExpandOutline16')
  })
})
