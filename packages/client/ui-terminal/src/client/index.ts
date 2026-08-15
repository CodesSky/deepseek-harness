/**
 * Interactive terminal panel plugin, browser half: chrome + bottom dock over
 * Host terminal.open / attach, plus optional details-column model-PTY panel.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
// Type-only: pulls locale, conversation header seat, and layout service merges.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { TerminalPanelActions } from './contract/slots.ts'
import { TerminalAction } from './TerminalAction.tsx'
import { TerminalChrome } from './TerminalChrome.tsx'
import { TerminalDock } from './TerminalDock.tsx'
import { TerminalPanel } from './TerminalPanel.tsx'
import { TerminalUiController } from './service.ts'
import { createTerminalPanelStore } from './store.ts'
import { en, NS, zh, type TerminalKey } from './locales.ts'

export type { TerminalPanelActions, TerminalPanelSession } from './contract/slots.ts'
export type { TerminalKey } from './locales.ts'
export type { ITerminalUi } from './service.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Cross-plugin dock open/close face for the interactive terminal. */
    terminalUi: import('./service.ts').ITerminalUi
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Interactive terminal panel copy. */
    terminal: TerminalKey
  }
}

/** Required services for locale, slots, sessions, and the wire API. */
export const inject = ['slots', 'sessions', 'locale', 'connection']

/**
 * Client plugin body: register dictionaries, shared store, chrome, dock, and panel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-terminal: dictionaries')

  const store = createTerminalPanelStore()
  const terminalUi = new TerminalUiController()
  ctx.effect(() => {
    const dispose = ctx.reflect.provide('terminalUi', terminalUi)
    return () => { void dispose() }
  }, 'ui-terminal: terminalUi service')

  const connection = ctx.get('connection') as { api: IApiClient }
  const api = connection.api

  const hostActions = (): TerminalPanelActions => ({
    openShell: async (cwd) => {
      const { result } = await api.terminals.open({
        ...cwd !== undefined ? { cwd } : {},
      })
      if (!result.ok) return { ok: false as const, message: result.error.message }
      return {
        ok: true as const,
        terminalSessionId: result.value.terminalSessionId,
        name: result.value.name ?? 'zsh',
      }
    },
    list: async (sessionId) => {
      const { result } = await api.terminals.list({ sessionId: sessionId as never })
      if (!result.ok) throw new Error(result.error.message)
      return result.value.sessions
    },
    attach: async (sessionId, terminalSessionId) => {
      const { result } = await api.terminals.attach({
        sessionId: sessionId as never,
        terminalSessionId,
      })
      if (!result.ok) return { ok: false as const, message: result.error.message }
      return { ok: true as const }
    },
    detach: async (sessionId, terminalSessionId) => {
      await api.terminals.detach({
        sessionId: sessionId as never,
        terminalSessionId,
      })
    },
    write: async (sessionId, terminalSessionId, text) => {
      await api.terminals.write({
        sessionId: sessionId as never,
        terminalSessionId,
        data: { text },
      })
    },
    resize: async (sessionId, terminalSessionId, cols, rows) => {
      await api.terminals.resize({
        sessionId: sessionId as never,
        terminalSessionId,
        cols,
        rows,
      })
    },
    closeShell: async (sessionId, terminalSessionId) => {
      await api.terminals.close({
        sessionId: sessionId as never,
        terminalSessionId,
      })
    },
    onChunk: listener => ctx.sessions.onTerminalChunk((frame) => {
      listener({
        sessionId: frame.sessionId,
        terminalSessionId: frame.terminalSessionId,
        dataBase64: frame.dataBase64,
        ...frame.overrun === true ? { overrun: true as const } : {},
      })
    }),
    resolveCwd: () => {
      const workspaces = ctx.get('workspaces')
      if (workspaces === undefined) return undefined
      const snap = workspaces.list.getSnapshot()
      const recent = snap.recentWorkspaceId
      if (recent === undefined) return undefined
      return snap.items.find(item => item.workspaceId === recent)?.path
    },
  })

  const actions = hostActions()

  ctx.slots.inject(
    'shell.overlay',
    () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'terminal-chrome',
      order: 10,
      locale: NS,
      store,
    }, TerminalChrome),
  )

  ctx.slots.inject(
    'shell.dock',
    () => ctx.slots.register({
      name: 'shell.dock',
      id: 'terminal-dock',
      order: 20,
      locale: NS,
      store,
      inject: (bound) => {
        terminalUi.attach(bound)
        return actions
      },
    }, TerminalDock),
  )

  ctx.slots.inject(
    'conversation.session.header.utilities',
    () => ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'terminal-chrome',
      order: 20,
      locale: NS,
      inject: () => ({
        toggleDock: () => { terminalUi.toggle() },
      }),
    }, TerminalAction),
  )

  ctx.slots.inject(
    'terminal.panel',
    () => ctx.slots.register({
      name: 'terminal.panel',
      locale: NS,
      inject: (): TerminalPanelActions => actions,
    }, TerminalPanel),
  )
}
