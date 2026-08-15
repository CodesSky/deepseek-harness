/**
 * Bottom dock: multi-tab interactive user shell over Host terminal.open / attach.
 */

import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { USER_SHELL_SESSION_ID } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { TerminalPanelActions } from './contract/slots.ts'
import type { createTerminalPanelStore } from './store.ts'
import { NS } from './locales.ts'
import css from './TerminalPanel.module.css'
import '@xterm/xterm/css/xterm.css'

/** Full props for the bottom terminal dock. */
export type TerminalDockProps =
  & PropsRuntime<'shell.dock'>
  & PropsLocale<typeof NS>
  & PropsStore<ReturnType<typeof createTerminalPanelStore>>
  & TerminalPanelActions

/** Props for one per-tab xterm host that retains its screen buffer across switches. */
type DockTabViewportProps = {
  /** Registry-minted PTY identity for this tab. */
  terminalSessionId: string
  /** Whether this tab is the selected dock pane. */
  active: boolean
  /** Whether the dock chrome is visible (not merely keep-alive). */
  dockOpen: boolean
  /** Wire session id for Host terminal.* verbs. */
  sessionId: string
  attach: TerminalPanelActions['attach']
  detach: TerminalPanelActions['detach']
  write: TerminalPanelActions['write']
  resize: TerminalPanelActions['resize']
  onChunk: TerminalPanelActions['onChunk']
  /** Surface Host attach failures to the dock chrome. */
  onError: (message: string | undefined) => void
  /** Surface scrollback overrun from mux chunks. */
  onOverrun: () => void
}

const TERM_OPTIONS = {
  convertEol: true,
  cursorBlink: true,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 13,
  theme: {
    background: '#0d1117',
    foreground: '#e6edf3',
    cursor: '#e6edf3',
  },
} as const

/**
 * One tab's xterm viewport. Stays mounted while the tab exists so the screen
 * buffer survives hide and tab switches; `terminal.attach` does not replay
 * scrollback, so resetting or sharing one Terminal across tabs blanks the pane.
 */
function DockTabViewport({
  terminalSessionId,
  active,
  dockOpen,
  sessionId,
  attach,
  detach,
  write,
  resize,
  onChunk,
  onError,
  onOverrun,
}: DockTabViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | undefined>(undefined)
  const fitRef = useRef<FitAddon | undefined>(undefined)
  const attachedRef = useRef(false)
  const activeRef = useRef(active)
  const dockOpenRef = useRef(dockOpen)
  const onErrorRef = useRef(onError)
  const onOverrunRef = useRef(onOverrun)
  activeRef.current = active
  dockOpenRef.current = dockOpen
  onErrorRef.current = onError
  onOverrunRef.current = onOverrun

  useEffect(() => {
    if (hostRef.current === null) return
    const term = new Terminal(TERM_OPTIONS)
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    termRef.current = term
    fitRef.current = fit

    const onData = term.onData((data) => {
      if (!attachedRef.current) return
      void write(sessionId, terminalSessionId, data)
    })

    const observer = new ResizeObserver(() => {
      // Hidden dock or inactive tab hosts report 0×0; fitting then poisons PTY geometry.
      if (!dockOpenRef.current || !activeRef.current) return
      const host = hostRef.current
      if (host === null || host.clientWidth === 0 || host.clientHeight === 0) return
      fit.fit()
      void resize(sessionId, terminalSessionId, term.cols, term.rows)
    })
    observer.observe(hostRef.current)

    return () => {
      observer.disconnect()
      onData.dispose()
      term.dispose()
      termRef.current = undefined
      fitRef.current = undefined
      attachedRef.current = false
    }
  }, [terminalSessionId, write, resize, sessionId])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const term = termRef.current
    const fit = fitRef.current
    void (async () => {
      const result = await attach(sessionId, terminalSessionId)
      if (cancelled) {
        await detach(sessionId, terminalSessionId)
        return
      }
      if (!result.ok) {
        onErrorRef.current(result.message)
        return
      }
      attachedRef.current = true
      onErrorRef.current(undefined)
      // Do not reset: this viewport owns the retained screen for this PTY.
      const reveal = () => {
        const host = hostRef.current
        if (host === null || host.clientWidth === 0 || host.clientHeight === 0) return
        fit?.fit()
        if (term !== undefined) {
          term.refresh(0, Math.max(0, term.rows - 1))
          term.focus()
          void resize(sessionId, terminalSessionId, term.cols, term.rows)
        }
      }
      requestAnimationFrame(reveal)
    })()
    return () => {
      cancelled = true
      attachedRef.current = false
      void detach(sessionId, terminalSessionId)
    }
  }, [active, terminalSessionId, attach, detach, resize, sessionId])

  useEffect(() => {
    return onChunk((chunk) => {
      if (chunk.sessionId !== sessionId) return
      if (chunk.terminalSessionId !== terminalSessionId) return
      if (!attachedRef.current) return
      if (chunk.overrun === true) onOverrunRef.current()
      const term = termRef.current
      if (term === undefined || chunk.dataBase64.length === 0) return
      const bytes = Uint8Array.from(atob(chunk.dataBase64), c => c.charCodeAt(0))
      term.write(bytes)
    })
  }, [onChunk, sessionId, terminalSessionId])

  // Dock reopen or tab re-select: refit the retained buffer without a keystroke.
  useEffect(() => {
    if (!active || !dockOpen) return
    const term = termRef.current
    const fit = fitRef.current
    if (term === undefined || fit === undefined) return
    const frame = requestAnimationFrame(() => {
      const host = hostRef.current
      if (host === null || host.clientWidth === 0 || host.clientHeight === 0) return
      fit.fit()
      term.refresh(0, Math.max(0, term.rows - 1))
      term.focus()
      void resize(sessionId, terminalSessionId, term.cols, term.rows)
    })
    return () => cancelAnimationFrame(frame)
  }, [active, dockOpen, resize, sessionId, terminalSessionId])

  return (
    <div
      className={css.dockTermHost}
      ref={hostRef}
      hidden={!active}
      data-testid={active ? 'terminal-dock-xterm' : undefined}
      data-terminal-session-id={terminalSessionId}
    />
  )
}

/**
 * Independent bottom dock: opens a Host user shell without a chat session.
 * Closing the dock hides it without disposing xterm or killing the PTY while
 * tabs remain; reopen refits geometry so the retained buffer is visible.
 * Each tab owns its own xterm so switching tabs restores that tab's screen
 * without Enter (Host attach does not replay scrollback).
 * @param props - runtime, store, locale, and Host verbs.
 * @returns the dock, or null when closed with no tabs.
 */
export function TerminalDock({
  useStore,
  actions,
  t,
  openShell,
  attach,
  detach,
  write,
  resize,
  closeShell,
  onChunk,
  resolveCwd,
}: TerminalDockProps) {
  const open = useStore(s => s.open)
  const tabs = useStore(s => s.tabs)
  const selectedId = useStore(s => s.selectedId)
  const keepAlive = open || tabs.length > 0
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [overrun, setOverrun] = useState(false)
  const sessionId = USER_SHELL_SESSION_ID

  const ensureShell = async (): Promise<void> => {
    if (tabs.length > 0) return
    setBusy(true)
    setError(undefined)
    try {
      const result = await openShell(resolveCwd())
      if (!result.ok) {
        setError(result.message)
        return
      }
      actions.upsertTab({ terminalSessionId: result.terminalSessionId, name: result.name })
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void ensureShell()
  }, [open])

  if (!keepAlive) return null

  return (
    <div
      className={css.dock}
      data-testid="terminal-dock"
      data-open={open ? 'true' : 'false'}
      hidden={!open}
    >
      <div className={css.dockBar}>
        <span className={css.dockLabel}>{t('panel.title')}</span>
        <div className={css.tabs} role="tablist">
          {tabs.map(tab => (
            <button
              key={tab.terminalSessionId}
              type="button"
              role="tab"
              className={css.tab}
              data-active={tab.terminalSessionId === selectedId ? 'true' : 'false'}
              aria-selected={tab.terminalSessionId === selectedId}
              onClick={() => { actions.select(tab.terminalSessionId) }}
            >
              <span>{tab.name}</span>
              <span
                className={css.tabClose}
                role="presentation"
                onClick={(event) => {
                  event.stopPropagation()
                  void (async () => {
                    await closeShell(sessionId, tab.terminalSessionId)
                    actions.removeTab(tab.terminalSessionId)
                  })()
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className={css.iconButton}
          title={t('action.new')}
          data-testid="terminal-dock-new"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true)
              setError(undefined)
              try {
                const result = await openShell(resolveCwd())
                if (!result.ok) {
                  setError(result.message)
                  return
                }
                actions.upsertTab({
                  terminalSessionId: result.terminalSessionId,
                  name: result.name,
                })
              } catch (failure: unknown) {
                setError(failure instanceof Error ? failure.message : String(failure))
              } finally {
                setBusy(false)
              }
            })()
          }}
        >
          +
        </button>
        <button
          type="button"
          className={css.iconButton}
          title={t('action.close')}
          data-testid="terminal-dock-close"
          onClick={() => { actions.close() }}
        >
          ×
        </button>
      </div>
      {overrun ? <div className={css.overrun} role="status">{t('panel.overrun')}</div> : null}
      {error !== undefined ? <div className={css.empty} role="alert">{error}</div> : null}
      {busy && tabs.length === 0 ? <div className={css.empty}>{t('dock.opening')}</div> : null}
      {!busy && tabs.length === 0 && error === undefined
        ? <div className={css.empty}>{t('dock.empty')}</div>
        : null}
      {tabs.map(tab => (
        <DockTabViewport
          key={tab.terminalSessionId}
          terminalSessionId={tab.terminalSessionId}
          active={tab.terminalSessionId === selectedId}
          dockOpen={open}
          sessionId={sessionId}
          attach={attach}
          detach={detach}
          write={write}
          resize={resize}
          onChunk={onChunk}
          onError={setError}
          onOverrun={() => { setOverrun(true) }}
        />
      ))}
    </div>
  )
}
