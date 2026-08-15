/**
 * Interactive PTY panel host paths: terminal.* unary methods, mux
 * session/terminal-chunk delivery, owner fencing through ctx.terminals, and
 * the durability invariant that raw bytes never enter the session event log.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import TerminalSessionService from '@deepseek-ai/dsh-terminal'
import type {
  TerminalBackend,
  TerminalBackendSession,
  TerminalReadRequest,
  TerminalSendOperation,
  TerminalSendRequest,
  TerminalSessionStatus,
  TerminalSignal,
} from '@deepseek-ai/dsh-terminal'
import type { MuxFrame, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { USER_SHELL_BACKEND_TYPE, USER_SHELL_SESSION_ID } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'

type TerminalChunkFrame = Extract<MuxFrame, { type: 'session/terminal-chunk' }>

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`term-${String(nextRpc++)}`), payload }
}

class StubSession implements TerminalBackendSession {
  readonly motd = 'stub ready'
  readonly pid = 4242
  readonly attaches: Array<(chunk: Uint8Array) => void> = []
  readonly writes: Array<string | Uint8Array> = []
  readonly resizes: Array<{ cols: number; rows: number }> = []
  statusValue: TerminalSessionStatus = { kind: 'running' }

  startSend(_request: TerminalSendRequest): TerminalSendOperation {
    return {
      done: Promise.resolve({
        viewport: '',
        waitReason: 'stdin_read',
        sessionStatus: this.statusValue,
        truncated: false,
      }),
      readOutput: () => ({ delta: '', truncated: false }),
      cancel: () => false,
    }
  }

  attach(listener: (chunk: Uint8Array) => void): () => void {
    this.attaches.push(listener)
    return () => {
      const index = this.attaches.indexOf(listener)
      if (index >= 0) this.attaches.splice(index, 1)
    }
  }

  async writeRaw(data: string | Uint8Array): Promise<void> {
    this.writes.push(data)
  }

  async resize(size: { cols: number; rows: number }): Promise<void> {
    this.resizes.push(size)
  }

  read(_request: TerminalReadRequest) {
    return { text: '', totalLines: 0, lineBegin: 0, lineEnd: 0, truncated: false }
  }

  async signal(_signal: TerminalSignal) {
    return { delivered: true as const, targetPgid: 1 }
  }

  status(): TerminalSessionStatus {
    return this.statusValue
  }

  async close(): Promise<void> {
    this.statusValue = { kind: 'exited', exitCode: 0, signal: null }
  }
}

function stubBackend(type = 'stub') {
  const sessions: StubSession[] = []
  const provider: TerminalBackend = {
    type,
    async spawn() {
      const session = new StubSession()
      sessions.push(session)
      return session
    },
  }
  return { provider, sessions }
}

async function harness(withTerminals: boolean): Promise<{
  ctx: Context
  session: Session
  agent: Agent
  backend: ReturnType<typeof stubBackend> | undefined
}> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  let backend: ReturnType<typeof stubBackend> | undefined
  if (withTerminals) {
    await ctx.plugin(TerminalSessionService)
    backend = stubBackend()
    ctx.terminals.registerBackend(backend.provider)
  }
  const session = ctx.sessions.create()
  const agent = {
    id: session.id,
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx,
  } as Agent
  ctx.agents.register(agent)
  return { ctx, session, agent, backend }
}

const api = (ctx: Context) => createApiProxy(ctx, {
  defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
  cwd: '/tmp',
})

/** Drain mux until `count` terminal-chunk frames arrive, then abort. */
async function collectChunks(
  iterable: AsyncIterable<RpcRequest<MuxFrame>>,
  count: number,
  abort: AbortController,
): Promise<TerminalChunkFrame[]> {
  const frames: MuxFrame[] = []
  for await (const envelope of iterable) {
    frames.push(envelope.payload)
    if (frames.filter(frame => frame.type === 'session/terminal-chunk').length >= count) {
      abort.abort()
    }
  }
  return frames.filter((frame): frame is TerminalChunkFrame => frame.type === 'session/terminal-chunk')
}

describe('terminal.* without the PTY seam', () => {
  it('returns terminal-unavailable when ctx.terminals is absent', async () => {
    const { ctx, session } = await harness(false)
    const proxy = api(ctx)
    const listed = await proxy.terminals.list(request({ sessionId: session.id }))
    expect(listed.result.ok).toBe(false)
    if (listed.result.ok) throw new Error('expected failure')
    expect(listed.result.error.code).toBe('terminal-unavailable')

    const attached = await proxy.terminals.attach(request({
      sessionId: session.id,
      terminalSessionId: 'pty-1',
    }))
    expect(attached.result.ok).toBe(false)
    if (attached.result.ok) throw new Error('expected failure')
    expect(attached.result.error.code).toBe('terminal-unavailable')
  })
})

describe('terminal.* via preset-isolated serviceFor', () => {
  it('lists sessions when only the agent preset mounts terminals', async () => {
    const { ctx, session, agent } = await harness(false)
    const side = new Context()
    contexts.push(side)
    // Mimic a preset isolate realm: terminals lives off the host store, but
    // still resolves the host agents registry for owner liveness.
    side.provide('agents', ctx.agents)
    await side.plugin(TerminalSessionService)
    const backend = stubBackend()
    side.terminals.registerBackend(backend.provider)
    expect(ctx.get('terminals')).toBeUndefined()
    ctx.provide('agentPresets', {
      serviceFor: (target: { ctx: Context }, name: string) => {
        if (target.ctx === agent.ctx && name === 'terminals') return side.terminals
        return undefined
      },
    } as never)

    const created = await side.terminals.spawn(agent, { type: 'stub', name: 'main' })
    const listed = await api(ctx).terminals.list(request({ sessionId: session.id }))
    expect(listed.result).toEqual({
      ok: true,
      value: {
        sessions: [{
          terminalSessionId: String(created.sessionId),
          name: 'main',
          type: 'stub',
          pid: 4242,
          status: { kind: 'running' },
        }],
      },
    })
  })
})

describe('terminal.* with owner-scoped stub sessions', () => {
  it('lists, attaches, writes, resizes, and pushes mux chunks without logging raw bytes', async () => {
    const { ctx, session, agent, backend } = await harness(true)
    if (backend === undefined) throw new Error('missing backend')
    const proxy = api(ctx)
    const created = await ctx.terminals.spawn(agent, { type: 'stub', name: 'main' })
    const listed = await proxy.terminals.list(request({ sessionId: session.id }))
    expect(listed.result).toEqual({
      ok: true,
      value: {
        sessions: [{
          terminalSessionId: String(created.sessionId),
          name: 'main',
          type: 'stub',
          pid: 4242,
          status: { kind: 'running' },
        }],
      },
    })

    const abort = new AbortController()
    const stream = proxy.events.mux({ rpcId: RpcId('term-mux'), payload: {} }, abort.signal)
    const chunksPromise = collectChunks(stream, 1, abort)

    const attached = await proxy.terminals.attach(request({
      sessionId: session.id,
      terminalSessionId: String(created.sessionId),
    }))
    expect(attached.result).toEqual({ ok: true, value: { attached: true } })
    expect(backend.sessions[0]!.attaches).toHaveLength(1)

    const secret = 'password-from-ui\n'
    backend.sessions[0]!.attaches[0]!(Buffer.from(secret, 'utf8'))
    const [chunk] = await chunksPromise
    expect(chunk).toMatchObject({
      type: 'session/terminal-chunk',
      sessionId: session.id,
      terminalSessionId: String(created.sessionId),
      seq: 1,
      dataBase64: Buffer.from(secret, 'utf8').toString('base64'),
    })

    const written = await proxy.terminals.write(request({
      sessionId: session.id,
      terminalSessionId: String(created.sessionId),
      data: { text: 'ls\n' },
    }))
    expect(written.result).toEqual({ ok: true, value: { ok: true } })
    expect(Buffer.from(backend.sessions[0]!.writes[0] as Uint8Array).toString('utf8')).toBe('ls\n')

    const resized = await proxy.terminals.resize(request({
      sessionId: session.id,
      terminalSessionId: String(created.sessionId),
      cols: 120,
      rows: 40,
    }))
    expect(resized.result).toEqual({ ok: true, value: { ok: true } })
    expect(backend.sessions[0]!.resizes).toEqual([{ cols: 120, rows: 40 }])

    const detached = await proxy.terminals.detach(request({
      sessionId: session.id,
      terminalSessionId: String(created.sessionId),
    }))
    expect(detached.result).toEqual({ ok: true, value: { detached: true } })
    expect(backend.sessions[0]!.attaches).toHaveLength(0)

    // Durability invariant: interactive bytes must not appear in the session log.
    const serialized = JSON.stringify(session.events)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('ls\n')
    expect(serialized).not.toContain(chunk!.dataBase64)
  })

  it('rejects attach for a foreign agent session id', async () => {
    const { ctx, agent, backend } = await harness(true)
    if (backend === undefined) throw new Error('missing backend')
    const proxy = api(ctx)
    const created = await ctx.terminals.spawn(agent, { type: 'stub' })

    const other = ctx.sessions.create()
    ctx.agents.register({
      id: other.id,
      session: other,
      inbox: new Inbox(other, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
      status: 'idle',
      ctx,
    } as Agent)

    const attached = await proxy.terminals.attach(request({
      sessionId: other.id,
      terminalSessionId: String(created.sessionId),
    }))
    expect(attached.result.ok).toBe(false)
    if (attached.result.ok) throw new Error('expected failure')
    expect(attached.result.error.code).toBe('terminal-unavailable')
  })
})

describe('terminal.open Host user shell', () => {
  it('spawns without a chat session and lists under USER_SHELL_SESSION_ID', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SessionStore)
    await ctx.plugin(UserQuestionService)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(TerminalSessionService)
    const backend = stubBackend(USER_SHELL_BACKEND_TYPE)
    ctx.terminals.registerBackend(backend.provider)
    const proxy = api(ctx)

    const opened = await proxy.terminals.open(request({ name: 'zsh' }))
    expect(opened.result).toEqual({
      ok: true,
      value: {
        sessionId: USER_SHELL_SESSION_ID,
        terminalSessionId: expect.stringMatching(/^pty-/),
        name: 'zsh',
        type: USER_SHELL_BACKEND_TYPE,
      },
    })
    if (!opened.result.ok) throw new Error('expected open')

    const listed = await proxy.terminals.list(request({ sessionId: USER_SHELL_SESSION_ID }))
    expect(listed.result).toEqual({
      ok: true,
      value: {
        sessions: [{
          terminalSessionId: opened.result.value.terminalSessionId,
          name: 'zsh',
          type: USER_SHELL_BACKEND_TYPE,
          pid: 4242,
          status: { kind: 'running' },
        }],
      },
    })

    // Detached owner must not pollute the chat session list.
    expect(ctx.sessions.list().map(session => session.id)).not.toContain(USER_SHELL_SESSION_ID)

    const closed = await proxy.terminals.close(request({
      sessionId: USER_SHELL_SESSION_ID,
      terminalSessionId: opened.result.value.terminalSessionId,
    }))
    expect(closed.result).toEqual({ ok: true, value: { closed: true } })
  })
})
