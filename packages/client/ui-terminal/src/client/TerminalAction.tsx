/**
 * Session-header utility cluster: brand lock + Terminal toggle.
 * Lives in `conversation.session.header.utilities` beside Session log (flex/gap).
 * Dock state stays on the root overlay store; this seat reaches toggle via terminalUi.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { BrandWordmark, IconTerminalOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { NS } from './locales.ts'
import css from './TerminalPanel.module.css'

/** Injected dock toggle from ctx.terminalUi. */
export interface TerminalActionInjected {
  /** Toggle the bottom dock. */
  toggleDock: () => void
}

/** Full props for the header utilities terminal action. */
export type TerminalActionProps =
  & PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<TerminalActionInjected>

/**
 * Brand lock and Terminal icon in the session header utilities row (right of Session log).
 * @param props - runtime, locale, and dock toggle.
 * @returns the utilities cluster, or null on blank hero sessions.
 */
export function TerminalAction({ useSession, toggleDock, t }: TerminalActionProps) {
  const blank = useSession(s => s.blank)
  if (blank) return null

  const label = t('action.open')
  return (
    <div className={css.chromeClusterInline} data-testid="terminal-chrome-cluster">
      <BrandWordmark className={css.chromeBrand} size={24} />
      <Tooltip label={label} side="bottom" delayMs={500}>
        <button
          type="button"
          className={css.chromeUtility}
          data-testid="terminal-chrome-action"
          aria-label={label}
          onClick={() => { toggleDock() }}
        >
          <IconTerminalOutline16 size={16} />
        </button>
      </Tooltip>
    </div>
  )
}
