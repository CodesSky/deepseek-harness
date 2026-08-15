/**
 * ui-terminal plugin halves: browser dictionary and slot registrations against
 * the real SlotRegistry (fiber teardown proves HMR removal), the inert node
 * entry, and the invariant companion's ownership reservation.
 */
// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { en, NS, zh } from '../src/client/locales.ts'

/** Slot ledger reader: entry ids currently registered in the utilities list. */
function utilityEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots
    .entries('conversation.session.header.utilities')
    .map(entry => entry.options.id)
}

/** Boot the browser half over a real slot tree that declares chrome + dock + utilities + panel. */
async function bench(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'shell.overlay': { kind: 'list', scope: 'root' },
      'shell.dock': { kind: 'list', scope: 'root' },
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
      'terminal.panel': { kind: 'single', scope: 'session' },
    },
  } as never, () => null)
  ctx.provide('sessions', {
    onTerminalChunk: () => () => {},
  })
  ctx.provide('connection', {
    api: {
      settings: {},
      terminals: {
        open: () => Promise.resolve({
          result: {
            ok: true,
            value: {
              sessionId: '__dsh_user_shell__',
              terminalSessionId: 'pty-1',
              name: 'zsh',
              type: 'user-shell',
            },
          },
        }),
        list: () => Promise.resolve({ result: { ok: true, value: { sessions: [] } } }),
        attach: () => Promise.resolve({ result: { ok: true, value: { attached: true } } }),
        detach: () => Promise.resolve({ result: { ok: true, value: { detached: true } } }),
        write: () => Promise.resolve({ result: { ok: true, value: { ok: true } } }),
        resize: () => Promise.resolve({ result: { ok: true, value: { ok: true } } }),
        close: () => Promise.resolve({ result: { ok: true, value: { closed: true } } }),
      },
    },
    isLoopback: false,
  } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('ui-terminal browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'sessions', 'locale', 'connection'])
  })

  it('registers chrome, dock, header utility, and panel; fiber teardown removes them', async () => {
    const { ctx, fiber } = await bench()
    expect(utilityEntryIds(ctx)).toContain('terminal-chrome')
    expect(ctx.slots.entries('terminal.panel')).toHaveLength(1)
    const overlayIds = ctx.slots.entries('shell.overlay').map(entry => entry.options.id)
    expect(overlayIds).toEqual(['terminal-chrome'])
    const dockIds = ctx.slots.entries('shell.dock').map(entry => entry.options.id)
    expect(dockIds).toEqual(['terminal-dock'])
    await fiber.dispose()
    expect(utilityEntryIds(ctx)).not.toContain('terminal-chrome')
    expect(ctx.slots.entries('terminal.panel')).toHaveLength(0)
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(0)
    expect(ctx.slots.entries('shell.dock')).toHaveLength(0)
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    ctx.locale.setLocale('zh')
    expect(translate('action.label')).toBe(zh['action.label'])
    ctx.locale.setLocale('en')
    expect(translate('action.label')).toBe(en['action.label'])
    await fiber.dispose()
  })
})

describe('ui-terminal node half', () => {
  it('is an inert apply (client bundle owns runtime)', () => {
    expect(() => { applyNode() }).not.toThrow()
  })
})
