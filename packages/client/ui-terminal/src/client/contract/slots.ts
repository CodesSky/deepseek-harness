/**
 * Inject face and slot contracts for the interactive terminal panel.
 */

import type { TerminalUiSessionView } from '@deepseek-ai/dsh-host-apiproxy/api'

/** Session row returned by terminal.list for the panel picker. */
export type TerminalPanelSession = TerminalUiSessionView

/** Injected Host verbs and chunk subscription for user-shell + session panels. */
export interface TerminalPanelActions {
  /** Spawn a Host-owned interactive user shell (no chat session required). */
  openShell: (cwd?: string) => Promise<{
    ok: true
    terminalSessionId: string
    name: string
  } | { ok: false; message: string }>
  /** List owner-visible PTY sessions for one wire session id. */
  list: (sessionId: string) => Promise<TerminalPanelSession[]>
  /** Attach raw-byte streaming for one PTY. */
  attach: (sessionId: string, terminalSessionId: string) => Promise<{ ok: true } | { ok: false; message: string }>
  /** Detach the current raw-byte subscription. */
  detach: (sessionId: string, terminalSessionId: string) => Promise<void>
  /** Write keyboard input to the attached PTY. */
  write: (sessionId: string, terminalSessionId: string, text: string) => Promise<void>
  /** Resize the attached PTY. */
  resize: (sessionId: string, terminalSessionId: string, cols: number, rows: number) => Promise<void>
  /** Close one PTY and await process-tree quiescence. */
  closeShell: (sessionId: string, terminalSessionId: string) => Promise<void>
  /**
   * Subscribe to mux terminal chunks.
   * @param listener - receives session id, base64 data, and optional overrun.
   * @returns disposer.
   */
  onChunk: (
    listener: (chunk: {
      sessionId: string
      terminalSessionId: string
      dataBase64: string
      overrun?: true
    }) => void,
  ) => () => void
  /** Resolve a default cwd for a new user shell (workspace path when known). */
  resolveCwd: () => string | undefined
}
