/**
 * Browser-facing interactive PTY panel contract. Unary methods list and drive
 * owner-scoped sessions; raw byte chunks ride `session/terminal-chunk` mux
 * frames and are never written to the session event log.
 *
 * Host-owned user shells use {@link USER_SHELL_SESSION_ID} so the UI can open a
 * PTY without a chat session or model `terminal_open`.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RpcRequest, RpcResponse } from './rpc.ts'

/**
 * Synthetic session identity for Host-owned interactive user shells.
 * Never enters `session.list` / workspace UI — only wires terminal.* and mux chunks.
 */
export const USER_SHELL_SESSION_ID = '__dsh_user_shell__' as SessionId

/** Backend type registered by the Host `user-shell` terminal-bash row. */
export const USER_SHELL_BACKEND_TYPE = 'user-shell'

/** Owner-visible PTY session summary for the interactive panel. */
export interface TerminalUiSessionView {
  /** Registry-minted PTY identity (`pty-N`). */
  terminalSessionId: string
  /** Optional owner-local display name. */
  name?: string
  /** Backend type that created the session. */
  type: string
  /** Top-level process id when the backend has one. */
  pid?: number
  /** Current top-level process status. */
  status:
    | { kind: 'running' }
    | { kind: 'exited'; exitCode: number | null; signal: string | null }
}

/** Write payload: UTF-8 text and/or raw base64 bytes (at least one required). */
export type TerminalUiWriteData =
  | { text: string; dataBase64?: string }
  | { text?: string; dataBase64: string }

/** Terminal-domain unary methods for the interactive Web panel. */
export interface TerminalsApi {
  /**
   * Spawn a Host-owned interactive user shell (no chat session required).
   * @param request - optional cwd/name; defaults to the Host workspace cwd.
   */
  open(
    request: RpcRequest<{ cwd?: string; name?: string }>,
  ): Promise<RpcResponse<{
    sessionId: SessionId
    terminalSessionId: string
    name?: string
    type: string
  }>>

  /**
   * List PTY sessions owned by the live Agent of this browser session, or by
   * the Host user-shell owner when {@link USER_SHELL_SESSION_ID} is addressed.
   * @param request - browser session identity.
   */
  list(
    request: RpcRequest<{ sessionId: SessionId }>,
  ): Promise<RpcResponse<{ sessions: TerminalUiSessionView[] }>>

  /**
   * Start a raw-byte subscription for one owned PTY; Host pushes
   * `session/terminal-chunk` frames on the mux stream.
   * @param request - browser session and PTY identities.
   */
  attach(
    request: RpcRequest<{ sessionId: SessionId; terminalSessionId: string }>,
  ): Promise<RpcResponse<{ attached: true }>>

  /**
   * End a raw-byte subscription started by {@link attach}.
   * @param request - browser session and PTY identities.
   */
  detach(
    request: RpcRequest<{ sessionId: SessionId; terminalSessionId: string }>,
  ): Promise<RpcResponse<{ detached: true }>>

  /**
   * Write keyboard bytes without a readiness wait (authority matches
   * `terminal_send` with `submit: false`).
   * @param request - browser session, PTY identity, and write payload.
   */
  write(
    request: RpcRequest<{
      sessionId: SessionId
      terminalSessionId: string
      data: TerminalUiWriteData
    }>,
  ): Promise<RpcResponse<{ ok: true }>>

  /**
   * Resize one owned PTY's geometry.
   * @param request - browser session, PTY identity, and positive cols/rows.
   */
  resize(
    request: RpcRequest<{
      sessionId: SessionId
      terminalSessionId: string
      cols: number
      rows: number
    }>,
  ): Promise<RpcResponse<{ ok: true }>>

  /**
   * Close one owned PTY and await process-tree quiescence.
   * @param request - browser session and PTY identities.
   */
  close(
    request: RpcRequest<{ sessionId: SessionId; terminalSessionId: string }>,
  ): Promise<RpcResponse<{ closed: true }>>
}
