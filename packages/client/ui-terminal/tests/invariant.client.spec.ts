import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/invariant.ts'

describe('ui-terminal invariant companion', () => {
  it('exports the package companion metadata', () => {
    expect(name).toBe('client-ui-terminal-invariant')
    expect(inject).toEqual(['invariants'])
    expect(typeof apply).toBe('function')
  })
})
