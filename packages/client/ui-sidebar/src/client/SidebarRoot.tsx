/**
 * Sidebar shell: column geometry only. Collapse is a slide plus crossfade:
 * content freezes at its expanded width (inline style) and fades out in place
 * while the sliding column (AppFrame grid tracks) clips it — nothing reflows
 * mid-slide. At settle the wide-only content unmounts, the column width is zero,
 * and the panel toggle plus New Session escape as fixed top-bar chrome
 * (traffic-light peers on macOS; top-left on browser). Workspace/settings
 * seats stay mounted under the column for state but are not painted while
 * collapsed — expand restores them. The workspace/session browsing region
 * between the New Session button and the foot is the `sidebar.workspaces`
 * registrant's, and the foot holds `sidebar.settings` plus
 * `sidebar.footer.action`; the shell hands them the wide flag (plus an expand
 * request callback for the browser).
 *
 * The column also owns whether the scroll regions nested in it draw a
 * scrollbar at all: the shell tracks the pointer and rebinds ui-theme's
 * scrollbar indirection away while it is elsewhere, so a list the user is
 * not pointing at carries no bar.
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconNewChatOutline16,
  IconPanelLeftCollapseOutline16,
  IconPanelLeftExpandOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarRootComponentProps } from './contract/slots.ts'
import css from './SidebarRoot.module.css'

/** Wide-content unmount delay; matches the 150ms wide-content fade-out. */
const COLLAPSE_SETTLE_MS = 150

/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 * The bar is a pointer affordance here, and hiding it on the leave event
 * itself makes it blink out while the pointer is only crossing the column's
 * edge — on the way to the conversation, or around a portalled menu.
 */
const SCROLLBAR_LINGER_MS = 2000

/**
 * Render the sidebar column shell.
 * @param props - composed slot props (runtime share + injected callbacks, contract/slots.ts).
 * @returns the sidebar element tree.
 */
export function SidebarRoot({
  collapsed,
  width,
  startSession,
  toggleSidebar,
  t,
  renderSlot,
}: SidebarRootComponentProps) {
  // Wide content stays mounted while the collapse animates (fading via
  // .collapsed .wide), unmounts at settle, and remounts right away on expand.
  const [settled, setSettled] = useState(collapsed)
  useEffect(() => {
    if (!collapsed) { setSettled(false); return }
    const timer = window.setTimeout(() => { setSettled(true) }, COLLAPSE_SETTLE_MS)
    return () => { window.clearTimeout(timer) }
  }, [collapsed])
  const wide = !collapsed || !settled

  // Freeze the content at its expanded width while it fades out (collapsed
  // && wide): the sliding column then clips it instead of reflowing it.
  // Settled collapsed uses zero column width from AppFrame (no inline style).
  const lastWideWidth = useRef(width)
  if (!collapsed) lastWideWidth.current = width

  // Chrome-in only crossfades a live collapse: a refresh straight into the
  // collapsed state renders the fixed chrome statically.
  const everWide = useRef(!collapsed)
  if (!collapsed) everWide.current = true

  // Scrollbars in the column follow the pointer (.quietBars rebinds them
  // away): drawn while it is inside, and for SCROLLBAR_LINGER_MS after it
  // leaves. A pointer that returns within that window cancels the pending
  // hide rather than restarting from a hidden bar.
  const column = useRef<HTMLDivElement>(null)
  const [pointerInside, setPointerInside] = useState(false)
  const lingerTimer = useRef<number | undefined>(undefined)
  const armLinger = (): void => {
    if (lingerTimer.current !== undefined) return
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = undefined
      setPointerInside(false)
    }, SCROLLBAR_LINGER_MS)
  }
  const cancelLinger = (): void => {
    window.clearTimeout(lingerTimer.current)
    lingerTimer.current = undefined
  }
  // Leaving is decided by the column's BOX, not by DOM containment, and only
  // while the bars are drawn. ui-settings renders its full-viewport panel as a
  // fixed-position DESCENDANT of this column, so a pointer moved onto that
  // panel — or onto the conversation once it closes — fires no `pointerleave`
  // here, and the bars would stay drawn over a column nobody is pointing at.
  // The element's own leave stays as the one signal geometry cannot give: a
  // pointer that leaves the window emits no further moves.
  useEffect(() => {
    if (!pointerInside) return
    const onMove = (event: PointerEvent): void => {
      const rect = column.current?.getBoundingClientRect()
      /* v8 ignore next -- the listener only exists while the column is mounted and revealed. */
      if (rect === undefined) return
      const inside = event.clientX >= rect.left && event.clientX < rect.right
        && event.clientY >= rect.top && event.clientY < rect.bottom
      if (inside) cancelLinger()
      else armLinger()
    }
    document.addEventListener('pointermove', onMove)
    return () => {
      document.removeEventListener('pointermove', onMove)
      cancelLinger()
    }
  }, [pointerInside])

  return (
    <div
      ref={column}
      className={clsx(
        css.root, !wide && css.collapsed, !wide && everWide.current && css.chromeIn,
        collapsed && wide && css.fading, !pointerInside && css.quietBars,
      )}
      style={wide ? { width: collapsed ? lastWideWidth.current : width } : undefined}
      onPointerEnter={() => {
        cancelLinger()
        setPointerInside(true)
      }}
      onPointerLeave={() => { armLinger() }}
    >
      <div className={css.logoRow} data-dsh-drag-chrome="deep">
        {/* Brand wordmark lives top-right beside Terminal chrome (ui-terminal).
            Expanded browser: toggle stays in-flow here. macOS overlay: CSS
            pins it fixed beside the traffic lights. Collapsed (every channel):
            toggle + New Session pin as top-bar chrome while the column is 0. */}
        <Tooltip
          label={collapsed ? t('toggle.open') : t('toggle.collapse')}
          side="bottom"
          delayMs={500}
        >
          <button
            type="button"
            className={clsx(css.iconButton, css.toggle)}
            aria-label={collapsed ? t('toggle.open') : t('toggle.collapse')}
            onClick={() => { toggleSidebar() }}
          >
            {collapsed
              ? <IconPanelLeftExpandOutline16 className={css.panelIcon} size={16} />
              : <IconPanelLeftCollapseOutline16 className={css.panelIcon} size={16} />}
          </button>
        </Tooltip>
        {/* Collapsed only: New Session rides the toggle's right edge so the
            expanded capsule is not duplicated. */}
        {!wide && (
          <Tooltip label={t('session.new.label')} side="bottom" delayMs={500}>
            <button
              type="button"
              className={clsx(css.iconButton, css.collapsedNewSession)}
              aria-label={t('session.new.label')}
              onClick={() => { startSession() }}
            >
              <IconNewChatOutline16 size={16} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Expanded capsule — tooltip only when the label is absent (rail path). */}
      {wide && (
        <Tooltip label={t('session.new.label')} side="bottom" delayMs={500} disabled>
          <button
            type="button"
            className={css.newSession}
            aria-label={t('session.new.label')}
            onClick={() => { startSession() }}
          >
            <IconNewChatOutline16 size={14} />
            <span className={clsx(css.newSessionLabel, css.wide)}>{t('session.new')}</span>
          </button>
        </Tooltip>
      )}

      {/* The browsing region fills the column between the controls and the
          foot while wide; collapsed keeps the seats mounted but unpainted. */}
      <div className={css.regionArea}>
        {renderSlot('sidebar.workspaces', {
          wide,
          expandSidebar: () => { if (collapsed) toggleSidebar() },
        })}
      </div>

      {/* Footer actions stack above Settings in both sidebar widths. */}
      <div className={css.footArea}>
        <div className={css.footerActions}>
          {renderSlot('sidebar.footer.action', { wide })}
        </div>
        <div className={css.settingsArea}>
          {renderSlot('sidebar.settings', { wide })}
        </div>
      </div>
    </div>
  )
}
