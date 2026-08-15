/**
 * Bottom user-shell dock: open success advances past the starting state;
 * Host failures surface an error instead of leaving busy forever.
 * Hide must actually collapse layout; tab switches keep per-tab xterm buffers.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { TerminalDock, type TerminalDockProps } from '../src/client/TerminalDock.tsx'
import { createTerminalPanelStore, type TerminalPanelState } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

/** HTML `hidden` on a per-tab xterm host. */
function hostHidden(sessionId: string): boolean {
  const host = document.querySelector(`[data-terminal-session-id="${sessionId}"]`)
  if (!(host instanceof HTMLElement)) throw new Error(`missing host ${sessionId}`)
  return host.hasAttribute('hidden')
}

const termLifecycle = vi.hoisted(() => ({
  dispose: vi.fn(),
  refresh: vi.fn(),
  fit: vi.fn(),
  focus: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('@xterm/xterm', () => {
  class Terminal {
    cols = 80
    rows = 24
    open(): void {}
    reset(): void {
      termLifecycle.reset()
    }
    write(): void {}
    dispose(): void {
      termLifecycle.dispose()
    }
    refresh(_start: number, _end: number): void {
      termLifecycle.refresh()
    }
    focus(): void {
      termLifecycle.focus()
    }
    onData(): { dispose(): void } {
      return { dispose() {} }
    }
    loadAddon(): void {}
  }
  return { Terminal }
})

vi.mock('@xterm/addon-fit', () => {
  class FitAddon {
    fit(): void {
      termLifecycle.fit()
    }
  }
  return { FitAddon }
})

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

afterEach(cleanup)

beforeEach(() => {
  termLifecycle.dispose.mockClear()
  termLifecycle.refresh.mockClear()
  termLifecycle.fit.mockClear()
  termLifecycle.focus.mockClear()
  termLifecycle.reset.mockClear()
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as typeof ResizeObserver
  }
})

const t = makeTranslate(zh)

/** Bind a store instance to the SnapshotSelectorHook seat without pulling web-react. */
function bindStore(
  store: ReturnType<ReturnType<typeof createTerminalPanelStore>['create']>,
): SnapshotSelectorHook<TerminalPanelState> {
  return selector => useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()))
}

function kit(overrides: Partial<TerminalDockProps> = {}): {
  props: TerminalDockProps
  store: ReturnType<ReturnType<typeof createTerminalPanelStore>['create']>
} {
  const store = createTerminalPanelStore().create()
  store.actions.open()
  const props: TerminalDockProps = {
    useStore: bindStore(store),
    actions: store.actions,
    t: t as TerminalDockProps['t'],
    useSessions: (() => { throw new Error('unused') }) as never,
    useWorkspaces: (() => { throw new Error('unused') }) as never,
    openShell: async () => ({
      ok: true as const,
      terminalSessionId: 'pty-1',
      name: 'zsh-1',
    }),
    list: async () => [],
    attach: async () => ({ ok: true as const }),
    detach: async () => {},
    write: async () => {},
    resize: async () => {},
    closeShell: async () => {},
    onChunk: () => () => {},
    resolveCwd: () => undefined,
    ...overrides,
  }
  return { props, store }
}

function stubHostSize(): void {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return 800 },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() { return 240 },
  })
}

describe('TerminalDock open lifecycle', () => {
  it('upserts a tab after openShell succeeds and leaves the starting copy', async () => {
    const { props, store } = kit()
    render(<TerminalDock {...props} />)
    expect(screen.getByText(zh['dock.opening'])).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByText(zh['dock.opening'])).toBeNull()
      expect(screen.getByRole('tab', { name: /zsh-1/ })).toBeTruthy()
    })
    expect(store.getSnapshot().tabs).toEqual([
      { terminalSessionId: 'pty-1', name: 'zsh-1' },
    ])
  })

  it('shows an error when openShell returns ok:false and clears busy', async () => {
    const { props } = kit({
      openShell: async () => ({ ok: false as const, message: 'Host PTY seam is not mounted' }),
    })
    render(<TerminalDock {...props} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Host PTY seam is not mounted')
      expect(screen.queryByText(zh['dock.opening'])).toBeNull()
    })
  })

  it('shows an error when openShell throws instead of hanging on dock.opening', async () => {
    const { props } = kit({
      openShell: async () => {
        throw new TypeError('api.terminals.open is not a function')
      },
    })
    render(<TerminalDock {...props} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('api.terminals.open is not a function')
      expect(screen.queryByText(zh['dock.opening'])).toBeNull()
    })
  })

  it('renders the dock as in-flow chrome without inline viewport offsets', () => {
    const { props } = kit()
    render(<TerminalDock {...props} />)
    const dock = screen.getByTestId('terminal-dock')
    // Placement belongs to AppFrame's shell.dock grid row, not fixed left/right/bottom.
    expect(dock.getAttribute('style')).toBeNull()
    expect(dock.parentElement).not.toBeNull()
  })

  it('keeps xterm and attach alive across hide, and refits on reopen', async () => {
    const detach = vi.fn(async () => {})
    const resize = vi.fn(async () => {})
    const { props, store } = kit({ detach, resize })
    stubHostSize()

    render(<TerminalDock {...props} />)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /zsh-1/ })).toBeTruthy()
    })
    await waitFor(() => {
      expect(store.getSnapshot().selectedId).toBe('pty-1')
    })
    // Attach settles asynchronously after selectedId lands.
    await waitFor(() => {
      expect(resize).toHaveBeenCalled()
    })

    termLifecycle.dispose.mockClear()
    termLifecycle.fit.mockClear()
    termLifecycle.refresh.mockClear()
    resize.mockClear()
    detach.mockClear()

    store.actions.close()
    await waitFor(() => {
      const dock = screen.getByTestId('terminal-dock')
      expect(dock.hidden).toBe(true)
      expect(dock.getAttribute('data-open')).toBe('false')
    })
    expect(detach).not.toHaveBeenCalled()
    expect(termLifecycle.dispose).not.toHaveBeenCalled()

    store.actions.open()
    await waitFor(() => {
      const dock = screen.getByTestId('terminal-dock')
      expect(dock.hidden).toBe(false)
      expect(dock.getAttribute('data-open')).toBe('true')
    })
    await waitFor(() => {
      expect(termLifecycle.fit).toHaveBeenCalled()
      expect(termLifecycle.refresh).toHaveBeenCalled()
      expect(resize).toHaveBeenCalledWith(
        expect.anything(),
        'pty-1',
        80,
        24,
      )
    })
    expect(detach).not.toHaveBeenCalled()
    expect(termLifecycle.dispose).not.toHaveBeenCalled()
  })

  it('dock × close sets hidden and data-open=false so author display:flex cannot keep the pane visible', async () => {
    const { props, store } = kit()
    stubHostSize()
    render(<TerminalDock {...props} />)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /zsh-1/ })).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('terminal-dock-close'))
    await waitFor(() => {
      const dock = screen.getByTestId('terminal-dock')
      expect(dock.hidden).toBe(true)
      expect(dock.getAttribute('data-open')).toBe('false')
      expect(store.getSnapshot().open).toBe(false)
      expect(store.getSnapshot().tabs).toHaveLength(1)
    })
  })

  it('switches tabs without resetting xterm and mounts one host per tab', async () => {
    let ptySeq = 0
    const detach = vi.fn(async () => {})
    const attach = vi.fn(async () => ({ ok: true as const }))
    const resize = vi.fn(async () => {})
    const { props, store } = kit({
      detach,
      attach,
      resize,
      openShell: async () => {
        ptySeq += 1
        return {
          ok: true as const,
          terminalSessionId: `pty-${ptySeq}`,
          name: `zsh-${ptySeq}`,
        }
      },
    })
    stubHostSize()
    render(<TerminalDock {...props} />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /zsh-1/ })).toBeTruthy()
    })
    await waitFor(() => {
      expect(attach).toHaveBeenCalledWith(expect.anything(), 'pty-1')
    })

    termLifecycle.reset.mockClear()
    fireEvent.click(screen.getByTestId('terminal-dock-new'))
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /zsh-2/ })).toBeTruthy()
    })
    await waitFor(() => {
      expect(store.getSnapshot().selectedId).toBe('pty-2')
      expect(attach).toHaveBeenCalledWith(expect.anything(), 'pty-2')
    })

    const hosts = document.querySelectorAll('[data-terminal-session-id]')
    expect(hosts).toHaveLength(2)
    expect(hostHidden('pty-1')).toBe(true)
    expect(hostHidden('pty-2')).toBe(false)

    termLifecycle.reset.mockClear()
    termLifecycle.fit.mockClear()
    termLifecycle.refresh.mockClear()
    termLifecycle.focus.mockClear()
    fireEvent.click(screen.getByRole('tab', { name: /zsh-1/ }))
    await waitFor(() => {
      expect(store.getSnapshot().selectedId).toBe('pty-1')
      expect(hostHidden('pty-1')).toBe(false)
      expect(hostHidden('pty-2')).toBe(true)
    })
    await waitFor(() => {
      expect(termLifecycle.fit).toHaveBeenCalled()
      expect(termLifecycle.refresh).toHaveBeenCalled()
      expect(termLifecycle.focus).toHaveBeenCalled()
    })
    expect(termLifecycle.reset).not.toHaveBeenCalled()
  })
})
