/**
 * Fixed top-right chrome cluster: brand lock + Terminal toggle.
 * Hidden while a live (non-blank) session shows the header utilities twin so
 * the control does not stack on Session log.
 */

import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { BrandWordmark, IconTerminalOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { createTerminalPanelStore } from './store.ts'
import { NS } from './locales.ts'
import css from './TerminalPanel.module.css'

/** Full props for the shell chrome terminal trigger. */
export type TerminalChromeProps =
  & PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & PropsStore<ReturnType<typeof createTerminalPanelStore>>

/**
 * Always-visible brand + Terminal icon in the window chrome (top-right) on the hero.
 * @param props - runtime, store, and locale seats.
 * @returns the chrome cluster, or null while a live session owns the utilities seat.
 */
export function TerminalChrome({ useStore, useSessions, actions, t }: TerminalChromeProps) {
  const open = useStore(s => s.open)
  const liveSession = useSessions((s) => {
    const current = s.current
    if (current === undefined) return false
    return s.byId[current]?.blank === false
  })
  if (liveSession) return null

  const label = open ? t('action.close') : t('action.open')
  return (
    <div className={css.chromeCluster} data-testid="terminal-chrome-cluster">
      <BrandWordmark className={css.chromeBrand} size={24} />
      <Tooltip label={label} side="bottom" delayMs={500}>
        <button
          type="button"
          className={css.chrome}
          data-active={open ? 'true' : 'false'}
          data-testid="terminal-chrome-action"
          aria-label={label}
          aria-pressed={open}
          onClick={() => { actions.toggle() }}
        >
          <IconTerminalOutline16 size={16} />
        </button>
      </Tooltip>
    </div>
  )
}
