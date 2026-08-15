// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createTerminalPanelStore } from '../src/client/store.ts'

describe('terminal panel store', () => {
  it('toggles open, tracks tabs, and selects a PTY id', () => {
    const instance = createTerminalPanelStore().create()
    expect(instance.getSnapshot()).toEqual({ open: false, tabs: [], selectedId: undefined })
    instance.actions.open()
    expect(instance.getSnapshot().open).toBe(true)
    instance.actions.upsertTab({ terminalSessionId: 'pty-1', name: 'zsh' })
    expect(instance.getSnapshot()).toMatchObject({
      open: true,
      selectedId: 'pty-1',
      tabs: [{ terminalSessionId: 'pty-1', name: 'zsh' }],
    })
    instance.actions.upsertTab({ terminalSessionId: 'pty-2', name: 'zsh-2' })
    instance.actions.removeTab('pty-2')
    expect(instance.getSnapshot().selectedId).toBe('pty-1')
    instance.actions.removeTab('pty-1')
    expect(instance.getSnapshot()).toEqual({ open: false, tabs: [], selectedId: undefined })
    instance.actions.toggle()
    expect(instance.getSnapshot().open).toBe(true)
  })
})
