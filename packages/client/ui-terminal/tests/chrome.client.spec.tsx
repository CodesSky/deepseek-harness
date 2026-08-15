/**
 * Terminal chrome / utilities clusters: brand lock + icon button.
 * Hero overlay hides on live sessions; utilities seat hides on blank sessions.
 */
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { TerminalAction } from '../src/client/TerminalAction.tsx'
import { TerminalChrome } from '../src/client/TerminalChrome.tsx'
import { createTerminalPanelStore, type TerminalPanelState } from '../src/client/store.ts'
import { zh, type TerminalKey } from '../src/client/locales.ts'

afterEach(cleanup)

/** Bind a store instance to the SnapshotSelectorHook seat without pulling web-react. */
function bindStore(
  store: ReturnType<ReturnType<typeof createTerminalPanelStore>['create']>,
): SnapshotSelectorHook<TerminalPanelState> {
  return selector => useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()))
}

const unused = (() => { throw new Error('unused') }) as never
const t = (key: string) => zh[key as TerminalKey]

describe('TerminalChrome', () => {
  it('renders brand lock left of the Terminal icon on the hero and hides for a live session', () => {
    const store = createTerminalPanelStore().create()
    const { rerender } = render(
      <TerminalChrome
        useStore={bindStore(store)}
        actions={store.actions}
        useSessions={selector => selector({
          current: undefined,
          byId: {},
        } as never)}
        useWorkspaces={unused}
        t={t}
      />,
    )
    const cluster = screen.getByTestId('terminal-chrome-cluster')
    const button = screen.getByTestId('terminal-chrome-action')
    expect(cluster.contains(button)).toBe(true)
    expect(cluster.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2)
    expect(button.getAttribute('aria-label')).toBe(zh['action.open'])
    expect(button.textContent).toBe('')
    expect(button.querySelector('svg')).not.toBeNull()
    // Brand precedes the Terminal button in DOM order (left of the icon).
    expect(cluster.firstElementChild).not.toBe(button)

    rerender(
      <TerminalChrome
        useStore={bindStore(store)}
        actions={store.actions}
        useSessions={selector => selector({
          current: 's1',
          byId: { s1: { blank: false } },
        } as never)}
        useWorkspaces={unused}
        t={t}
      />,
    )
    expect(screen.queryByTestId('terminal-chrome-action')).toBeNull()
    expect(screen.queryByTestId('terminal-chrome-cluster')).toBeNull()
  })
})

describe('TerminalAction utilities seat', () => {
  it('renders brand lock left of Terminal beside Session log on live sessions', () => {
    const toggleDock = vi.fn()
    const { rerender } = render(
      <TerminalAction
        sessionId={'s1' as never}
        toggleDock={toggleDock}
        useSession={selector => selector({ blank: true } as never)}
        useSessions={unused}
        useWorkspaces={unused}
        useProjection={unused}
        useInput={unused}
        inputActions={unused}
        t={t}
      />,
    )
    expect(screen.queryByTestId('terminal-chrome-action')).toBeNull()

    rerender(
      <TerminalAction
        sessionId={'s1' as never}
        toggleDock={toggleDock}
        useSession={selector => selector({ blank: false } as never)}
        useSessions={unused}
        useWorkspaces={unused}
        useProjection={unused}
        useInput={unused}
        inputActions={unused}
        t={t}
      />,
    )
    const cluster = screen.getByTestId('terminal-chrome-cluster')
    const button = screen.getByTestId('terminal-chrome-action')
    expect(cluster.contains(button)).toBe(true)
    expect(cluster.firstElementChild).not.toBe(button)
    expect(button.getAttribute('aria-label')).toBe(zh['action.open'])
    expect(button.querySelector('svg')).not.toBeNull()
    button.click()
    expect(toggleDock).toHaveBeenCalledOnce()
  })
})
