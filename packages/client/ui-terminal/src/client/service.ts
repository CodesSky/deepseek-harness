/**
 * Cross-plugin terminal dock face behind ctx.terminalUi.
 * Dock geometry/state lives in the root shell.dock store; session-scoped
 * header utilities reach toggle/open/close through this controller.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { createTerminalPanelStore } from './store.ts'

/** Bound action set of the root dock store. */
export type TerminalUiActions = BoundActions<ReturnType<typeof createTerminalPanelStore>>

/** Outward face other plugins may call for dock transitions. */
export interface ITerminalUi {
  /** Open the bottom dock. */
  open(): void
  /** Close the bottom dock. */
  close(): void
  /** Toggle the bottom dock. */
  toggle(): void
}

/** Concrete controller wired from the dock registration's inject hook. */
export class TerminalUiController implements ITerminalUi {
  #actions: TerminalUiActions | undefined

  /**
   * Adopt the root dock store's bound actions.
   * @param actions - bound actions from the shell.dock registration.
   */
  attach(actions: TerminalUiActions): void {
    this.#actions = actions
  }

  /** Open the bottom dock. */
  open(): void {
    this.#require().open()
  }

  /** Close the bottom dock. */
  close(): void {
    this.#require().close()
  }

  /** Toggle the bottom dock. */
  toggle(): void {
    this.#require().toggle()
  }

  #require(): TerminalUiActions {
    if (this.#actions === undefined) {
      throw new Error('terminalUi: dock actions not wired (shell.dock not mounted)')
    }
    return this.#actions
  }
}
