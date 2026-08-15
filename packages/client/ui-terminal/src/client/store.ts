/**
 * Panel visibility, tab list, and selected PTY id for the interactive terminal.
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** One dock tab bound to a Host user-shell PTY. */
export interface TerminalTab {
  /** Registry-minted PTY identity. */
  terminalSessionId: string
  /** Display label (usually the shell name). */
  name: string
}

/** Viewing state shared by chrome, dock, header action, and details panel. */
export interface TerminalPanelState {
  /** Whether the bottom dock should be visible. */
  open: boolean
  /** Open user-shell tabs in dock order. */
  tabs: TerminalTab[]
  /** Currently selected PTY identity, when one is chosen. */
  selectedId: string | undefined
}

/** Complete mutation API for {@link TerminalPanelState}. */
type TerminalPanelActions = {
  open: (draft: TerminalPanelState) => void
  close: (draft: TerminalPanelState) => void
  toggle: (draft: TerminalPanelState) => void
  select: (draft: TerminalPanelState, id: string | undefined) => void
  upsertTab: (draft: TerminalPanelState, tab: TerminalTab) => void
  removeTab: (draft: TerminalPanelState, terminalSessionId: string) => void
}

/**
 * Create the terminal panel store handle.
 * @returns store handle declared at slot registration.
 */
export function createTerminalPanelStore(): EngineStoreHandle<TerminalPanelState, TerminalPanelActions> {
  return defineStore({
    init: (): TerminalPanelState => ({ open: false, tabs: [], selectedId: undefined }),
    actions: {
      open: (d) => { d.open = true },
      close: (d) => { d.open = false },
      toggle: (d) => { d.open = !d.open },
      select: (d, id: string | undefined) => { d.selectedId = id },
      upsertTab: (d, tab: TerminalTab) => {
        const index = d.tabs.findIndex(row => row.terminalSessionId === tab.terminalSessionId)
        if (index >= 0) d.tabs[index] = tab
        else d.tabs.push(tab)
        d.selectedId = tab.terminalSessionId
        d.open = true
      },
      removeTab: (d, terminalSessionId: string) => {
        d.tabs = d.tabs.filter(row => row.terminalSessionId !== terminalSessionId)
        if (d.selectedId === terminalSessionId) {
          d.selectedId = d.tabs[d.tabs.length - 1]?.terminalSessionId
        }
        if (d.tabs.length === 0) d.open = false
      },
    },
  })
}
