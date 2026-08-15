/**
 * Session-scoped interactive PTY panel: attach to model-owned PTYs in details.
 * Independent of the bottom user-shell dock store (different slot scope).
 */

import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TerminalPanelActions, TerminalPanelSession } from './contract/slots.ts'
import { NS } from './locales.ts'
import css from './TerminalPanel.module.css'
import '@xterm/xterm/css/xterm.css'

/** Full props for the interactive terminal panel. */
export type TerminalPanelProps =
  & PropsRuntime<'terminal.panel'>
  & PropsLocale<typeof NS>
  & TerminalPanelActions

/**
 * Session-scoped interactive PTY panel mounted in the details column.
 * Lists model-owned PTYs for the current chat session.
 * @param props - runtime, locale, and Host verbs.
 * @returns the panel.
 */
export function TerminalPanel({
  sessionId,
  t,
  list,
  attach,
  detach,
  write,
  resize,
  onChunk,
}: TerminalPanelProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [sessions, setSessions] = useState<TerminalPanelSession[]>([])
  const [error, setError] = useState<string | undefined>()
  const [overrun, setOverrun] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | undefined>(undefined)
  const fitRef = useRef<FitAddon | undefined>(undefined)
  const attachedRef = useRef<string | undefined>(undefined)
  const wireSessionId = String(sessionId)

  useEffect(() => {
    let cancelled = false
    void list(wireSessionId).then((rows) => {
      if (cancelled) return
      setSessions(rows)
      if (selectedId === undefined && rows[0] !== undefined) {
        setSelectedId(rows[0].terminalSessionId)
      }
    }, (failure: unknown) => {
      if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure))
    })
    return () => { cancelled = true }
  }, [list, wireSessionId, selectedId])

  useEffect(() => {
    if (hostRef.current === null) return
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#e6edf3',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const onData = term.onData((data) => {
      const id = attachedRef.current
      if (id === undefined) return
      void write(wireSessionId, id, data)
    })

    const observer = new ResizeObserver(() => {
      fit.fit()
      const id = attachedRef.current
      if (id === undefined) return
      void resize(wireSessionId, id, term.cols, term.rows)
    })
    observer.observe(hostRef.current)

    return () => {
      observer.disconnect()
      onData.dispose()
      term.dispose()
      termRef.current = undefined
      fitRef.current = undefined
    }
  }, [write, resize, wireSessionId])

  useEffect(() => {
    if (selectedId === undefined) return
    let cancelled = false
    const term = termRef.current
    void (async () => {
      const previous = attachedRef.current
      if (previous !== undefined && previous !== selectedId) {
        await detach(wireSessionId, previous)
        attachedRef.current = undefined
      }
      const result = await attach(wireSessionId, selectedId)
      if (cancelled) {
        await detach(wireSessionId, selectedId)
        return
      }
      if (!result.ok) {
        setError(result.message)
        return
      }
      attachedRef.current = selectedId
      setError(undefined)
      setOverrun(false)
      term?.reset()
      fitRef.current?.fit()
      if (term !== undefined) {
        void resize(wireSessionId, selectedId, term.cols, term.rows)
      }
    })()
    return () => {
      cancelled = true
      const id = attachedRef.current
      attachedRef.current = undefined
      if (id !== undefined) void detach(wireSessionId, id)
    }
  }, [selectedId, attach, detach, resize, wireSessionId])

  useEffect(() => {
    return onChunk((chunk) => {
      if (chunk.sessionId !== wireSessionId) return
      if (chunk.terminalSessionId !== attachedRef.current) return
      if (chunk.overrun === true) setOverrun(true)
      const term = termRef.current
      if (term === undefined || chunk.dataBase64.length === 0) return
      const bytes = Uint8Array.from(atob(chunk.dataBase64), c => c.charCodeAt(0))
      term.write(bytes)
    })
  }, [onChunk, wireSessionId])

  return (
    <div className={css.panel} data-testid="terminal-panel">
      <div className={css.toolbar}>
        <span className={css.title}>{t('panel.title')}</span>
        <label>
          <span className="sr-only">{t('panel.select')}</span>
          <select
            className={css.select}
            value={selectedId ?? ''}
            onChange={(event) => {
              setSelectedId(event.target.value || undefined)
            }}
            data-testid="terminal-session-select"
          >
            <option value="">{t('panel.detached')}</option>
            {sessions.map(session => (
              <option key={session.terminalSessionId} value={session.terminalSessionId}>
                {session.name ?? session.terminalSessionId}
                {session.status.kind === 'exited' ? ' (exited)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={css.button}
          onClick={() => {
            void list(wireSessionId).then(setSessions)
          }}
        >
          {t('panel.refresh')}
        </button>
      </div>
      {overrun ? <div className={css.overrun} role="status">{t('panel.overrun')}</div> : null}
      {error !== undefined ? <div className={css.empty} role="alert">{error}</div> : null}
      {sessions.length === 0 && error === undefined
        ? <div className={css.empty}>{t('panel.empty')}</div>
        : null}
      <div
        className={css.termHost}
        ref={hostRef}
        data-testid="terminal-xterm-host"
        hidden={sessions.length === 0 && error === undefined}
      />
    </div>
  )
}
