// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {
  SidebarFooterActionOwnerProps, SidebarRootComponentProps, SidebarSectionOwnerProps,
  SidebarSettingsOwnerProps,
} from '../src/client/contract/slots.ts'
import { SidebarRoot } from '../src/client/SidebarRoot.tsx'
import { en } from '../src/client/locales.ts'

// English-dictionary translate stub: the shell renders the same copy the
// assertions below query by accessible name.
const t: SidebarRootComponentProps['t'] = key => (en as Record<string, string>)[key] ?? key

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// The shell never reads the global hooks itself, but they ride the standard
// props share; stub them as never-called functions.
const neverHook = (() => { throw new Error('shell must not read global hooks') }) as never

function mountShell({ collapsed = false, width = 300 }: { collapsed?: boolean; width?: number } = {}) {
  const startSession = vi.fn()
  const toggleSidebar = vi.fn()
  let regionOwner: SidebarSectionOwnerProps | undefined
  let settingsOwner: SidebarSettingsOwnerProps | undefined
  let footerActionOwner: SidebarFooterActionOwnerProps | undefined
  let current = { collapsed, width }
  const root = () => (
    <SidebarRoot
      collapsed={current.collapsed} width={current.width}
      useSessions={neverHook} useWorkspaces={neverHook}
      startSession={startSession} toggleSidebar={toggleSidebar} t={t}
      renderSlot={((
        key: string,
        owner: SidebarFooterActionOwnerProps | SidebarSectionOwnerProps | SidebarSettingsOwnerProps,
      ) => {
        if (key === 'sidebar.settings') {
          settingsOwner = owner
          return <div data-testid="settings-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.footer.action') {
          footerActionOwner = owner
          return <div data-testid="footer-action-seat" data-wide={owner.wide} />
        }
        regionOwner = owner as SidebarSectionOwnerProps
        return <div data-testid="region" data-wide={owner.wide} />
      }) as SidebarRootComponentProps['renderSlot']}
    />
  )
  const view = render(root())
  return {
    startSession,
    toggleSidebar,
    regionOwner: () => {
      if (regionOwner === undefined) throw new Error('region owner not rendered')
      return regionOwner
    },
    settingsOwner: () => {
      if (settingsOwner === undefined) throw new Error('settings owner not rendered')
      return settingsOwner
    },
    footerActionOwner: () => {
      if (footerActionOwner === undefined) throw new Error('footer action owner not rendered')
      return footerActionOwner
    },
    rerender(next: Partial<typeof current>) {
      current = { ...current, ...next }
      view.rerender(root())
    },
  }
}

describe('SidebarRoot shell', () => {
  it('expanded paints the toggle, New Session capsule, and seat regions (no empty column)', () => {
    const b = mountShell()
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'New session' })).toHaveLength(1)
    expect(screen.getByTestId('region').getAttribute('data-wide')).toBe('true')
    expect(screen.getByTestId('settings-seat').getAttribute('data-wide')).toBe('true')
    expect(screen.getByTestId('footer-action-seat').getAttribute('data-wide')).toBe('true')
    expect(b.regionOwner().wide).toBe(true)
  })

  it('routes New Session (capsule) and the column toggle', () => {
    const b = mountShell()
    // Expanded, only the capsule starts a session (brand lock moved to Terminal chrome).
    const starters = screen.getAllByRole('button', { name: 'New session' })
    expect(starters).toHaveLength(1)
    fireEvent.click(starters[0]!)
    expect(b.startSession).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('collapsed keeps the panel toggle visible as top-bar chrome', () => {
    mountShell({ collapsed: true, width: 0 })
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New session' })).toBeTruthy()
  })

  it('hands the region its wide flag and clamps expandSidebar to the collapsed state', () => {
    const b = mountShell()
    expect(b.regionOwner().wide).toBe(true)
    // The settings seat rides the same wide flag (ui-settings renders the row).
    expect(b.settingsOwner().wide).toBe(true)
    expect(b.footerActionOwner().wide).toBe(true)
    // Expanded: the request is a no-op (no accidental collapse).
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).not.toHaveBeenCalled()
  })

  it('keeps the region mounted through collapse and expands on its request', () => {
    vi.useFakeTimers()
    const b = mountShell()
    b.rerender({ collapsed: true })
    // Wide content survives the crossfade window, then settles into hidden chrome.
    expect(b.regionOwner().wide).toBe(true)
    vi.advanceTimersByTime(200)
    b.rerender({})
    expect(b.regionOwner().wide).toBe(false)
    expect(b.footerActionOwner().wide).toBe(false)
    expect(screen.getByTestId('region')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New session' })).toBeTruthy()
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('marks the logo row as desktop drag chrome without a Tauri drag region in the browser', () => {
    mountShell()
    const row = screen.getByRole('button', { name: 'Collapse sidebar' }).parentElement
    expect(row?.getAttribute('data-dsh-drag-chrome')).toBe('deep')
    expect(row?.hasAttribute('data-tauri-drag-region')).toBe(false)
    expect(document.documentElement.dataset.dshDesktop).toBeUndefined()
  })

  it('keeps the toggle clickable when the macOS desktop dataset is present', () => {
    document.documentElement.dataset.dshDesktop = 'macos'
    try {
      const b = mountShell()
      fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
      expect(b.toggleSidebar).toHaveBeenCalledOnce()
    } finally {
      delete document.documentElement.dataset.dshDesktop
    }
  })

  it('swaps collapse vs expand panel glyphs with the fold state', () => {
    const b = mountShell()
    const collapseBtn = screen.getByRole('button', { name: 'Collapse sidebar' })
    const collapseChevron = collapseBtn.querySelectorAll('path')[1]!.getAttribute('d')
    expect(collapseChevron).toContain('8.39645 8.35355')
    b.rerender({ collapsed: true, width: 0 })
    const expandChevron = screen.getByRole('button', { name: 'Open sidebar' })
      .querySelectorAll('path')[1]!.getAttribute('d')
    expect(expandChevron).toContain('11.6036 8.35355')
    expect(expandChevron).not.toBe(collapseChevron)
  })

  it('renders statically collapsed on a cold start with top-bar New Session', () => {
    const b = mountShell({ collapsed: true, width: 0 })
    expect(b.regionOwner().wide).toBe(false)
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New session' }))
    expect(b.startSession).toHaveBeenCalledOnce()
  })
})
